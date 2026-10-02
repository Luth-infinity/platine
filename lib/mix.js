// Découpage d'un mix en morceaux, à partir d'une tracklist minutée.
// La tracklist vient d'un collage, de la description de la vidéo YouTube du
// mix, ou de ses dix premiers commentaires (souvent là qu'on la trouve).
// On ne lit que du texte : jamais l'audio de la vidéo.

const fs = require('fs')
const fsp = require('fs/promises')
const os = require('os')
const path = require('path')
const { spawn } = require('child_process')
const NodeID3 = require('node-id3')

const FFMPEG = require('ffmpeg-static').replace('app.asar', 'app.asar.unpacked')
const ENTETES = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36',
  'accept-language': 'fr-FR,fr;q=0.9,en;q=0.8'
}

/* ---------- Lecture de la tracklist ---------- */

// « 1:02:03 », « 03:42 », « 3:42 » → secondes.
function secondes(t) {
  const p = t.split(':').map(Number)
  return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1]
}

const MINUTAGE = /(?:^|[\s\[(])((?:\d{1,2}:)?\d{1,2}:\d{2})(?:[\s\])]|$)/

// Une ligne de tracklist : un minutage quelque part, le reste est le morceau.
function lireLigne(ligne) {
  const m = ligne.match(MINUTAGE)
  if (!m) return null
  let reste = ligne.replace(m[0], ' ')
  reste = reste
    .replace(/^\s*(\d{1,3}[.)]|[-–—•·|:>]+)\s*/, '') // numéro ou tiret de tête
    .replace(/\s*[-–—|:]\s*$/, '')
    .replace(/^\s*[-–—|:]\s*/, '')
    .trim()
  if (!reste) return null
  const coupe = reste.split(/\s+[-–—]\s+/)
  return {
    debut: secondes(m[1]),
    artiste: coupe.length >= 2 ? coupe[0].trim() : '',
    titre: (coupe.length >= 2 ? coupe.slice(1).join(' - ') : reste).trim()
  }
}

// Garde la plus longue suite de minutages croissants : une tracklist, pas
// les « à 12:30 le drop est fou » glissés dans un commentaire.
function analyser(texte) {
  const lignes = (texte || '').split(/\r?\n/).map(lireLigne).filter(Boolean)
  let meilleure = []
  let courante = []
  for (const l of lignes) {
    if (!courante.length || l.debut > courante[courante.length - 1].debut) courante.push(l)
    else {
      if (courante.length > meilleure.length) meilleure = courante
      courante = [l]
    }
  }
  if (courante.length > meilleure.length) meilleure = courante
  return meilleure.length >= 3 ? meilleure : []
}

/* ---------- YouTube : description et premiers commentaires ---------- */

function idVideo(lien) {
  try {
    const url = new URL(lien.trim())
    const hote = url.hostname.replace(/^(www|m|music)\./, '')
    if (hote === 'youtu.be') return url.pathname.slice(1, 12)
    if (url.searchParams.get('v')) return url.searchParams.get('v')
    return url.pathname.match(/^\/(shorts|embed|live)\/([\w-]{11})/)?.[2] || null
  } catch {
    return null
  }
}

// Extrait l'objet JSON qui suit `debut` dans la page, en comptant les
// accolades (le script continue souvent après, sans « ;</script> » collé).
function json(html, debut) {
  const i = html.indexOf(debut)
  if (i < 0) return null
  const depart = html.indexOf('{', i + debut.length - 1)
  let profondeur = 0
  let chaine = false
  for (let j = depart; j < html.length; j++) {
    const c = html[j]
    if (chaine) {
      if (c === '\\') j++
      else if (c === '"') chaine = false
    } else if (c === '"') chaine = true
    else if (c === '{') profondeur++
    else if (c === '}' && --profondeur === 0) {
      try {
        return JSON.parse(html.slice(depart, j + 1))
      } catch {
        return null
      }
    }
  }
  return null
}

function chercherCle(o, cle, res = []) {
  if (!o || typeof o !== 'object') return res
  if (cle in o) res.push(o[cle])
  for (const k in o) chercherCle(o[k], cle, res)
  return res
}

// Texte des premiers commentaires, dans l'ordre « Top » de YouTube.
async function commentaires(html, max = 10) {
  const donnees = json(html, 'var ytInitialData = ')
  const version = html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/)?.[1] || '2.20260101.00.00'
  const cle = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1]
  // Le jeton qui charge la section des commentaires.
  const sections = chercherCle(donnees, 'itemSectionRenderer').filter((s) => s.sectionIdentifier === 'comment-item-section')
  const jeton = chercherCle(sections, 'continuationCommand').map((c) => c.token)[0]
  if (!jeton) return []
  const r = await fetch(`https://www.youtube.com/youtubei/v1/next?prettyPrint=false${cle ? `&key=${cle}` : ''}`, {
    method: 'POST',
    headers: { ...ENTETES, 'content-type': 'application/json' },
    body: JSON.stringify({ context: { client: { clientName: 'WEB', clientVersion: version, hl: 'fr', gl: 'FR' } }, continuation: jeton })
  })
  if (!r.ok) return []
  const rep = await r.json()
  // Format récent : le texte est dans des « commentEntityPayload ».
  const recents = chercherCle(rep, 'commentEntityPayload').map((p) => p?.properties?.content?.content).filter(Boolean)
  if (recents.length) return recents.slice(0, max)
  // Ancien format.
  return chercherCle(rep, 'commentRenderer')
    .map((c) => (c.contentText?.runs || []).map((x) => x.text).join(''))
    .filter(Boolean)
    .slice(0, max)
}

