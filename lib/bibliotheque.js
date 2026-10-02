// Le dossier de MP3 : lecture, nettoyage des infos, pochettes. Aucune
// dépendance à Electron, pour pouvoir le tester depuis Node.

const fs = require('fs')
const fsp = require('fs/promises')
const path = require('path')
const { spawn } = require('child_process')
const NodeID3 = require('node-id3')

// En version installée, ffmpeg est sorti de l'archive asar (voir asarUnpack).
const FFMPEG = require('ffmpeg-static').replace('app.asar', 'app.asar.unpacked')

// Sans artiste, Spotify n'arrive pas à lire un fichier local depuis une
// playlist : il le retrouve par artiste, album, titre et durée. Un fichier
// n'en est donc jamais privé.
const ARTISTE_INCONNU = 'Artiste inconnu'

const EXTENSIONS = ['.mp3', '.m4a', '.aac', '.wav', '.flac', '.ogg', '.opus', '.wma', '.aif', '.aiff']

const estAudio = (f) => EXTENSIONS.includes(path.extname(f).toLowerCase())
const estMp3 = (f) => path.extname(f).toLowerCase() === '.mp3'

async function lister(dossier) {
  const trouves = []
  const parcourir = async (d) => {
    const entrees = await fsp.readdir(d, { withFileTypes: true }).catch(() => [])
    for (const e of entrees) {
      const chemin = path.join(d, e.name)
      if (e.isDirectory()) await parcourir(chemin)
      else if (estAudio(e.name)) trouves.push(chemin)
    }
  }
  await parcourir(dossier)
  return trouves
}

function ffmpeg(args, { binaire = false } = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG, ['-hide_banner', ...args], { windowsHide: true })
    const sortie = []
    let erreurs = ''
    proc.stdout.on('data', (d) => sortie.push(d))
    proc.stderr.on('data', (d) => (erreurs += d))
    proc.on('error', reject)
    proc.on('close', (code) => resolve({ code, stdout: binaire ? Buffer.concat(sortie) : null, stderr: erreurs }))
  })
}

// Retire le bruit des titres YouTube : « (Official Video) », « [Free DL] »…
// Les mentions de remix restent, ce sont elles qui distinguent les versions.
function nettoyer(texte = '') {
  return texte
    .replace(/_/g, ' ')
    .replace(/\s*[\(\[][^\)\]]*\b(official|officiel|video|vidéo|clip|audio|lyrics?|paroles|hq|hd|4k|visuali[sz]er|free\s*(dl|download)|download|out now|dispo)\b[^\)\]]*[\)\]]/gi, '')
    .replace(/\s*\|\s*.*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function depuisNomDeFichier(fichier) {
  const nom = nettoyer(path.basename(fichier, path.extname(fichier)))
  const morceaux = nom.split(/\s+[-–—]\s+/)
  if (morceaux.length >= 2) return { artiste: morceaux[0].trim(), titre: morceaux.slice(1).join(' - ').trim() }
  return { artiste: '', titre: nom }
}

function lireTags(fichier) {
  const t = NodeID3.read(fichier) || {}
  return {
    titre: t.title || '',
    artiste: t.artist || '',
    album: t.album || '',
    annee: (t.year || '').slice(0, 4),
    image: t.image?.imageBuffer?.length ? t.image : null
  }
}

async function infos(fichier) {
  const stat = await fsp.stat(fichier)
  const t = lireTags(fichier)
  return {
    fichier,
    nom: path.basename(fichier),
    titre: t.titre,
    artiste: t.artiste,
    album: t.album,
    annee: t.annee,
    aPochette: !!t.image,
    version: Math.round(stat.mtimeMs),
    ajout: Math.round(stat.birthtimeMs || stat.mtimeMs),
    // L'artiste reste facultatif : beaucoup de remix n'en ont pas de clair.
    etat: t.titre && t.image ? 'propre' : 'a-verifier'
  }
}

function pochette(fichier) {
  const t = NodeID3.read(fichier, { include: ['APIC'] })
  return t?.image?.imageBuffer ? { mime: t.image.mime === 'png' || t.image.mime === 'image/png' ? 'image/png' : 'image/jpeg', data: t.image.imageBuffer } : null
}

async function attendreStable(fichier) {
  // Un fichier en cours de copie grossit encore : on attend qu'il se fige.
  let avant = -1
  for (let i = 0; i < 40; i++) {
    const taille = (await fsp.stat(fichier).catch(() => ({ size: -2 }))).size
    if (taille === avant && taille > 0) return true
    if (taille === -2) return false
    avant = taille
    await new Promise((r) => setTimeout(r, 500))
  }
  return true
}

// Convertit un format non MP3 en MP3 à côté (Spotify lit mal le reste et
// les tags ID3 n'existent qu'en MP3), en gardant ses infos et sa pochette.
async function versMp3(fichier) {
  const { stderr } = await ffmpeg(['-i', fichier])
  const meta = (cle) => (stderr.match(new RegExp(`^\\s{4}${cle}\\s*:\\s*(.+)$`, 'mi')) || [])[1]?.trim() || ''
  let image = null
  if (/Stream #.*Video:/.test(stderr)) {
    const { stdout } = await ffmpeg(['-i', fichier, '-an', '-frames:v', '1', '-c:v', 'mjpeg', '-f', 'image2pipe', '-'], { binaire: true })
    if (stdout?.length) image = stdout
  }
  let cible = fichier.replace(/\.[^.]+$/, '.mp3')
  for (let n = 2; fs.existsSync(cible); n++) cible = fichier.replace(/\.[^.]+$/, ` (${n}).mp3`)
  const { code, stderr: err } = await ffmpeg(['-y', '-i', fichier, '-vn', '-map_metadata', '-1', '-c:a', 'libmp3lame', '-q:a', '0', cible])
  if (code !== 0) throw new Error(`Conversion impossible : ${err.trim().split('\n').pop()}`)
  const tags = { title: meta('title'), artist: meta('artist') || meta('album_artist'), album: meta('album'), year: meta('date').slice(0, 4) }
  for (const k of Object.keys(tags)) if (!tags[k]) delete tags[k]
  if (image) tags.image = { mime: 'image/jpeg', type: { id: 3, name: 'front cover' }, description: 'Cover', imageBuffer: image }
  NodeID3.write(tags, cible)
  await fsp.unlink(fichier)
  return cible
}

// Spotify n'arrive pas à lire depuis une playlist certains fichiers dont les
// infos ont des caractères spéciaux (constaté avec « À ») : on garde des
// lettres simples. Option `sansAccents`, active par défaut.
function simplifier(texte) {
  return (texte || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‘’ʼ]/g, "'")
    .replace(/«\s*/g, '"')
    .replace(/\s*»/g, '"')
    .replace(/[“”]/g, '"')
    .replace(/[‐-―]/g, '-')
    .replace(/[⧸∕]/g, '/')
    .normalize('NFC')
}

