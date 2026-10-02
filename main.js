const { app, BrowserWindow, ipcMain, dialog, shell, protocol, Tray, Menu, nativeImage, clipboard } = require('electron')
const path = require('path')
const fs = require('fs')
const biblio = require('./lib/bibliotheque')
const spicetify = require('./lib/spicetify')
const liaison = require('./lib/liaison')
const maj = require('./lib/maj')

const FICHIER_REGLAGES = path.join(app.getPath('userData'), 'reglages.json')
// Images de playlists choisies dans Platine, une par playlist (clé de l'extension).
const DOSSIER_POCHETTES = path.join(app.getPath('userData'), 'pochettes-playlists')
const fichierPochette = (cle) => path.join(DOSSIER_POCHETTES, `${Buffer.from(cle).toString('hex')}.jpg`)
const AU_DEMARRAGE = process.argv.includes('--cache')

function lireReglages() {
  const defauts = { dossier: path.join(app.getPath('music'), 'MP3'), playlist: 'Mes MP3', parAlbum: true, perso: [], supprimees: [], albumsMasques: [], pochettesPlaylists: {}, modeAvance: false, sansAccents: true, accueilVu: false }
  try {
    const r = { ...defauts, ...JSON.parse(fs.readFileSync(FICHIER_REGLAGES, 'utf8')) }
    // Chaque playlist à toi a un identifiant stable : c'est lui qui permet à
    // l'extension de renommer la bonne playlist dans Spotify.
    if (r.perso.some((p) => !p.id)) {
      r.perso = r.perso.map((p) => (p.id ? p : { ...p, id: nouvelId() }))
      fs.writeFileSync(FICHIER_REGLAGES, JSON.stringify(r, null, 2))
    }
    return r
  } catch {
    return defauts
  }
}

function nouvelId() {
  return Math.random().toString(36).slice(2, 10)
}

function ecrireReglages(modifs) {
  const reglages = { ...lireReglages(), ...modifs }
  fs.mkdirSync(path.dirname(FICHIER_REGLAGES), { recursive: true })
  fs.writeFileSync(FICHIER_REGLAGES, JSON.stringify(reglages, null, 2))
  liaison.signaler()
  return reglages
}

let fenetre = null
let tray = null
let quitter = false

function creerFenetre() {
  fenetre = new BrowserWindow({
    width: 1240,
    height: 800,
    minWidth: 960,
    minHeight: 620,
    title: 'Platine',
    icon: path.join(__dirname, 'build/icon.png'),
    backgroundColor: '#00000000',
    // Windows : acrylique et boutons dessinés par le système. macOS : flou
    // natif et feux tricolores calés dans la barre de 44 px.
    ...(process.platform === 'darwin'
      ? { vibrancy: 'under-window', visualEffectState: 'active', titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 16, y: 15 } }
      : { backgroundMaterial: 'acrylic', titleBarStyle: 'hidden', titleBarOverlay: { color: '#00000000', symbolColor: '#e6e6ea', height: 44 } }),
    show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), sandbox: false }
  })
  fenetre.setMenu(null)
  fenetre.loadFile(path.join(__dirname, 'renderer/index.html'), { query: { plateforme: process.platform } })
  fenetre.once('ready-to-show', () => !AU_DEMARRAGE && fenetre.show())
  // Fermer la fenêtre garde Platine dans la zone de notification : c'est
  // ce qui permet de préparer les fichiers qui arrivent pendant ce temps.
  fenetre.on('close', (e) => {
    if (quitter) return
    e.preventDefault()
    fenetre.hide()
  })
  fenetre.on('show', () => envoyer('visible', true))
  fenetre.on('hide', () => envoyer('visible', false))
}

function montrer() {
  if (!fenetre) return
  fenetre.show()
  fenetre.focus()
}

