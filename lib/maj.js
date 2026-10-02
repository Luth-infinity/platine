// Mise à jour interne, sur le modèle de Hublink et Calque.
// Windows : electron-updater lit le `latest.yml` joint à chaque release GitHub
// et installe sur place, sur un clic. macOS : l'installation sur place exige
// une app signée par Apple, ce que Platine n'est pas ; on signale seulement la
// nouvelle version et on ouvre sa page.

const { app, shell } = require('electron')

const DERNIERE = 'https://api.github.com/repos/Luth-infinity/platine/releases/latest'
const INTERVALLE = 2 * 60 * 60 * 1000

let etat = { statut: 'inconnu' }
let rappel = () => {}
let page = ''
let updater = null

function plusRecente(a, b) {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d > 0
  }
  return false
}

function poser(nouvel) {
  etat = nouvel
  rappel(etat)
}

async function verifier() {
  if (!app.isPackaged) return
  if (process.platform === 'win32') {
    if (!updater) {
      updater = require('electron-updater').autoUpdater
      updater.autoDownload = false
      updater.autoInstallOnAppQuit = false
      updater.on('update-available', (i) => poser({ statut: 'disponible', version: i.version }))
      updater.on('update-downloaded', () => poser({ statut: 'prete', version: etat.version }))
      updater.on('error', () => {})
    }
    return updater.checkForUpdates().catch(() => {})
  }
  try {
    const r = await fetch(DERNIERE, { headers: { accept: 'application/vnd.github+json' } })
    if (!r.ok) return
    const { tag_name: tag, html_url: url } = await r.json()
    const version = tag.replace(/^v/, '')
    if (plusRecente(version, app.getVersion())) {
      page = url
      poser({ statut: 'disponible', version })
    }
  } catch {}
}

// Un clic : Windows télécharge puis installe (l'app redémarre), macOS ouvre la page.
async function installer() {
  if (process.platform !== 'win32') return page && shell.openExternal(page)
  if (etat.statut === 'prete') return updater.quitAndInstall(true, true)
  poser({ ...etat, statut: 'telechargement' })
  await updater.downloadUpdate()
}

function demarrer(surChangement) {
  rappel = surChangement
  setTimeout(verifier, 20000)
  setInterval(verifier, INTERVALLE)
}

module.exports = { demarrer, installer, etatMaj: () => etat }