// Crochets : Spotify ne lance pas depuis une playlist un morceau qui en a dans
// son titre ou son artiste (constaté). Toujours appliqué, pas une option.
// Les étiquettes de début (« [BEST ONE] », « [V5] ») partent, le reste passe
// entre parenthèses.
function lisible(texte) {
  return (texte || '')
    .replace(/^\s*(\[[^\]]*\]\s*)+/, '')
    .replace(/[\[{]/g, '(')
    .replace(/[\]}]/g, ')')
    .replace(/\s+/g, ' ')
    .trim()
}

// Ce qui doit changer dans les infos actuelles d'un fichier pour qu'elles
// soient lisibles par Spotify (vide si rien).
function corrections(t, { sansAccents = true } = {}) {
  const modifs = {}
  for (const [cle, tag] of [['titre', 'title'], ['artiste', 'artist'], ['album', 'album']]) {
    const v = t[cle]
    if (!v) continue
    const propre = sansAccents ? simplifier(lisible(v)) : lisible(v)
    if (propre && propre !== v) modifs[tag] = propre
  }
  return modifs
}

// Passe automatique à l'arrivée d'un fichier : MP3, titre et artiste lisibles.
// Ne touche jamais à une info déjà correcte.
async function preparer(fichier, options = {}) {
  if (!(await attendreStable(fichier))) return null
  const converti = !estMp3(fichier)
  if (converti) fichier = await versMp3(fichier)
  const t = lireTags(fichier)
  const devine = depuisNomDeFichier(fichier)
  const modifs = {}
  const titre = t.titre ? nettoyer(t.titre) : devine.titre
  if (titre && titre !== t.titre) modifs.title = titre
  if (!t.artiste) modifs.artist = devine.artiste || ARTISTE_INCONNU
  const propres = corrections({ titre: modifs.title || t.titre, artiste: modifs.artist || t.artiste, album: t.album }, options)
  Object.assign(modifs, propres)
  if (Object.keys(modifs).length) NodeID3.update(modifs, fichier)
  return { fichier, modifie: converti || Object.keys(modifs).length > 0 }
}

async function lireImage(source) {
  if (!source) return null
  if (source.startsWith('data:')) return Buffer.from(source.split(',')[1], 'base64')
  if (/^https?:/.test(source)) {
    const r = await fetch(source)
    return r.ok ? Buffer.from(await r.arrayBuffer()) : null
  }
  return fsp.readFile(source)
}

