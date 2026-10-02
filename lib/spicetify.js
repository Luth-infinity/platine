// Activation des playlists automatiques : Platine installe Spicetify (outil
// open source, licence MIT) sur la machine, sauvegarde Spotify, y pose
// l'extension et relance Spotify. Rien n'est fait sans un clic de
// l'utilisateur, et tout se défait avec « désactiver ».

const fs = require('fs')
const fsp = require('fs/promises')
const os = require('os')
const path = require('path')
const { spawn } = require('child_process')

const EXTENSION = 'platine.js'
const WIN = process.platform === 'win32'
const MAC = process.platform === 'darwin'

const DOSSIER = WIN ? path.join(process.env.LOCALAPPDATA || '', 'spicetify') : path.join(os.homedir(), '.spicetify')
const EXE = path.join(DOSSIER, WIN ? 'spicetify.exe' : 'spicetify')

function executable() {
  if (fs.existsSync(EXE)) return EXE
  const nom = WIN ? 'spicetify.exe' : 'spicetify'
  for (const d of (process.env.PATH || '').split(path.delimiter)) {
    if (d && fs.existsSync(path.join(d, nom))) return path.join(d, nom)
  }
  return null
}

// Où est Spotify, et peut-on le modifier ?
function etatSpotify() {
  if (WIN) {
    if (fs.existsSync(path.join(process.env.APPDATA || '', 'Spotify', 'Spotify.exe'))) return { etat: 'ok' }
    // La version du Microsoft Store est verrouillée : Spicetify ne peut pas la modifier.
    const paquets = path.join(process.env.LOCALAPPDATA || '', 'Packages')
    const store = fs.existsSync(paquets) && fs.readdirSync(paquets).some((n) => n.startsWith('SpotifyAB.SpotifyMusic'))
    return { etat: store ? 'store' : 'absent' }
  }
  if (MAC) {
    const app = ['/Applications/Spotify.app', path.join(os.homedir(), 'Applications/Spotify.app')].find((p) => fs.existsSync(p))
    if (!app) return { etat: 'absent' }
    try {
      fs.accessSync(path.join(app, 'Contents', 'Resources', 'Apps'), fs.constants.W_OK)
      return { etat: 'ok', app }
    } catch {
      return { etat: 'droits', app }
    }
  }
  return { etat: 'absent' }
}

// Lance spicetify. `reponses` alimente les questions qu'il pose parfois
// (« refaire la sauvegarde ? ») : on répond oui plutôt que de rester bloqué.
function lancer(args, { reponses = '' } = {}) {
  const exe = executable()
  if (!exe) return Promise.reject(new Error('Spicetify n’est pas installé.'))
  return new Promise((resolve, reject) => {
    const proc = spawn(exe, args, { windowsHide: true })
    let sortie = ''
    proc.stdout.on('data', (d) => (sortie += d))
    proc.stderr.on('data', (d) => (sortie += d))
    proc.stdin.end(reponses)
    const minuteur = setTimeout(() => proc.kill(), 180000)
    proc.on('error', reject)
    proc.on('close', (code) => {
      clearTimeout(minuteur)
      // eslint-disable-next-line no-control-regex
      const propre = sortie.replace(/\x1b\[[0-9;]*m/g, '').trim()
      const erreur = /\berror\b|cannot|mismatch/i.test(propre)
      if (code !== 0 || erreur) reject(new Error(propre.split('\n').filter((l) => /error|warning|cannot|mismatch/i.test(l)).pop() || propre.split('\n').pop() || `code ${code}`))
      else resolve(propre)
    })
  })
}

async function dossierConfig() {
  const sortie = await lancer(['path', 'userdata']).catch(() => '')
  const chemin = sortie.split('\n').map((l) => l.trim()).find((l) => l && fs.existsSync(l))
  return chemin || (WIN ? path.join(process.env.APPDATA || '', 'spicetify') : path.join(os.homedir(), '.config', 'spicetify'))
}

async function statut() {
  const spotify = etatSpotify().etat
  if (!executable()) return { spotify, installe: false, active: false }
  const config = path.join(await dossierConfig(), 'config-xpui.ini')
  const contenu = fs.existsSync(config) ? fs.readFileSync(config, 'utf8') : ''
  const ligne = contenu.match(/^extensions\s*=\s*(.*)$/m)?.[1] || ''
  return { spotify, installe: true, active: ligne.split('|').map((s) => s.trim()).includes(EXTENSION) }
}

// Télécharge la dernière version de Spicetify depuis sa page GitHub officielle.
async function installerSpicetify() {
  const r = await fetch('https://api.github.com/repos/spicetify/cli/releases/latest', { headers: { accept: 'application/vnd.github+json' } })
  if (!r.ok) throw new Error(`GitHub indisponible (${r.status})`)
  const { tag_name: tag } = await r.json()
  const version = tag.replace(/^v/, '')
  const cible = WIN ? `windows-${process.arch === 'arm64' ? 'arm64' : 'x64'}.zip` : `darwin-${process.arch === 'arm64' ? 'arm64' : 'amd64'}.tar.gz`
  const url = `https://github.com/spicetify/cli/releases/download/v${version}/spicetify-${version}-${cible}`
  const archive = path.join(os.tmpdir(), `spicetify-${version}-${cible}`)
  const fichier = await fetch(url)
  if (!fichier.ok) throw new Error(`Téléchargement de Spicetify impossible (${fichier.status})`)
  await fsp.writeFile(archive, Buffer.from(await fichier.arrayBuffer()))
  await fsp.mkdir(DOSSIER, { recursive: true })
  await new Promise((resolve, reject) => {
    const proc = WIN
      ? spawn('powershell.exe', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${archive}' -DestinationPath '${DOSSIER}' -Force`], { windowsHide: true })
      : spawn('tar', ['-xzf', archive, '-C', DOSSIER])
    proc.on('error', reject)
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error('Décompression de Spicetify impossible'))))
  })
  if (!WIN) await fsp.chmod(EXE, 0o755)
  await fsp.unlink(archive).catch(() => {})
}