function creerTray() {
  // macOS : image « template », que le système teinte selon la barre de menus.
  const icone = nativeImage.createFromPath(path.join(__dirname, process.platform === 'darwin' ? 'build/trayTemplate.png' : 'build/tray.png'))
  if (process.platform === 'darwin') icone.setTemplateImage(true)
  tray = new Tray(icone)
  tray.setToolTip('Platine')
  const menu = () =>
    Menu.buildFromTemplate([
      { label: 'Ouvrir Platine', click: montrer },
      { label: 'Ouvrir le dossier', click: () => shell.openPath(lireReglages().dossier) },
      { label: 'Faire relire le dossier par Spotify', click: () => relireTout() },
      { type: 'separator' },
      {
        label: 'Lancer au démarrage de Windows',
        type: 'checkbox',
        checked: app.getLoginItemSettings().openAtLogin,
        click: (item) => {
          app.setLoginItemSettings({ openAtLogin: item.checked, args: ['--cache'] })
          tray.setContextMenu(menu())
        }
      },
      { type: 'separator' },
      {
        label: 'Quitter',
        click: () => {
          quitter = true
          app.quit()
        }
      }
    ])
  tray.setContextMenu(menu())
  tray.on('click', montrer)
}

function envoyer(canal, donnees) {
  if (fenetre && !fenetre.isDestroyed()) fenetre.webContents.send(canal, donnees)
}

/* ---------- Surveillance du dossier ---------- */

let surveillant = null
const enPreparation = new Set()
// Les écritures de Platine elle-même déclenchent la surveillance : on les ignore.
const ecritsParMoi = new Map()

function surveiller() {
  surveillant?.close()
  const { dossier } = lireReglages()
  fs.mkdirSync(dossier, { recursive: true })
  // Fichiers restés cachés si Platine a été fermée pendant une relecture.
  for (const nom of fs.readdirSync(dossier)) {
    if (nom.endsWith('.platine')) fs.renameSync(path.join(dossier, nom), path.join(dossier, nom.slice(0, -'.platine'.length)))
  }
  const attente = new Map()
  surveillant = fs.watch(dossier, { recursive: true }, (_type, nom) => {
    if (!nom) return
    const fichier = path.join(dossier, nom)
    clearTimeout(attente.get(fichier))
    attente.set(fichier, setTimeout(() => traiter(fichier), 700))
  })
}

// Spotify ne relit pas un fichier qu'il connaît déjà : nouvelles infos ou
// nouvelle pochette restent invisibles. On sort donc le fichier un instant du
// dossier puis on le remet, pour que Spotify le voie comme un nouveau fichier.
// Plusieurs enregistrements rapprochés ne déclenchent qu'une relecture.
const relectures = new Map() // fichier → { minuteur, cache }
const attente = (ms) => new Promise((r) => setTimeout(r, ms))

// Chemin où se trouve vraiment le fichier (caché le temps d'une relecture).
function reel(fichier) {
  const r = relectures.get(fichier)
  return r?.cache && fs.existsSync(r.cache) ? r.cache : fichier
}

function faireRelire(fichier, delai = 3000) {
  const r = relectures.get(fichier)
  if (r?.cache) return (r.encore = true) // déjà caché : on refera un tour après
  clearTimeout(r?.minuteur)
  const etat = { minuteur: setTimeout(() => cacherPuisRemettre(fichier, etat), delai) }
  relectures.set(fichier, etat)
}

async function cacherPuisRemettre(fichier, etat) {
  const cache = `${fichier}.platine`
  try {
    ecritsParMoi.set(fichier, Date.now() + 30000)
    fs.renameSync(fichier, cache)
    etat.cache = cache
    await attente(8000)
  } catch (err) {
    console.error('[relecture]', err.message)
  } finally {
    // On ne laisse jamais le fichier caché.
    if (fs.existsSync(cache) && !fs.existsSync(fichier)) fs.renameSync(cache, fichier)
    ecritsParMoi.set(fichier, Date.now() + 3000)
    relectures.delete(fichier)
    liaison.signaler()
    if (etat.encore) faireRelire(fichier)
  }
}