async function enregistrer(fichier, { titre, artiste, album, annee, pochette: image }, { sansAccents = true } = {}) {
  // Un titre fait seulement d'une étiquette (« [V5] ») garde son texte.
  const propre = (v) => (sansAccents ? simplifier(lisible(v)) : lisible(v)) || v
  const modifs = {
    title: propre((titre || '').trim()),
    artist: propre((artiste || '').trim()) || ARTISTE_INCONNU,
    album: propre((album || '').trim()),
    year: (annee || '').trim()
  }
  if (image) {
    const buffer = await lireImage(image)
    if (buffer) {
      modifs.image = { mime: buffer[0] === 0x89 ? 'image/png' : 'image/jpeg', type: { id: 3, name: 'front cover' }, description: 'Cover', imageBuffer: buffer }
    }
  }
  const ok = NodeID3.update(modifs, fichier)
  if (ok !== true) throw new Error('Écriture des infos impossible. Le fichier est peut-être ouvert ailleurs.')
  return infos(fichier)
}

// Catalogue iTunes : gratuit, sans clé, pochettes en 600 px.
async function chercher(terme) {
  const url = `https://itunes.apple.com/search?${new URLSearchParams({ term: terme, entity: 'song', limit: '6', country: 'FR' })}`
  const reponse = await fetch(url)
  if (!reponse.ok) throw new Error(`Recherche indisponible (${reponse.status})`)
  const { results } = await reponse.json()
  return results.map((r) => ({
    titre: r.trackName,
    artiste: r.artistName,
    album: r.collectionName || '',
    annee: (r.releaseDate || '').slice(0, 4),
    pochette: (r.artworkUrl100 || '').replace('100x100bb', '600x600bb')
  }))
}

function idYouTube(lien) {
  let url
  try {
    url = new URL(lien.trim())
  } catch {
    return null
  }
  const hote = url.hostname.replace(/^(www|m|music)\./, '')
  if (hote === 'youtu.be') return url.pathname.slice(1, 12) || null
  if (hote !== 'youtube.com') return null
  if (url.searchParams.get('v')) return url.searchParams.get('v')
  const m = url.pathname.match(/^\/(shorts|embed|live)\/([\w-]{11})/)
  return m ? m[2] : null
}

// Miniature de la vidéo (l'image seule, rien d'autre) : la plus grande dispo.
async function miniatureYouTube(lien) {
  const id = idYouTube(lien)
  if (!id) throw new Error('Ce n’est pas un lien de vidéo YouTube.')
  for (const taille of ['maxresdefault', 'sddefault', 'hqdefault']) {
    const r = await fetch(`https://i.ytimg.com/vi/${id}/${taille}.jpg`)
    if (r.ok) {
      const buffer = Buffer.from(await r.arrayBuffer())
      // YouTube renvoie une vignette grise de 120 px quand la taille n'existe pas.
      if (buffer.length > 3000) return { image: `data:image/jpeg;base64,${buffer.toString('base64')}`, bandes: taille !== 'maxresdefault' }
    }
  }
  throw new Error('Miniature introuvable pour cette vidéo.')
}

// Recherche de vidéos par nom, pour proposer leurs miniatures sans avoir à
// coller un lien. Lit seulement la page de résultats (titres, chaînes, ids).
async function rechercherYouTube(terme) {
  const r = await fetch(`https://www.youtube.com/results?${new URLSearchParams({ search_query: terme, hl: 'fr', gl: 'FR' })}`, {
    headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36', 'accept-language': 'fr-FR,fr;q=0.9' }
  })
  if (!r.ok) throw new Error(`YouTube indisponible (${r.status})`)
  const html = await r.text()
  const m = html.match(/var ytInitialData = (\{.*?\});<\/script>/s)
  if (!m) throw new Error('Résultats YouTube illisibles.')
  const resultats = []
  const parcourir = (o) => {
    if (!o || typeof o !== 'object' || resultats.length >= 6) return
    if (o.videoRenderer?.videoId) {
      const v = o.videoRenderer
      resultats.push({
        id: v.videoId,
        titre: v.title?.runs?.map((x) => x.text).join('') || '',
        chaine: v.ownerText?.runs?.[0]?.text || '',
        duree: v.lengthText?.simpleText || '',
        vignette: `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`
      })
      return
    }
    for (const k in o) parcourir(o[k])
  }
  parcourir(JSON.parse(m[1]))
  return resultats
}

module.exports = { ARTISTE_INCONNU, simplifier, lisible, corrections, rechercherYouTube, lister, infos, pochette, preparer, enregistrer, chercher, miniatureYouTube, nettoyer, estAudio, EXTENSIONS }
