// L'index des fichiers locaux de Spotify (`local-files.bnk`) garde une fiche
// pour chaque version d'un fichier : à chaque changement d'infos, l'ancienne
// reste et apparaît en double dans « Fichiers locaux ». Le seul remède est de
// le supprimer quand Spotify est fermé : au démarrage suivant, Spotify relit
// ses dossiers sources et le reconstruit avec une fiche par fichier.
// Les dossiers sources sont dans un autre fichier (`watch-sources.bnk`), qu'on
// ne touche jamais.

const fs = require('fs')
const os = require('os')
const path = require('path')

function dossierUtilisateurs() {
  if (process.platform === 'win32') return path.join(process.env.APPDATA || '', 'Spotify', 'Users')
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'Spotify', 'Users')
  return path.join(os.homedir(), '.config', 'spotify', 'Users')
}

function index() {
  const racine = dossierUtilisateurs()
  if (!fs.existsSync(racine)) return []
  return fs
    .readdirSync(racine)
    .map((n) => path.join(racine, n, 'local-files.bnk'))
    .filter((f) => fs.existsSync(f))
}

// Sauvegarde puis supprime l'index ; date les fichiers audio du jour pour que
// Spotify les relise tous. Renvoie le nombre d'index supprimés.
function reconstruire(dossierSauvegardes, fichiersAudio) {
  const liste = index()
  if (!liste.length) return 0
  fs.mkdirSync(dossierSauvegardes, { recursive: true })
  const horodatage = new Date().toISOString().replace(/[:.]/g, '-')
  liste.forEach((f, i) => {
    fs.copyFileSync(f, path.join(dossierSauvegardes, `local-files-${horodatage}-${i}.bnk`))
    fs.unlinkSync(f)
  })
  // On ne garde que les cinq dernières sauvegardes.
  const anciennes = fs.readdirSync(dossierSauvegardes).filter((n) => n.startsWith('local-files-')).sort()
  anciennes.slice(0, Math.max(0, anciennes.length - 5)).forEach((n) => fs.unlinkSync(path.join(dossierSauvegardes, n)))
  const maintenant = new Date()
  for (const f of fichiersAudio) {
    try {
      fs.utimesSync(f, maintenant, maintenant)
    } catch {}
  }
  return liste.length
}

module.exports = { index, reconstruire }