async function traiter(fichier) {
  if ((ecritsParMoi.get(fichier) || 0) > Date.now()) return
  if (!fs.existsSync(fichier)) {
    liaison.signaler()
    return envoyer('piste:retiree', fichier)
  }
  if (!biblio.estAudio(fichier) || enPreparation.has(fichier)) return
  enPreparation.add(fichier)
  try {
    const resultat = await biblio.preparer(fichier, { sansAccents: lireReglages().sansAccents })
    if (resultat) {
      const pret = resultat.fichier
      ecritsParMoi.set(pret, Date.now() + 3000)
      if (pret !== fichier) envoyer('piste:retiree', fichier)
      envoyer('piste:maj', await biblio.infos(pret))
      liaison.signaler()
      if (resultat.modifie) faireRelire(pret)
    }
  } catch (err) {
    envoyer('erreur', `${path.basename(fichier)} : ${err.message}`)
  } finally {
    enPreparation.delete(fichier)
  }
}

/* ---------- IPC ---------- */

function gerer(canal, action) {
  ipcMain.handle(canal, async (_e, ...args) => {
    try {
      return { ok: true, valeur: await action(...args) }
    } catch (err) {
      return { ok: false, erreur: err.message || String(err) }
    }
  })
}

gerer('reglages:lire', () => lireReglages())
gerer('reglages:ecrire', (modifs) => ecrireReglages(modifs))
gerer('dossier:choisir', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(fenetre, {
    title: 'Ton dossier de MP3',
    defaultPath: lireReglages().dossier,
    properties: ['openDirectory', 'createDirectory']
  })
  if (canceled) return lireReglages()
  const r = ecrireReglages({ dossier: filePaths[0] })
  surveiller()
  return r
})
gerer('dossier:ouvrir', () => shell.openPath(lireReglages().dossier))
gerer('dossier:copier', () => clipboard.writeText(lireReglages().dossier))
gerer('fichier:montrer', (fichier) => shell.showItemInFolder(fichier))
gerer('spotify:ouvrir', () => shell.openExternal('spotify:'))

gerer('bibliotheque:lister', async () => {
  const fichiers = await biblio.lister(lireReglages().dossier)
  const liste = []
  for (const f of fichiers) {
    if (!f.toLowerCase().endsWith('.mp3')) {
      traiter(f)
      continue
    }
    const infos = await biblio.infos(f).catch(() => null)
    // Fichiers arrivés pendant que Platine était fermée : même passe qu'à l'arrivée.
    const aCorriger = infos && Object.keys(biblio.corrections(infos, { sansAccents: lireReglages().sansAccents })).length
    if (infos && (!infos.titre || !infos.artiste || aCorriger || biblio.nettoyer(infos.titre) !== infos.titre)) traiter(f)
    liste.push(infos)
  }
  return liste.filter(Boolean)
})
gerer('bibliotheque:ajouter', async (chemins) => {
  // Copie dans le dossier : la surveillance prend le relais.
  const { dossier } = lireReglages()
  let n = 0
  for (const source of chemins) {
    const stat = fs.statSync(source)
    const fichiers = stat.isDirectory() ? await biblio.lister(source) : biblio.estAudio(source) ? [source] : []
    for (const f of fichiers) {
      if (path.dirname(f) === dossier) continue
      let cible = path.join(dossier, path.basename(f))
      for (let i = 2; fs.existsSync(cible); i++) cible = path.join(dossier, path.basename(f).replace(/(\.[^.]+)$/, ` (${i})$1`))
      fs.copyFileSync(f, cible)
      n++
    }
  }
  return n
})
gerer('piste:enregistrer', async (fichier, modifs) => {
  ecritsParMoi.set(fichier, Date.now() + 3000)
  const infos = await biblio.enregistrer(reel(fichier), modifs, { sansAccents: lireReglages().sansAccents })
  liaison.signaler()
  faireRelire(fichier)
  return { ...infos, fichier, nom: path.basename(fichier) }
})
// Fait relire tout le dossier par Spotify (pochettes ou infos pas à jour).
async function relireTout() {
  const fichiers = (await biblio.lister(lireReglages().dossier)).filter((f) => f.toLowerCase().endsWith('.mp3'))
  fichiers.forEach((f, i) => faireRelire(f, 1000 + i * 300))
  return fichiers.length
}
gerer('bibliotheque:relire', relireTout)
gerer('piste:supprimer', async (fichier) => {
  await shell.trashItem(fichier)
})
gerer('piste:chercher', (terme) => biblio.chercher(terme))
gerer('pochette:youtube', (lien) => biblio.miniatureYouTube(lien))
gerer('youtube:rechercher', (terme) => biblio.rechercherYouTube(terme))
gerer('pochette:choisir', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(fenetre, {
    title: 'Choisir une pochette',
    properties: ['openFile'],
    filters: [{ name: 'Image', extensions: ['jpg', 'jpeg', 'png', 'webp'] }]
  })
  if (canceled) return null
  const buffer = fs.readFileSync(filePaths[0])
  const mime = filePaths[0].toLowerCase().endsWith('.png') ? 'image/png' : filePaths[0].toLowerCase().endsWith('.webp') ? 'image/webp' : 'image/jpeg'
  return `data:${mime};base64,${buffer.toString('base64')}`
})