function poserExtension(dossierConfigSpicetify, source, reglages) {
  const dossier = path.join(dossierConfigSpicetify, 'Extensions')
  fs.mkdirSync(dossier, { recursive: true })
  const code = fs
    .readFileSync(source, 'utf8')
    .replace('__NOM_PLAYLIST__', (reglages.playlist || 'Mes MP3').replace(/['\\]/g, ''))
    .replace('__PAR_ALBUM__', reglages.parAlbum ? 'oui' : 'non')
  fs.writeFileSync(path.join(dossier, EXTENSION), code)
}

// Active (ou répare après une mise à jour de Spotify). `etape(texte)` décrit
// l'avancement à l'écran.
async function activer(source, reglages, etape = () => {}) {
  const spotify = etatSpotify()
  if (spotify.etat === 'store') throw new Error('Ton Spotify vient du Microsoft Store, que Spicetify ne peut pas modifier. Installe-le depuis spotify.com, puis réessaie.')
  if (spotify.etat === 'absent') throw new Error('Spotify n’est pas installé sur cet ordinateur.')
  if (spotify.etat === 'droits') throw new Error(`macOS empêche de modifier Spotify. Ouvre le Terminal et tape : sudo chmod -R a+wr "${spotify.app}" puis réessaie.`)

  if (!executable()) {
    etape('Téléchargement de Spicetify…')
    await installerSpicetify()
  }
  etape('Préparation…')
  await lancer(['config']).catch(() => {}) // crée la configuration au premier lancement
  poserExtension(await dossierConfig(), source, reglages)
  const { active } = await statut()
  if (!active) await lancer(['config', 'extensions', EXTENSION])

  etape('Modification de Spotify…')
  try {
    await lancer(['apply'])
  } catch {
    // Pas encore de sauvegarde, ou Spotify mis à jour depuis : on repart
    // d'une sauvegarde neuve de la version installée.
    etape('Sauvegarde de Spotify…')
    await lancer(['restore']).catch(() => {})
    try {
      await lancer(['backup', 'apply'], { reponses: 'y\ny\ny\n' })
    } catch (err) {
      // Spotify s'est mis à jour entre-temps et ses fichiers d'origine ont
      // disparu : seule une réinstallation de Spotify les rend.
      if (/backed up|re-?install|mismatch/i.test(err.message)) {
        throw new Error('Spotify a changé de version et Spicetify a besoin de ses fichiers d’origine. Réinstalle Spotify depuis spotify.com par-dessus l’actuel (ton compte et tes playlists restent), puis clique à nouveau sur Activer.')
      }
      throw err
    }
  }
  return statut()
}

// Remet Spotify d'origine.
async function desactiver() {
  await lancer(['config', 'extensions', `${EXTENSION}-`]).catch(() => {})
  await lancer(['restore'])
  return statut()
}

// Spotify tourne-t-il ? (sert à repérer une extension disparue après une
// mise à jour : Spotify ouvert mais plus aucun rapport.)
function spotifyOuvert() {
  return new Promise((resolve) => {
    const proc = WIN ? spawn('tasklist', ['/FI', 'IMAGENAME eq Spotify.exe', '/NH'], { windowsHide: true }) : spawn('pgrep', ['-x', 'Spotify'])
    let sortie = ''
    proc.stdout.on('data', (d) => (sortie += d))
    proc.on('error', () => resolve(false))
    proc.on('close', (code) => resolve(WIN ? /spotify\.exe/i.test(sortie) : code === 0))
  })
}

module.exports = { statut, activer, desactiver, spotifyOuvert, etatSpotify }
