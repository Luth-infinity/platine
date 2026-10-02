// Extension Spicetify de Platine : garde une playlist à l'image des fichiers
// locaux de Spotify. L'API publique de Spotify refuse les fichiers locaux ;
// cette extension passe par les fonctions internes de l'app de bureau, celles
// qu'elle utilise quand on glisse un fichier local dans une playlist.
// Les consignes (playlists voulues) viennent de Platine quand elle tourne ;
// sinon l'extension s'en tient aux réglages écrits à l'installation.

;(function platine() {
  const PLATINE = 'http://127.0.0.1:47321'
  const DEFAUT = { generale: '__NOM_PLAYLIST__', parAlbum: '__PAR_ALBUM__' === 'oui', perso: [] }
  const norme = (t) => (t || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]/g, '')
  const cle = (titre, artiste) => `${norme(titre)}|${norme(artiste)}`
  const P = window.Spicetify?.Platform
  if (!P?.LocalFilesAPI || !P?.RootlistAPI || !P?.PlaylistAPI || !window.Spicetify?.showNotification) {
    setTimeout(platine, 1000)
    return
  }

  const aplatir = (items = []) => items.flatMap((i) => (i.type === 'folder' ? aplatir(i.items) : [i]))

  // Identifiant Platine → playlist Spotify, gardé dans Spotify. C'est ce qui
  // permet de renommer la playlist au lieu d'en créer une nouvelle.
  const LIENS = 'platine-playlists'
  const liens = () => {
    try {
      return JSON.parse(localStorage.getItem(LIENS) || '{}')
    } catch {
      return {}
    }
  }
  const lier = (id, uri) => localStorage.setItem(LIENS, JSON.stringify({ ...liens(), [id]: uri }))
  const delier = (id) => {
    const l = liens()
    delete l[id]
    localStorage.setItem(LIENS, JSON.stringify(l))
  }

  async function trouverPlaylist(nom, id) {
    const toutes = aplatir((await P.RootlistAPI.getContents()).items).filter((i) => i.type === 'playlist')
    const liee = id && toutes.find((i) => i.uri === liens()[id])
    if (liee) {
      if (liee.name !== nom) await P.PlaylistAPI.setAttributes(liee.uri, { name: nom })
      return liee.uri
    }
    const existante = toutes.find((i) => i.name === nom)
    let uri = existante?.uri
    if (!uri) {
      const creee = await P.RootlistAPI.createPlaylist(nom, { before: 'start' })
      uri = typeof creee === 'string' ? creee : creee?.uri
    }
    if (id && uri) lier(id, uri)
    return uri
  }

  async function supprimer(id, nom) {
    const toutes = aplatir((await P.RootlistAPI.getContents()).items).filter((i) => i.type === 'playlist')
    // Seulement une playlist créée ou reprise par Platine : jamais une autre
    // playlist qui porterait le même nom.
    const cible = toutes.find((i) => i.uri === liens()[id])
    if (cible) await P.RootlistAPI.remove([{ uri: cible.uri }])
    delier(id)
  }

  async function contenu(uri) {
    const tout = []
    for (let offset = 0; ; offset += 100) {
      const page = await P.PlaylistAPI.getContents(uri, { limit: 100, offset })
      const items = page?.items ?? []
      tout.push(...items)
      if (items.length < 100) return tout
    }
  }

  // Un morceau local est identifié par artiste:album:titre:durée. Spotify
  // range parfois une durée différente dans la playlist (0 au lieu de -1 pour
  // un fichier pas encore analysé) : on compare donc sans la durée.
  const cleUri = (u) => u.replace(/:-?\d+$/, '')
  // Coupe-circuit : un morceau qui ne « prend » pas après deux ajouts n'est
  // plus retenté avant le prochain démarrage de Spotify.
  const essais = new Map()

  const reconstruites = new Set()
  let illisibles = []

  async function reconstruire(nom, uris, id, ancienne) {
    const creee = await P.RootlistAPI.createPlaylist(nom, { before: 'start' })
    const nouvelle = typeof creee === 'string' ? creee : creee?.uri
    if (!nouvelle) return 0
    for (let i = 0; i < uris.length; i += 100) await P.PlaylistAPI.add(nouvelle, uris.slice(i, i + 100), { after: 'end' })
    lier(id, nouvelle)
    await P.RootlistAPI.remove([{ uri: ancienne }])
    Spicetify.showNotification(`« ${nom} » reconstruite. Re-télécharge-la sur ton téléphone.`)
    return uris.length
  }

  // Aligne une playlist sur une liste de morceaux locaux ; renvoie le nombre d'ajouts.
  async function aligner(nom, uris, id) {
    const uri = await trouverPlaylist(nom, id)
    if (!uri) return 0
    const presents = await contenu(uri)
    const voulus = new Set(uris.map(cleUri))
    const gardes = new Set()
    const aRetirer = []
    for (const item of presents) {
      if (!item.uri.startsWith('spotify:local:')) continue
      const k = cleUri(item.uri)
      // Hors du dossier, en double, ou illisible : on retire.
      if (!voulus.has(k) || gardes.has(k) || item.isPlayable === false) aRetirer.push({ uri: item.uri, uid: item.uid })
      else gardes.add(k)
    }
    if (aRetirer.length) {
      await P.PlaylistAPI.remove(uri, aRetirer)
      // Spotify refuse parfois de retirer ces entrées. Dans ce cas, on
      // reconstruit la playlist une fois : même nom, bons morceaux.
      const restants = (await contenu(uri)).filter((i) => aRetirer.some((r) => r.uid === i.uid))
      if (restants.length && id && !reconstruites.has(id)) {
        reconstruites.add(id)
        return reconstruire(nom, uris, id, uri)
      }
    }

    // Morceaux que Spotify n'arrive pas à lire dans cette playlist (diagnostic).
    illisibles.push(...presents.filter((i) => i.uri.startsWith('spotify:local:') && i.isPlayable === false).map((i) => `${nom} → ${i.name || i.uri}`))

    const manquants = uris.filter((u) => {
      const k = cleUri(u)
      if (gardes.has(k)) return false
      const n = essais.get(`${nom}|${k}`) || 0
      if (n >= 2) return false
      essais.set(`${nom}|${k}`, n + 1)
      return true
    })
    for (let i = 0; i < manquants.length; i += 100) await P.PlaylistAPI.add(uri, manquants.slice(i, i + 100), { after: 'end' })
    return manquants.length
  }

  // Fichiers locaux exploitables : analysés par Spotify (durée connue) et
  // sans doublon (Spotify liste parfois deux fois un fichier en cours d'analyse).
  function utilisables(locaux) {
    const vus = new Set()
    return locaux.filter((t) => {
      if (/:(-1|0)$/.test(t.uri)) return false
      const k = cleUri(t.uri)
      if (vus.has(k)) return false
      vus.add(k)
      return true
    })
  }

  async function consignes() {
    try {
      const r = await fetch(`${PLATINE}/consignes`)
      if (r.ok) return { ...(await r.json()), liee: true }
    } catch {}
    return { ...DEFAUT, liee: false }
  }

  let enCours = false
  async function synchroniser() {
    if (enCours) return
    enCours = true
    try {
      const c = await consignes()
      let locaux = utilisables(await P.LocalFilesAPI.getTracks())
      // Spotify garde en mémoire les anciennes versions d'un fichier dont
      // Platine a corrigé les infos. Quand Platine répond, on ne garde que
      // les morceaux qui correspondent à un vrai fichier du dossier.
      if (c.liee && Array.isArray(c.pistes)) {
        // Pour chaque vrai fichier, la version de Spotify qui lui correspond le
        // mieux : même album d'abord, puis celle qui a une pochette. Les autres
        // sont des souvenirs d'anciennes infos, que le téléphone ne peut pas
        // télécharger.
        const meilleures = []
        for (const p of c.pistes) {
          const k = cle(p.titre, p.artiste)
          const candidats = locaux.filter((t) => cle(t.name, t.artists?.[0]?.name) === k)
          if (!candidats.length) continue
          const score = (t) => (norme(t.album?.name) === norme(p.album) ? 2 : 0) + (t.album?.images?.length ? 1 : 0)
          meilleures.push(candidats.sort((a, b) => score(b) - score(a))[0])
        }
        locaux = meilleures
      }
      illisibles = []
      const rapport = { vu: Date.now(), locaux: locaux.length, playlists: [], supprimees: [] }

      // Playlists supprimées dans Platine.
      for (const s of c.supprimees || []) {
        await supprimer(s.cle || `perso:${s.id}`, s.nom)
        rapport.supprimees.push(s.id)
      }

      const n = await aligner(c.generale, locaux.map((t) => t.uri), 'generale')
      if (n) Spicetify.showNotification(`${n} morceau${n > 1 ? 'x' : ''} ajouté${n > 1 ? 's' : ''} à « ${c.generale} »`)
      rapport.playlists.push({ nom: c.generale, type: 'generale', nb: locaux.length })

      if (c.parAlbum) {
        // Une playlist par album dès que deux morceaux partagent le même.
        const albums = new Map()
        for (const t of locaux) {
          const album = (t.album?.name || '').trim()
          // Une playlist à toi qui porte le nom de l'album prend le dessus.
          if (!album || album === c.generale || (c.perso || []).some((p) => p.nom === album)) continue
          if ((c.albumsMasques || []).includes(album)) continue
          if (!albums.has(album)) albums.set(album, [])
          albums.get(album).push(t)
        }
        for (const [album, pistes] of albums) {
          if (pistes.length < 2) continue
          pistes.sort((a, b) => (a.discNumber ?? 0) - (b.discNumber ?? 0) || (a.trackNumber ?? 0) - (b.trackNumber ?? 0))
          await aligner(album, pistes.map((t) => t.uri), `album:${album}`)
          rapport.playlists.push({ nom: album, type: 'album', nb: pistes.length })
        }
      }

      // Tes playlists : Platine donne titre + artiste, on retrouve le
      // morceau local correspondant (son identifiant Spotify en dépend).
      const parCle = new Map(locaux.map((t) => [cle(t.name, t.artists?.[0]?.name), t.uri]))
      for (const p of c.perso || []) {
        const uris = []
        const manquants = []
        for (const piste of p.pistes) {
          const uri = parCle.get(cle(piste.titre, piste.artiste))
          if (uri) uris.push(uri)
          else manquants.push(piste.titre)
        }
        await aligner(p.nom, uris, p.id && `perso:${p.id}`)
        rapport.playlists.push({ nom: p.nom, type: 'perso', nb: uris.length, manquants })
      }

      // Images de playlists choisies dans Platine : envoyées une fois par version.
      const POSEES = 'platine-pochettes'
      const posees = JSON.parse(localStorage.getItem(POSEES) || '{}')
      for (const { cle, version } of c.pochettes || []) {
        const uri = liens()[cle]
        if (!uri || posees[cle] === version) continue
        try {
          const blob = await (await fetch(`${PLATINE}/pochette/${encodeURIComponent(cle)}`)).blob()
          const jeton = await P.PlaylistAPI.uploadImage(new File([blob], 'pochette.jpg', { type: 'image/jpeg' }))
          if (!jeton) throw new Error('Spotify n’a pas accepté l’image')
          await P.PlaylistAPI.updateDetails(uri, { imageUploadToken: jeton })
          posees[cle] = version
          localStorage.setItem(POSEES, JSON.stringify(posees))
        } catch (err) {
          rapport.erreurPochette = `${cle} : ${err?.message || err}`
        }
      }
      rapport.pochettes = Object.keys(posees)
      rapport.illisibles = illisibles

      // Les playlists reliées à Platine qui existent vraiment dans Spotify.
      const reliees = new Set(Object.values(liens()))
      rapport.dansSpotify = aplatir((await P.RootlistAPI.getContents()).items)
        .filter((i) => i.type === 'playlist' && reliees.has(i.uri))
        .map((i) => i.name)

      if (c.liee) {
        await fetch(`${PLATINE}/rapport`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(rapport) }).catch(() => {})
      }
    } catch (err) {
      console.error('[Platine]', err)
      // Remonte l'erreur à Platine, qui l'affiche au lieu de rester muette.
      fetch(`${PLATINE}/rapport`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ vu: Date.now(), erreur: String(err?.stack || err) }) }).catch(() => {})
    } finally {
      enCours = false
    }
  }

  // Platine prévient dès qu'une consigne change (requête gardée ouverte) :
  // la playlist suit en une seconde même quand Spotify est en arrière-plan,
  // où Windows ralentit les minuteurs à une fois par minute. Une seconde
  // passe, un peu plus tard, laisse à Spotify le temps de relire un fichier.
  async function veiller() {
    let v = -1
    for (;;) {
      try {
        const r = await fetch(`${PLATINE}/attendre?v=${v}`)
        const { v: nouvelle } = await r.json()
        if (nouvelle !== v) {
          v = nouvelle
          await synchroniser()
          setTimeout(synchroniser, 4000)
        }
      } catch {
        await new Promise((r) => setTimeout(r, 5000)) // Platine fermée
      }
    }
  }

  synchroniser()
  veiller()
  setInterval(synchroniser, 5000)
  // Spotify rescanne ses sources quand la fenêtre revient au premier plan.
  window.addEventListener('focus', () => setTimeout(synchroniser, 2000))
})()