// Playlists à toi : { nom, fichiers: [chemins] }, rangées dans les réglages.
gerer('perso:enregistrer', (perso) => {
  // Une playlist retirée de Platine est aussi à supprimer dans Spotify.
  const avant = lireReglages()
  // Par sécurité, une playlist arrivée sans identifiant reprend celui de
  // la playlist du même nom : sinon elle passerait pour supprimée.
  perso = perso.map((p) => (p.id ? p : { ...p, id: avant.perso.find((x) => x.nom === p.nom)?.id }))
  const gardees = new Set(perso.map((p) => p.id).filter(Boolean))
  const parties = avant.perso.filter((p) => !gardees.has(p.id)).map((p) => ({ id: p.id, cle: `perso:${p.id}`, nom: p.nom }))
  return ecrireReglages({ perso: perso.map((p) => (p.id ? p : { ...p, id: nouvelId() })), supprimees: [...avant.supprimees, ...parties] }).perso
})
gerer('spotify:rapport', () => dernierRapport)
gerer('playlist:pochette', (cle, dataUrl) => {
  fs.mkdirSync(DOSSIER_POCHETTES, { recursive: true })
  fs.writeFileSync(fichierPochette(cle), Buffer.from(dataUrl.split(',')[1], 'base64'))
  return ecrireReglages({ pochettesPlaylists: { ...lireReglages().pochettesPlaylists, [cle]: Date.now() } })
})
// Masquer un album : sa playlist automatique est supprimée de Spotify et
// n'est plus recréée.
gerer('album:masquer', (nom) => {
  const r = lireReglages()
  return ecrireReglages({
    albumsMasques: [...new Set([...r.albumsMasques, nom])],
    supprimees: [...r.supprimees, { id: `album:${nom}`, cle: `album:${nom}`, nom }]
  })
})
gerer('album:afficher', (nom) => ecrireReglages({ albumsMasques: lireReglages().albumsMasques.filter((n) => n !== nom) }))

let dernierRapport = null

async function consignes() {
  const r = lireReglages()
  const reperes = async (fichiers) => {
    const liste = []
    for (const f of fichiers) {
      if (!fs.existsSync(f)) continue
      const i = await biblio.infos(f).catch(() => null)
      if (i) liste.push({ titre: i.titre, artiste: i.artiste, album: i.album })
    }
    return liste
  }
  const perso = []
  for (const p of r.perso) perso.push({ id: p.id, nom: p.nom, pistes: await reperes(p.fichiers) })
  // Tous les morceaux du dossier : l'extension n'ajoute que ceux-là, et pas
  // les anciennes versions que Spotify garde en mémoire.
  const pistes = await reperes(await biblio.lister(r.dossier))
  const pochettes = Object.entries(r.pochettesPlaylists).map(([cle, version]) => ({ cle, version }))
  return { generale: r.playlist, parAlbum: r.parAlbum, albumsMasques: r.albumsMasques, perso, pistes, supprimees: r.supprimees, pochettes }
}