// Cherche une tracklist pour la vidéo : description d'abord, puis les dix
// premiers commentaires. Renvoie la meilleure trouvée et sa provenance.
async function tracklistYouTube(lien) {
  const id = idVideo(lien)
  if (!id) throw new Error('Ce n’est pas un lien de vidéo YouTube.')
  const r = await fetch(`https://www.youtube.com/watch?v=${id}&hl=fr`, { headers: ENTETES })
  if (!r.ok) throw new Error(`YouTube indisponible (${r.status})`)
  const html = await r.text()
  const lecteur = json(html, 'var ytInitialPlayerResponse = ')
  const titreVideo = lecteur?.videoDetails?.title || ''
  const duree = Number(lecteur?.videoDetails?.lengthSeconds) || 0
  const description = lecteur?.videoDetails?.shortDescription || ''

  const candidates = [{ source: 'la description', texte: description, pistes: analyser(description) }]
  const coms = await commentaires(html).catch(() => [])
  coms.forEach((texte, i) => candidates.push({ source: `le commentaire n° ${i + 1}`, texte, pistes: analyser(texte) }))
  const meilleure = candidates.filter((c) => c.pistes.length).sort((a, b) => b.pistes.length - a.pistes.length)[0]
  return {
    titreVideo,
    duree,
    vignette: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    commentairesLus: coms.length,
    source: meilleure?.source || null,
    texte: meilleure?.texte || ''
  }
}

/* ---------- Découpage ---------- */

function ffmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG, ['-hide_banner', ...args], { windowsHide: true })
    let err = ''
    proc.stderr.on('data', (d) => (err += d))
    proc.on('error', reject)
    proc.on('close', (code) => resolve({ code, err }))
  })
}

async function duree(fichier) {
  const { err } = await ffmpeg(['-i', fichier])
  const m = err.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)
  return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0
}

// Coupe `source` aux débuts de `pistes`, écrit les infos de chaque morceau et
// les dépose dans `dossier`. Les fichiers sont préparés à part puis déplacés
// d'un bloc : Spotify ne voit que des morceaux finis, sans ancienne version.
// `propre(texte)` nettoie titres et artistes (crochets, accents).
async function decouper({ source, pistes, album, artiste, pochette, dossier, propre = (t) => t, avancement = () => {} }) {
  const total = await duree(source)
  if (!total) throw new Error('Durée du mix illisible.')
  const valides = pistes.filter((p) => p.debut < total - 5)
  if (valides.length < 2) throw new Error('La tracklist ne correspond pas à la durée de ce fichier.')
  const travail = await fsp.mkdtemp(path.join(os.tmpdir(), 'platine-mix-'))
  const nom = (t) => t.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Sans titre'
  const prets = []
  try {
    for (let i = 0; i < valides.length; i++) {
      const p = valides[i]
      const fin = i + 1 < valides.length ? valides[i + 1].debut : total
      const titre = propre(p.titre) || `Piste ${i + 1}`
      const auteur = propre(p.artiste || artiste || '') || 'Artiste inconnu'
      avancement(i + 1, valides.length, titre)
      const cible = path.join(travail, `${String(i + 1).padStart(2, '0')}.mp3`)
      // -ss avant -i : saut rapide ; copie du flux, sans réencodage.
      const { code, err } = await ffmpeg(['-y', '-ss', String(p.debut), '-i', source, '-t', String(fin - p.debut), '-map', '0:a', '-c', 'copy', '-map_metadata', '-1', cible])
      if (code !== 0) throw new Error(`Découpe impossible : ${err.trim().split('\n').pop()}`)
      const tags = { title: titre, artist: auteur, album: propre(album), trackNumber: `${i + 1}/${valides.length}` }
      if (pochette) tags.image = { mime: pochette[0] === 0x89 ? 'image/png' : 'image/jpeg', type: { id: 3, name: 'front cover' }, description: 'Cover', imageBuffer: pochette }
      NodeID3.write(tags, cible)
      prets.push({ cible, nom: `${nom(auteur)} - ${nom(titre)}.mp3` })
    }
    const deposes = []
    for (const { cible, nom: n } of prets) {
      let final = path.join(dossier, n)
      for (let k = 2; fs.existsSync(final); k++) final = path.join(dossier, n.replace(/\.mp3$/, ` (${k}).mp3`))
      try {
        await fsp.rename(cible, final)
      } catch {
        await fsp.copyFile(cible, final)
        await fsp.unlink(cible)
      }
      deposes.push(final)
    }
    return deposes
  } finally {
    await fsp.rm(travail, { recursive: true, force: true }).catch(() => {})
  }
}

module.exports = { analyser, tracklistYouTube, idVideo, secondes, duree, decouper }