// En version installée, l'extension est sortie de l'archive asar (asarUnpack).
const SOURCE_EXTENSION = path.join(__dirname, 'spicetify/platine.js').replace('app.asar', 'app.asar.unpacked')

gerer('maj:etat', () => maj.etatMaj())
gerer('maj:installer', () => maj.installer())
gerer('spicetify:statut', () => spicetify.statut())
gerer('spicetify:activer', async () => {
  const r = await spicetify.activer(SOURCE_EXTENSION, lireReglages(), (texte) => envoyer('spicetify:etape', texte))
  ecrireReglages({ modeAvance: true })
  aReparer = false
  return r
})
gerer('spicetify:desactiver', async () => {
  const r = await spicetify.desactiver()
  ecrireReglages({ modeAvance: false })
  return r
})

// Après une mise à jour, Spotify revient d'origine et l'extension disparaît :
// Spotify est ouvert mais n'envoie plus de rapport. On propose de réparer.
let aReparer = false
setInterval(async () => {
  if (!lireReglages().modeAvance || aReparer) return
  const silence = Date.now() - (dernierRapport?.recu || demarrage)
  if (silence < 4 * 60 * 1000 || !(await spicetify.spotifyOuvert())) return
  aReparer = true
  envoyer('spicetify:a-reparer', true)
}, 60 * 1000)
const demarrage = Date.now()
gerer('spicetify:a-reparer', () => aReparer)
gerer('lien:ouvrir', (url) => /^https:\/\//.test(url) && shell.openExternal(url))

/* ---------- Démarrage ---------- */

protocol.registerSchemesAsPrivileged([{ scheme: 'pochette', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }])

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', montrer)
  app.whenReady().then(() => {
    // pochette://x/?f=<chemin> : la pochette intégrée au MP3, lue à la volée.
    protocol.handle('pochette', (req) => {
      const params = new URL(req.url).searchParams
      if (params.get('p')) {
        const f = fichierPochette(params.get('p'))
        return fs.existsSync(f) ? new Response(fs.readFileSync(f), { headers: { 'content-type': 'image/jpeg', 'access-control-allow-origin': '*' } }) : new Response(null, { status: 404 })
      }
      const fichier = params.get('f')
      const image = fichier && biblio.pochette(reel(fichier))
      return image ? new Response(image.data, { headers: { 'content-type': image.mime, 'access-control-allow-origin': '*' } }) : new Response(null, { status: 404 })
    })
    creerFenetre()
    creerTray()
    surveiller()
    maj.demarrer((e) => envoyer('maj', e))
    // PLATINE_SANS_LIAISON : pour les tests, sinon l'extension du vrai Spotify
    // obéirait à cette Platine-là.
    if (!process.env.PLATINE_SANS_LIAISON) liaison.demarrer({
      consignes,
      pochette: (cle) => (fs.existsSync(fichierPochette(cle)) ? fs.readFileSync(fichierPochette(cle)) : null),
      dernier: () => dernierRapport,
      rapport: (r) => {
        dernierRapport = { ...r, recu: Date.now() }
        // Suppressions faites dans Spotify : plus besoin de les redemander.
        if (r.supprimees?.length) {
          const faites = new Set(r.supprimees)
          ecrireReglages({ supprimees: lireReglages().supprimees.filter((s) => !faites.has(s.id)) })
        }
        envoyer('spotify:rapport', dernierRapport)
      }
    })
  })
  app.on('before-quit', () => {
    quitter = true
    // Jamais de fichier laissé caché par une relecture en cours.
    for (const [fichier, etat] of relectures) {
      if (etat.cache && fs.existsSync(etat.cache) && !fs.existsSync(fichier)) fs.renameSync(etat.cache, fichier)
    }
  })
  app.on('window-all-closed', () => {})
}
