import { creerScene } from './scene.js'
import { STYLES, COULEURS, dessiner, teinteAuto } from './studio.js'

const api = window.platine
// macOS : les feux tricolores sont à gauche, la barre se décale en conséquence.
document.documentElement.dataset.plateforme = new URLSearchParams(location.search).get('plateforme') || 'win32'
const $ = (s) => document.querySelector(s)

const scene = creerScene($('#scene'))
const morceaux = new Map() // fichier → infos
let reglages = {}
let choisi = null
let brouillon = null // copie modifiable du morceau choisi
let vue = 'tout'
let youtube = null // { image, bandes } : miniature en cours de cadrage
let ouverte = null // { type: 'generale' | 'album' | 'perso', nom } : playlist affichée
let rapport = null // dernier état envoyé par l'extension dans Spotify
let fichePlaylist = null // playlist affichée dans la fiche de gauche (sinon : un morceau)

const NOTE = '<svg viewBox="0 0 24 24"><path d="M9 18V6l11-2v12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="6.5" cy="18" r="2.5" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="17.5" cy="16" r="2.5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>'

const echapper = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const urlPochette = (m) => (m?.aPochette ? `pochette://x/?f=${encodeURIComponent(m.fichier)}&v=${m.version}` : null)

function toast(message) {
  const el = document.createElement('div')
  el.className = 'toast'
  el.textContent = message
  $('#toasts').append(el)
  setTimeout(() => {
    el.classList.add('sortie')
    setTimeout(() => el.remove(), 300)
  }, 3600)
}

/* ---------- Liste ---------- */

function fichiersDe(p) {
  if (p.type === 'perso') return (reglages.perso.find((x) => x.nom === p.nom)?.fichiers || []).filter((f) => morceaux.has(f))
  if (p.type === 'album') return [...morceaux.values()].filter((m) => m.album === p.nom).map((m) => m.fichier)
  return [...morceaux.keys()]
}

function visibles() {
  const filtre = $('#filtre').value.trim().toLowerCase()
  if (vue === 'playlists') {
    if (!ouverte) return []
    return fichiersDe(ouverte)
      .map((f) => morceaux.get(f))
      .filter((m) => !filtre || `${m.titre} ${m.artiste} ${m.album} ${m.nom}`.toLowerCase().includes(filtre))
  }
  return [...morceaux.values()]
    .filter((m) => vue === 'tout' || m.etat === 'a-verifier')
    .filter((m) => !filtre || `${m.titre} ${m.artiste} ${m.album} ${m.nom}`.toLowerCase().includes(filtre))
    .sort((a, b) => b.ajout - a.ajout)
}

function ligne(m, nouveau = false) {
  const li = document.createElement('li')
  li.className = `morceau${m.fichier === choisi ? ' choisi' : ''}${nouveau ? ' nouveau' : ''}`
  li.dataset.fichier = m.fichier
  const url = urlPochette(m)
  li.innerHTML = `
    <div class="vignette">${url ? `<img src="${echapper(url)}" alt="" loading="lazy" />` : NOTE}</div>
    <div class="textes"><b>${echapper(m.titre || m.nom)}</b><small>${echapper(m.artiste || 'Artiste inconnu')}</small></div>
    <span class="etat-morceau ${m.etat}" title="${m.etat === 'propre' ? '' : 'Il manque une info ou la pochette'}"></span>`
  li.addEventListener('click', () => choisir(m.fichier))
  return li
}

function rendreListe() {
  $('#entete-playlist').hidden = !(vue === 'playlists' && ouverte)
  if (vue === 'playlists' && !ouverte) return rendrePlaylists()
  if (ouverte) {
    $('#titre-playlist-ouverte').textContent = ouverte.nom
    $('#btn-renommer').hidden = ouverte.type === 'album'
    $('#btn-supprimer-playlist').hidden = ouverte.type === 'generale'
  }
  const liste = $('#liste')
  const items = visibles()
  liste.replaceChildren(...items.map((m, i) => {
    const li = ligne(m)
    li.style.animationDelay = `${Math.min(i, 12) * 22}ms`
    return li
  }))
  majCompteurs()
}

function majCompteurs() {
  const tous = [...morceaux.values()]
  $('#nb-tout').textContent = tous.length
  $('#nb-verifier').textContent = tous.filter((m) => m.etat === 'a-verifier').length
  $('#nb-playlists').textContent = toutesPlaylists().length
  $('#liste-vide').hidden = tous.length > 0
  $('#accueil-scene').hidden = tous.length > 0
}

function majLigne(m, nouveau) {
  if (vue === 'playlists' && !ouverte) {
    rendrePlaylists()
    return majCompteurs()
  }
  const existante = document.querySelector(`.morceau[data-fichier="${CSS.escape(m.fichier)}"]`)
  const affichable = visibles().some((v) => v.fichier === m.fichier)
  if (existante && affichable) existante.replaceWith(ligne(m))
  else if (!existante && affichable) $('#liste').prepend(ligne(m, nouveau))
  else existante?.remove()
  majCompteurs()
}

/* ---------- Fiche ---------- */

function choisir(fichier) {
  if (brouillon && modifie()) enregistrer({ silencieux: true })
  fichePlaylist = null
  choisi = fichier
  const m = morceaux.get(fichier)
  brouillon = m ? { titre: m.titre, artiste: m.artiste, album: m.album, annee: m.annee, pochette: null } : null
  document.querySelectorAll('.morceau').forEach((el) => el.classList.toggle('choisi', el.dataset.fichier === fichier))
  fermerTiroirs()
  remplirFiche()
  scene.definir(urlPochette(m))
  majBoutonMix()
}

function remplirFiche() {
  // Mode playlist : nom et image seulement.
  const enPlaylist = !!fichePlaylist
  $('#fiche').classList.toggle('mode-playlist', enPlaylist)
  if (enPlaylist) $('#btn-mix').hidden = true
  if (enPlaylist) {
    $('#fiche').hidden = false
    const n = fichiersDe(fichePlaylist).length
    document.querySelector('#fiche [data-cle="titre"]').value = brouillon.titre
    document.querySelector('#fiche [data-cle="titre"]').readOnly = fichePlaylist.type === 'album'
    $('#sous-titre-playlist').textContent = `${{ generale: 'Playlist générale', album: 'Playlist de l’album', perso: 'Ta playlist' }[fichePlaylist.type]} · ${n} morceau${n > 1 ? 'x' : ''}`
    $('#source').textContent = 'L’image et le nom partent aussi dans Spotify.'
    $('#source').title = ''
    return majBoutons()
  }
  document.querySelector('#fiche [data-cle="titre"]').readOnly = false
  const m = morceaux.get(choisi)
  $('#fiche').hidden = !m
  if (!m) return
  document.querySelectorAll('#fiche [data-cle]').forEach((input) => (input.value = brouillon[input.dataset.cle] || ''))
  $('#source').textContent = m.nom
  $('#source').title = m.fichier
  rendrePuces()
  majBoutons()
}

// Clé d'une playlist pour l'extension : la même que celle qui la relie à Spotify.
function clePlaylist(p) {
  if (p.type === 'generale') return 'generale'
  if (p.type === 'album') return `album:${p.nom}`
  const id = reglages.perso.find((x) => x.nom === p.nom)?.id
  return id ? `perso:${id}` : null
}

function urlPochettePlaylist(p) {
  const cle = clePlaylist(p)
  const v = cle && reglages.pochettesPlaylists?.[cle]
  return v ? `pochette://x/?p=${encodeURIComponent(cle)}&v=${v}` : null
}

function ouvrirFichePlaylist(p) {
  if (brouillon && modifie()) enregistrer({ silencieux: true })
  fichePlaylist = p
  brouillon = { titre: p.nom, artiste: '', album: '', annee: '', pochette: null }
  document.querySelectorAll('.morceau').forEach((el) => el.classList.remove('choisi'))
  fermerTiroirs()
  remplirFiche()
  const premiere = fichiersDe(p).map((f) => urlPochette(morceaux.get(f))).find(Boolean)
  scene.definir(urlPochettePlaylist(p) || premiere || null)
}

// Spotify veut un JPEG carré et léger (moins de 256 Ko).
async function versJpegPlaylist(source) {
  const img = await chargerImage(source)
  const cote = Math.min(img.width, img.height)
  const c = document.createElement('canvas')
  c.width = c.height = 640
  c.getContext('2d').drawImage(img, (img.width - cote) / 2, (img.height - cote) / 2, cote, cote, 0, 0, 640, 640)
  for (const q of [0.88, 0.8, 0.7, 0.6, 0.5]) {
    const url = c.toDataURL('image/jpeg', q)
    if (url.length * 0.75 < 250000) return url
  }
  return c.toDataURL('image/jpeg', 0.4)
}

async function enregistrerPlaylist() {
  const p = fichePlaylist
  const bouton = $('#btn-enregistrer')
  bouton.disabled = true
  bouton.innerHTML = '<span class="rond"></span>'
  try {
    const nom = brouillon.titre.trim()
    if (nom && nom !== p.nom && p.type !== 'album') {
      const libre = nomLibre(nom, p.nom)
      if (p.type === 'generale') reglages = await api.ecrireReglages({ playlist: libre })
      else await sauverPerso(reglages.perso.map((x) => (x.nom === p.nom ? { ...x, nom: libre } : x)))
      p.nom = libre
      if (ouverte) ouverte = { ...ouverte, nom: libre }
    }
    if (brouillon.pochette) {
      const cle = clePlaylist(p)
      if (cle) reglages = await api.pochettePlaylist(cle, await versJpegPlaylist(brouillon.pochette))
    }
    // Si on a déjà quitté cette playlist (clic sur un morceau pendant
    // l'enregistrement), la fiche affichée n'est plus la sienne : on n'y touche pas.
    if (fichePlaylist === p) {
      brouillon = { titre: p.nom, artiste: '', album: '', annee: '', pochette: null }
      fermerTiroirs()
      remplirFiche()
    }
    rendreListe()
    toast('Enregistré. Spotify suit dans quelques secondes.')
  } catch (err) {
    toast(err.message)
  }
  bouton.textContent = 'Enregistrer'
  majBoutons()
}

function modifie() {
  if (fichePlaylist) return !!brouillon && (brouillon.pochette !== null || brouillon.titre.trim() !== fichePlaylist.nom)
  const m = morceaux.get(choisi)
  if (!m || !brouillon) return false
  return brouillon.pochette !== null || ['titre', 'artiste', 'album', 'annee'].some((k) => (brouillon[k] || '') !== (m[k] || ''))
}

function majBoutons() {
  const change = modifie()
  $('#btn-enregistrer').disabled = !change
  $('#btn-annuler').hidden = !change
}

const LIEN_YOUTUBE = /https?:\/\/(www\.|m\.|music\.)?(youtube\.com|youtu\.be)\/\S+/i

document.querySelectorAll('#fiche [data-cle]').forEach((input) => {
  input.addEventListener('input', () => {
    // Un lien YouTube collé dans un champ sert à la pochette, il n'a rien à
    // faire dans le titre ou l'album.
    const lien = input.value.match(LIEN_YOUTUBE)?.[0]
    if (lien) {
      input.value = input.value.replace(lien, '').trim()
      appliquerMiniature(lien)
        .then(() => toast('Lien YouTube utilisé pour la pochette.'))
        .catch((err) => toast(err.message))
    }
    brouillon[input.dataset.cle] = input.value
    majBoutons()
  })
  input.addEventListener('keydown', (e) => e.key === 'Enter' && modifie() && enregistrer())
})

async function enregistrer({ silencieux = false } = {}) {
  if (fichePlaylist) return enregistrerPlaylist()
  const fichier = choisi
  const modifs = { ...brouillon }
  const bouton = $('#btn-enregistrer')
  bouton.disabled = true
  bouton.innerHTML = '<span class="rond"></span>'
  try {
    const infos = await api.enregistrer(fichier, modifs)
    morceaux.set(fichier, infos)
    majLigne(infos)
    if (choisi === fichier) {
      brouillon = { titre: infos.titre, artiste: infos.artiste, album: infos.album, annee: infos.annee, pochette: null }
      fermerTiroirs()
    }
    if (!silencieux) toast('Enregistré. Spotify affichera les nouvelles infos.')
  } catch (err) {
    toast(err.message)
  }
  bouton.textContent = 'Enregistrer'
  majBoutons()
}

$('#btn-enregistrer').addEventListener('click', () => enregistrer())
$('#btn-annuler').addEventListener('click', () => (fichePlaylist ? ouvrirFichePlaylist(fichePlaylist) : choisir(choisi)))

/* ---------- Pochettes ---------- */

function definirPochette(dataUrl) {
  brouillon.pochette = dataUrl
  scene.definir(dataUrl, { glisse: false })
  majBoutons()
}

function fermerTiroirs() {
  for (const id of ['#tiroir-youtube', '#tiroir-cadrage', '#tiroir-suggestions', '#tiroir-studio']) $(id).hidden = true
  document.querySelectorAll('.outil').forEach((b) => b.classList.remove('actif'))
  youtube = null
}

function chargerImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Image illisible.'))
    img.src = src
  })
}

// Carré pris dans la miniature 16:9. Les vignettes en 4:3 de YouTube ont des
// bandes noires en haut et en bas, qu'on écarte d'abord.
async function recadrer() {
  if (!youtube) return
  const img = await chargerImage(youtube.image)
  const haut = youtube.bandes ? img.height * 0.125 : 0
  const hauteur = youtube.bandes ? img.height * 0.75 : img.height
  const cote = Math.min(img.width, hauteur)
  const x = (img.width - cote) * ($('#cadrage').value / 100)
  const c = document.createElement('canvas')
  c.width = c.height = Math.round(cote)
  c.getContext('2d').drawImage(img, x, haut + (hauteur - cote) / 2, cote, cote, 0, 0, cote, cote)
  definirPochette(c.toDataURL('image/jpeg', 0.92))
}

async function appliquerMiniature(lien) {
  youtube = await api.miniatureYouTube(lien)
  $('#cadrage').value = 50
  $('#tiroir-cadrage').hidden = false
  await recadrer()
}

$('#tiroir-youtube').addEventListener('submit', async (e) => {
  e.preventDefault()
  const bouton = e.target.querySelector('button')
  bouton.innerHTML = '<span class="rond"></span>'
  try {
    await appliquerMiniature(e.target.querySelector('input').value)
  } catch (err) {
    toast(err.message)
  }
  bouton.textContent = 'Récupérer'
})

// Cherche la vidéo d'après l'artiste et le titre, et propose ses miniatures.
async function chercherYouTube() {
  const terme = `${brouillon.artiste} ${brouillon.titre}`.trim()
  const tiroir = $('#tiroir-suggestions')
  if (!terme) return
  tiroir.hidden = false
  tiroir.innerHTML = '<span class="rond"></span>'
  try {
    const videos = await api.rechercherYouTube(terme)
    if (!videos.length) {
      tiroir.innerHTML = '<span class="etiquette-outils">Aucune vidéo trouvée. Colle le lien à la main.</span>'
      return
    }
    tiroir.innerHTML = videos
      .map((v, i) => `
        <button class="suggestion video" data-i="${i}" style="animation-delay:${i * 40}ms" title="${echapper(`${v.titre} · ${v.chaine}`)}">
          <img src="${echapper(v.vignette)}" alt="" />
          <div><b>${echapper(v.titre)}</b><small>${echapper(v.chaine)}${v.duree ? ' · ' + v.duree : ''}</small></div>
        </button>`)
      .join('')
    tiroir.querySelectorAll('.suggestion').forEach((b) =>
      b.addEventListener('click', async () => {
        tiroir.querySelectorAll('.suggestion').forEach((x) => x.classList.toggle('actif', x === b))
        try {
          await appliquerMiniature(`https://youtu.be/${videos[+b.dataset.i].id}`)
        } catch (err) {
          toast(err.message)
        }
      })
    )
  } catch (err) {
    tiroir.innerHTML = `<span class="etiquette-outils">${echapper(err.message)}</span>`
  }
}
$('#cadrage').addEventListener('input', recadrer)

async function chercher() {
  const terme = `${brouillon.artiste} ${brouillon.titre}`.trim()
  const tiroir = $('#tiroir-suggestions')
  tiroir.hidden = false
  tiroir.innerHTML = '<span class="rond"></span>'
  try {
    const resultats = await api.chercher(terme)
    if (!resultats.length) {
      tiroir.innerHTML = '<span class="etiquette-outils">Rien trouvé. Les remix sont rarement au catalogue : essaie l’image YouTube ou Générer.</span>'
      return
    }
    tiroir.innerHTML = resultats
      .map((s, i) => `
        <button class="suggestion" data-i="${i}" style="animation-delay:${i * 40}ms" title="${echapper(`${s.artiste} – ${s.titre} (${s.album})`)}">
          <img src="${echapper(s.pochette)}" alt="" />
          <div><b>${echapper(s.titre)}</b><small>${echapper(s.artiste)}${s.annee ? ' · ' + s.annee : ''}</small></div>
        </button>`)
      .join('')
    tiroir.querySelectorAll('.suggestion').forEach((b) =>
      b.addEventListener('click', () => {
        const s = resultats[+b.dataset.i]
        // On prend la pochette et l'album, sans écraser titre et artiste
        // (un remix porte souvent le nom de l'original).
        brouillon.album ||= s.album
        brouillon.annee ||= s.annee
        remplirFiche()
        fetch(s.pochette)
          .then((r) => r.blob())
          .then((b) => new Promise((ok) => {
            const l = new FileReader()
            l.onload = () => ok(l.result)
            l.readAsDataURL(b)
          }))
          .then(definirPochette)
          .catch(() => definirPochette(s.pochette))
      })
    )
  } catch (err) {
    tiroir.innerHTML = `<span class="etiquette-outils">${echapper(err.message)}</span>`
  }
}

document.querySelectorAll('.outil').forEach((bouton) => {
  bouton.addEventListener('click', async () => {
    const outil = bouton.dataset.outil
    const dejaOuvert = bouton.classList.contains('actif')
    fermerTiroirs()
    if (outil === 'youtube') {
      if (dejaOuvert) return
      bouton.classList.add('actif')
      $('#tiroir-youtube').hidden = false
      chercherYouTube()
    } else if (outil === 'importer') {
      const image = await api.choisirImage()
      if (image) definirPochette(image)
    } else if (outil === 'generer') {
      if (dejaOuvert) return
      bouton.classList.add('actif')
      ouvrirStudio()
    } else if (outil === 'chercher') {
      if (dejaOuvert) return
      bouton.classList.add('actif')
      chercher()
    }
  })
})

/* ---------- Dossier, aide, playlist ---------- */

async function chargerReglages() {
  reglages = await api.reglages()
  const morceauxChemin = reglages.dossier.split(/[\\/]/).filter(Boolean)
  $('#nom-dossier').textContent = morceauxChemin.slice(-2).join('\\')
  $('#btn-dossier').title = `${reglages.dossier}\nCliquer pour changer`
  $('#chemin-aide').textContent = reglages.dossier
  $('#nom-playlist').value = reglages.playlist
  $('#par-album').checked = reglages.parAlbum
  $('#sans-accents').checked = reglages.sansAccents !== false
}

async function chargerBibliotheque() {
  morceaux.clear()
  for (const m of await api.lister()) morceaux.set(m.fichier, m)
  rendreListe()
  const premier = visibles()[0]
  if (premier && !morceaux.has(choisi)) choisir(premier.fichier)
  else if (!premier) {
    choisi = null
    remplirFiche()
    scene.definir(null)
  }
}

$('#btn-dossier').addEventListener('click', async () => {
  const avant = reglages.dossier
  await api.choisirDossier()
  await chargerReglages()
  if (reglages.dossier !== avant) {
    await chargerBibliotheque()
    $('#voile').hidden = false
  }
})
$('#btn-ouvrir-dossier').addEventListener('click', () => api.ouvrirDossier())
$('#btn-aide').addEventListener('click', () => ($('#voile').hidden = false))
$('#btn-ok').addEventListener('click', async () => {
  $('#voile').hidden = true
  if (!reglages.accueilVu) {
    reglages = await api.ecrireReglages({ accueilVu: true })
    $('#voile-playlist').hidden = false
    majPlaylist()
  }
})
$('#btn-copier').addEventListener('click', async () => {
  await api.copierDossier()
  toast('Chemin copié.')
})
$('#btn-spotify').addEventListener('click', () => api.ouvrirSpotify())

async function majPlaylist() {
  const s = await api.spicetify.statut().catch(() => ({ spotify: 'ok', installe: false, active: false }))
  $('#point-playlist').classList.toggle('actif', s.active)
  $('#texte-playlist').textContent = s.active ? reglages.playlist : 'Playlists auto'
  const etat = $('#etat-spicetify')
  const bloque = { store: 'Ton Spotify vient du Microsoft Store, que Spicetify ne sait pas modifier. Installe Spotify depuis spotify.com pour activer.', absent: 'Spotify n’est pas installé sur cet ordinateur.' }[s.spotify]
  if (bloque) etat.textContent = bloque
  else if (s.active) etat.textContent = 'Activées. Tes playlists se mettent à jour dès que Spotify est ouvert.'
  else etat.textContent = 'Activer prend une trentaine de secondes et redémarre Spotify une fois.'
  $('#btn-playlist-activer').disabled = !!bloque
  $('#btn-playlist-activer').textContent = s.active ? 'Mettre à jour' : 'Activer'
  $('#btn-playlist-desactiver').hidden = !s.active
  return s
}

async function activerPlaylists() {
  const bouton = $('#btn-playlist-activer')
  bouton.disabled = true
  bouton.innerHTML = '<span class="rond"></span>'
  $('#etat-spicetify').textContent = 'Préparation…'
  try {
    await api.spicetify.activer()
    $('#bandeau').hidden = true
    toast('Playlists automatiques activées.')
  } catch (err) {
    toast(err.message)
  }
  await majPlaylist()
}

api.sur('spicetify:etape', (texte) => ($('#etat-spicetify').textContent = texte))
api.sur('spicetify:a-reparer', () => ($('#bandeau').hidden = false))
api.spicetify.aReparer().then((v) => ($('#bandeau').hidden = !v))
$('#btn-reparer').addEventListener('click', async () => {
  const b = $('#btn-reparer')
  b.disabled = true
  b.innerHTML = '<span class="rond"></span>'
  try {
    await api.spicetify.activer()
    $('#bandeau').hidden = true
    toast('Réactivé.')
  } catch (err) {
    toast(err.message)
  }
  b.disabled = false
  b.textContent = 'Réactiver'
})

$('#btn-playlist').addEventListener('click', async () => {
  $('#voile-playlist').hidden = false
  await majPlaylist()
})
$('#btn-playlist-fermer').addEventListener('click', () => ($('#voile-playlist').hidden = true))
$('#btn-playlist-activer').addEventListener('click', async () => {
  const nom = $('#nom-playlist').value.trim() || 'Mes MP3'
  reglages = await api.ecrireReglages({ playlist: nom, parAlbum: $('#par-album').checked })
  await activerPlaylists()
})
$('#btn-playlist-desactiver').addEventListener('click', async () => {
  try {
    await api.spicetify.desactiver()
    toast('Désactivé. Spotify est revenu d’origine.')
  } catch (err) {
    toast(err.message)
  }
  await majPlaylist()
})

for (const voile of ['#voile', '#voile-playlist']) {
  $(voile).addEventListener('click', (e) => e.target === $(voile) && ($(voile).hidden = true))
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    $('#voile').hidden = true
    $('#voile-playlist').hidden = true
  }
})

/* ---------- Filtres ---------- */

$('#filtre').addEventListener('input', rendreListe)
document.querySelectorAll('#segments button').forEach((b) =>
  b.addEventListener('click', () => {
    vue = b.dataset.vue
    ouverte = null
    document.querySelectorAll('#segments button').forEach((x) => x.classList.toggle('actif', x === b))
    rendreListe()
  })
)

/* ---------- Dépôt et surveillance ---------- */

let profondeur = 0
document.addEventListener('dragenter', (e) => {
  if (!e.dataTransfer.types.includes('Files')) return
  profondeur++
  $('#depot').hidden = false
})
document.addEventListener('dragleave', () => {
  if (--profondeur <= 0) {
    profondeur = 0
    $('#depot').hidden = true
  }
})
document.addEventListener('dragover', (e) => e.preventDefault())
document.addEventListener('drop', async (e) => {
  e.preventDefault()
  profondeur = 0
  $('#depot').hidden = true
  const fichiers = [...e.dataTransfer.files]
  if (!fichiers.length) return
  // Une image déposée devient la pochette du morceau affiché.
  const image = fichiers.find((f) => /^image\//.test(f.type))
  if (image && choisi) {
    const l = new FileReader()
    l.onload = () => definirPochette(l.result)
    l.readAsDataURL(image)
    return
  }
  try {
    const n = await api.ajouter(fichiers)
    toast(n ? `${n} morceau${n > 1 ? 'x' : ''} ajouté${n > 1 ? 's' : ''} au dossier.` : 'Aucun fichier audio là-dedans.')
  } catch (err) {
    toast(err.message)
  }
})

api.sur('piste:maj', (infos) => {
  const nouveau = !morceaux.has(infos.fichier)
  // À comparer avec l'ancienne version, avant de la remplacer.
  const intact = infos.fichier === choisi && !modifie()
  morceaux.set(infos.fichier, infos)
  majLigne(infos, nouveau)
  if (nouveau && !choisi) choisir(infos.fichier)
  else if (intact) {
    brouillon = { titre: infos.titre, artiste: infos.artiste, album: infos.album, annee: infos.annee, pochette: null }
    remplirFiche()
    scene.definir(urlPochette(infos), { glisse: false })
  }
})
api.sur('piste:retiree', (fichier) => {
  if (!morceaux.delete(fichier)) return
  majLigne({ fichier })
  if (fichier === choisi) {
    choisi = null
    const suivant = visibles()[0]
    if (suivant) choisir(suivant.fichier)
    else {
      remplirFiche()
      scene.definir(null)
    }
  }
})
api.sur('erreur', toast)
let dernierEtat = ''
api.sur('spotify:rapport', (r) => {
  rapport = r
  majDirect()
  // Redessine seulement si quelque chose a changé dans Spotify.
  const etat = JSON.stringify(r.playlists)
  if (etat !== dernierEtat && vue === 'playlists' && !ouverte) rendrePlaylists()
  dernierEtat = etat
})
api.sur('visible', (v) => scene.pause(!v))

await chargerReglages()
await chargerBibliotheque()
majPlaylist()
if (!reglages.accueilVu) $('#voile').hidden = false

/* ---------- Playlists ---------- */

const ICONE_CORBEILLE = '<svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'

// Deux clics pour supprimer : le premier arme le bouton pendant 3 s.
async function supprimerPlaylist(p, bouton) {
  if (!bouton.classList.contains('armee')) {
    bouton.classList.add('armee')
    bouton.innerHTML = 'Supprimer ?'
    setTimeout(() => {
      if (!bouton.isConnected) return
      bouton.classList.remove('armee')
      bouton.innerHTML = ICONE_CORBEILLE
    }, 3000)
    return
  }
  if (p.type === 'album') {
    reglages = await api.masquerAlbum(p.nom)
    toast(`Playlist « ${p.nom} » supprimée. Elle ne sera plus recréée.`)
  } else {
    await sauverPerso(reglages.perso.filter((x) => x.nom !== p.nom))
    toast(`Playlist « ${p.nom} » supprimée, dans Spotify aussi.`)
  }
  if (ouverte?.nom === p.nom) ouverte = null
  rendreListe()
  remplirFiche()
}

const ICONE_LISTE = '<svg viewBox="0 0 24 24"><path d="M4 7h11M4 12h11M4 17h7M18 14v6m-3-3h6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>'

function toutesPlaylists() {
  const albums = new Map()
  for (const m of morceaux.values()) if (m.album) albums.set(m.album, (albums.get(m.album) || 0) + 1)
  return [
    { type: 'generale', nom: reglages.playlist },
    ...(reglages.parAlbum
      ? [...albums].filter(([nom, n]) => n >= 2 && !reglages.albumsMasques.includes(nom) && !reglages.perso.some((p) => p.nom === nom)).map(([nom]) => ({ type: 'album', nom }))
      : []),
    ...reglages.perso.map((p) => ({ type: 'perso', nom: p.nom }))
  ]
}

const rapportFrais = () => rapport && Date.now() - rapport.recu < 20000

// Ce que Spotify contient pour cette playlist, d'après l'extension.
function etatSync(p, attendu) {
  if (!rapportFrais()) return { classe: '', texte: 'Spotify fermé' }
  const vu = rapport.playlists.find((x) => x.nom === p.nom)
  if (!vu) return { classe: '', texte: 'En attente' }
  if (vu.nb >= attendu) return { classe: 'ok', texte: 'Dans Spotify' }
  return { classe: '', texte: `${vu.nb}/${attendu} dans Spotify` }
}

function rendrePlaylists() {
  const filtre = $('#filtre').value.trim().toLowerCase()
  const enfants = []
  let i = 0
  const groupe = (titre) => {
    const li = document.createElement('li')
    li.className = 'titre-groupe'
    li.textContent = titre
    enfants.push(li)
  }
  const ligneP = (p) => {
    if (filtre && !p.nom.toLowerCase().includes(filtre)) return
    const fichiers = fichiersDe(p)
    const pochettes = fichiers.map((f) => urlPochette(morceaux.get(f))).filter(Boolean).slice(0, 4)
    const choisie = urlPochettePlaylist(p)
    const mosaique = choisie ? [choisie] : pochettes.length >= 4 ? pochettes : pochettes.slice(0, 1)
    const sync = etatSync(p, fichiers.length)
    const li = document.createElement('li')
    li.className = 'playlist-ligne'
    li.style.animationDelay = `${Math.min(i++, 12) * 22}ms`
    li.innerHTML = `
      <div class="mosaique ${mosaique.length === 1 ? 'une' : ''}">${mosaique.length ? mosaique.map((u) => `<img src="${echapper(u)}" alt="" />`).join('') : ICONE_LISTE}</div>
      <div><b>${echapper(p.nom)}</b><small>${fichiers.length} morceau${fichiers.length > 1 ? 'x' : ''}</small></div>
      <span class="sync ${sync.classe}"><span class="point"></span>${sync.texte}</span>
      ${p.type === 'generale' ? '' : `<button class="corbeille" title="${p.type === 'album' ? 'Supprimer cette playlist d’album' : 'Supprimer cette playlist'}">${ICONE_CORBEILLE}</button>`}`
    li.addEventListener('click', () => {
      ouverte = p
      rendreListe()
      ouvrirFichePlaylist(p)
    })
    li.querySelector('.corbeille')?.addEventListener('click', (e) => {
      e.stopPropagation()
      supprimerPlaylist(p, e.currentTarget)
    })
    enfants.push(li)
  }

  const toutes = toutesPlaylists()
  groupe('Automatiques')
  toutes.filter((p) => p.type !== 'perso').forEach(ligneP)
  groupe('Les tiennes')
  toutes.filter((p) => p.type === 'perso').forEach(ligneP)
  const ajout = document.createElement('li')
  ajout.innerHTML = `<button class="secondaire nouvelle-playlist">${ICONE_LISTE}Nouvelle playlist</button>`
  ajout.querySelector('button').addEventListener('click', () => champNouvellePlaylist(ajout, []))
  enfants.push(ajout)
  $('#liste').replaceChildren(...enfants)
}

// Un nom d'album reste libre : ta playlist prend alors la place de la
// playlist automatique de cet album.
function nomLibre(nom, sauf) {
  const pris = new Set([reglages.playlist, ...reglages.perso.map((p) => p.nom)].filter((n) => n !== sauf).map((n) => n.toLowerCase()))
  let essai = nom
  for (let n = 2; pris.has(essai.toLowerCase()); n++) essai = `${nom} ${n}`
  return essai
}

async function sauverPerso(perso) {
  reglages.perso = await api.enregistrerPerso(perso)
  majCompteurs()
}

// Remplace un bouton par un champ « nom de la playlist ».
function champNouvellePlaylist(conteneur, fichiers, apres) {
  const ancien = [...conteneur.childNodes]
  const form = document.createElement('form')
  form.className = 'puce nouvelle'
  form.innerHTML = '<input placeholder="Nom de la playlist" maxlength="80" />'
  conteneur.replaceChildren(form)
  const input = form.querySelector('input')
  input.focus()
  const annuler = () => conteneur.replaceChildren(...ancien)
  input.addEventListener('keydown', (e) => e.key === 'Escape' && annuler())
  input.addEventListener('blur', () => setTimeout(() => form.isConnected && annuler(), 150))
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const nom = input.value.trim()
    if (!nom) return annuler()
    const libre = nomLibre(nom)
    form.remove()
    await sauverPerso([...reglages.perso, { nom: libre, fichiers }])
    toast(`Playlist « ${libre} » créée.`)
    if (apres) apres()
    else rendreListe()
  })
}

function rendrePuces() {
  const zone = $('#puces-playlists')
  const puces = reglages.perso.map((p) => {
    const b = document.createElement('button')
    const dedans = p.fichiers.includes(choisi)
    b.className = `puce${dedans ? ' dedans' : ''}`
    b.textContent = p.nom
    b.title = dedans ? 'Retirer de cette playlist' : 'Ajouter à cette playlist'
    b.addEventListener('click', async () => {
      const perso = reglages.perso.map((x) =>
        x.nom !== p.nom ? x : { ...x, fichiers: dedans ? x.fichiers.filter((f) => f !== choisi) : [...x.fichiers, choisi] }
      )
      await sauverPerso(perso)
      rendrePuces()
      if (vue === 'playlists') rendreListe()
    })
    return b
  })
  const plus = document.createElement('span')
  plus.innerHTML = '<button class="puce nouvelle">+ Nouvelle</button>'
  plus.querySelector('button').addEventListener('click', () =>
    champNouvellePlaylist(plus, [choisi], () => {
      rendrePuces()
      if (vue === 'playlists') rendreListe()
    })
  )
  zone.replaceChildren(...puces, plus)
}

$('#btn-retour').addEventListener('click', () => {
  ouverte = null
  rendreListe()
})

$('#btn-renommer').addEventListener('click', () => {
  const titre = $('#titre-playlist-ouverte')
  const input = document.createElement('input')
  input.className = 'renommer'
  input.value = ouverte.nom
  titre.replaceChildren(input)
  input.focus()
  input.select()
  let fait = false
  const valider = async () => {
    if (fait) return
    fait = true
    const nom = input.value.trim()
    if (nom && nom !== ouverte.nom) {
      const libre = nomLibre(nom, ouverte.nom)
      if (ouverte.type === 'generale') reglages = await api.ecrireReglages({ playlist: libre })
      else await sauverPerso(reglages.perso.map((p) => (p.nom === ouverte.nom ? { ...p, nom: libre } : p)))
      ouverte = { ...ouverte, nom: libre }
      toast('Renommée. Spotify suit dans quelques secondes.')
    }
    rendreListe()
    remplirFiche()
  }
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') valider()
    if (e.key === 'Escape') {
      fait = true
      rendreListe()
    }
  })
  input.addEventListener('blur', valider)
})

let confirmation = null
$('#btn-supprimer-playlist').addEventListener('click', async () => {
  const bouton = $('#btn-supprimer-playlist')
  if (!confirmation) {
    bouton.textContent = 'Confirmer'
    confirmation = setTimeout(() => {
      bouton.textContent = 'Supprimer'
      confirmation = null
    }, 3000)
    return
  }
  clearTimeout(confirmation)
  confirmation = null
  bouton.textContent = 'Supprimer'
  await supprimerPlaylist(ouverte, Object.assign(document.createElement('button'), { className: 'armee' }))
})

// Pastille de la barre : état en direct de la liaison avec Spotify.
function majDirect() {
  const actif = rapportFrais()
  $('#point-playlist').classList.toggle('actif', !!actif)
  if (actif) {
    const s = Math.round((Date.now() - rapport.recu) / 1000)
    $('#texte-playlist').textContent = `Spotify · synchro ${s < 3 ? 'à l’instant' : `il y a ${s} s`}`
  }
}
// On ne redessine la liste que quand Spotify passe d'ouvert à fermé (ou
// l'inverse) : la redessiner chaque seconde relançait les animations.
let etaitFrais = false
setInterval(() => {
  majDirect()
  const frais = !!rapportFrais()
  if (frais !== etaitFrais && vue === 'playlists' && !ouverte) rendrePlaylists()
  etaitFrais = frais
}, 1000)
api.rapportSpotify().then((r) => {
  rapport = r
  majDirect()
})

/* ---------- Studio de pochettes ---------- */

const studio = { style: 'degrade', couleur: null, texte: 'tout' }
let imagesMosaique = []

function optionsStudio() {
  const titre = brouillon.titre || morceaux.get(choisi)?.nom || 'Sans titre'
  return {
    style: studio.style,
    titre,
    artiste: fichePlaylist ? '' : brouillon.artiste || '',
    couleur: studio.couleur || teinteAuto(titre),
    texte: studio.texte,
    images: imagesMosaique
  }
}

function appliquerStudio() {
  definirPochette(dessiner(optionsStudio()).toDataURL('image/jpeg', 0.9))
  majStudio()
}

// Aperçus : chaque style dessiné en petit, l'un après l'autre pour ne pas
// figer l'interface.
async function apercus() {
  for (const b of document.querySelectorAll('#tiroir-studio .style')) {
    await new Promise((r) => requestAnimationFrame(r))
    const grand = dessiner({ ...optionsStudio(), style: b.dataset.style })
    const c = b.querySelector('canvas')
    c.getContext('2d').drawImage(grand, 0, 0, c.width, c.height)
  }
}

function majStudio() {
  const t = $('#tiroir-studio')
  t.querySelectorAll('.style').forEach((b) => b.classList.toggle('actif', b.dataset.style === studio.style))
  t.querySelectorAll('.pastille-couleur').forEach((b) => b.classList.toggle('actif', b.dataset.couleur === (studio.couleur || 'auto')))
  t.querySelectorAll('[data-texte]').forEach((b) => b.classList.toggle('actif', b.dataset.texte === studio.texte))
  t.querySelector('input[type=color]').value = optionsStudio().couleur
}

async function ouvrirStudio() {
  // Mosaïque : les pochettes des morceaux de la playlist affichée.
  imagesMosaique = []
  if (fichePlaylist) {
    const urls = fichiersDe(fichePlaylist).map((f) => urlPochette(morceaux.get(f))).filter(Boolean).slice(0, 4)
    imagesMosaique = (await Promise.all(urls.map((u) => chargerImage(u).catch(() => null)))).filter(Boolean)
  }
  const styles = STYLES.filter((x) => !x.images || imagesMosaique.length)
  if (!styles.some((x) => x.id === studio.style)) studio.style = 'degrade'
  const t = $('#tiroir-studio')
  t.innerHTML = `
    <div class="styles">${styles.map((x) => `<button class="style" data-style="${x.id}" title="${x.nom}"><canvas width="96" height="96"></canvas><span>${x.nom}</span></button>`).join('')}</div>
    <div class="reglages-studio">
      <div class="couleurs">
        <button class="pastille-couleur auto" data-couleur="auto" title="Couleur tirée du titre">Auto</button>
        ${COULEURS.map((c) => `<button class="pastille-couleur" data-couleur="${c}" style="--c:${c}" title="${c}"></button>`).join('')}
        <label class="pipette" title="Choisir une couleur"><input type="color" /></label>
      </div>
      <div class="segments-texte">
        <button data-texte="tout">Titre et artiste</button>
        <button data-texte="titre">Titre seul</button>
        <button data-texte="aucun">Sans texte</button>
      </div>
    </div>`
  t.hidden = false
  t.querySelectorAll('.style').forEach((b) => b.addEventListener('click', () => {
    studio.style = b.dataset.style
    appliquerStudio()
  }))
  t.querySelectorAll('.pastille-couleur').forEach((b) => b.addEventListener('click', () => {
    studio.couleur = b.dataset.couleur === 'auto' ? null : b.dataset.couleur
    appliquerStudio()
    apercus()
  }))
  t.querySelector('input[type=color]').addEventListener('input', (e) => {
    studio.couleur = e.target.value
    appliquerStudio()
  })
  t.querySelector('input[type=color]').addEventListener('change', apercus)
  t.querySelectorAll('[data-texte]').forEach((b) => b.addEventListener('click', () => {
    studio.texte = b.dataset.texte
    appliquerStudio()
    apercus()
  }))
  appliquerStudio()
  apercus()
}

/* ---------- Mise à jour ---------- */

function afficherMaj(e) {
  const b = $('#btn-maj')
  const textes = { disponible: `Mise à jour ${e.version}`, telechargement: 'Téléchargement…', prete: 'Redémarrer pour mettre à jour' }
  b.hidden = !textes[e.statut]
  b.textContent = textes[e.statut] || ''
  b.disabled = e.statut === 'telechargement'
}
api.sur('maj', afficherMaj)
api.maj.etat().then(afficherMaj)
$('#btn-maj').addEventListener('click', () => api.maj.installer().catch((err) => toast(err.message)))

// Activer l'option corrige aussi les morceaux déjà dans le dossier.
$('#sans-accents').addEventListener('change', async (e) => {
  reglages = await api.ecrireReglages({ sansAccents: e.target.checked })
  if (e.target.checked) {
    await chargerBibliotheque()
    toast('Les infos de tes morceaux vont être simplifiées.')
  }
})

$('#btn-nettoyer').addEventListener('click', async () => {
  try {
    const n = await api.nettoyerSpotify()
    if (!n) toast('Rien à nettoyer pour l’instant.')
  } catch (err) {
    toast(err.message)
  }
})

/* ---------- Découpage d'un mix ---------- */

const MIX_MIN = 10 * 60 // en dessous de 10 minutes, ce n'est pas un mix
const mixe = { fichier: null, duree: 0, pochette: null, dureeVideo: 0 }
const minutes = (s) => {
  s = Math.max(0, Math.round(s))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

// Le bouton n'apparaît que sur un fichier long.
async function majBoutonMix() {
  const fichier = choisi
  $('#btn-mix').hidden = true
  if (!fichier || fichePlaylist) return
  const m = morceaux.get(fichier)
  if (m.duree === undefined) m.duree = await api.duree(fichier).catch(() => 0)
  if (choisi === fichier && !fichePlaylist) $('#btn-mix').hidden = m.duree < MIX_MIN
}

async function apercuMix() {
  const pistes = await api.mix.analyser($('#tracklist').value)
  const liste = $('#apercu-mix')
  const valides = pistes.filter((p) => p.debut < mixe.duree - 5)
  liste.replaceChildren(
    ...valides.map((p, i) => {
      const fin = i + 1 < valides.length ? valides[i + 1].debut : mixe.duree
      const li = document.createElement('li')
      li.innerHTML = `<span class="num">${String(i + 1).padStart(2, '0')}</span><span class="t">${minutes(p.debut)}</span><span>${echapper(p.artiste ? `${p.artiste} – ${p.titre}` : p.titre)}</span><span class="d">${minutes(fin - p.debut)}</span>`
      return li
    })
  )
  const bouton = $('#btn-decouper')
  bouton.disabled = valides.length < 2
  bouton.textContent = valides.length >= 2 ? `Découper en ${valides.length} morceaux` : 'Découper'
}

async function chargerTracklist(lien, carte) {
  document.querySelectorAll('.video-mix').forEach((b) => b.classList.toggle('actif', b === carte))
  const etat = $('#etat-mix')
  etat.innerHTML = '<span class="rond"></span> Lecture de la description et des 10 premiers commentaires…'
  try {
    const r = await api.mix.youtube(lien)
    mixe.dureeVideo = r.duree
    if (!$('#album-mix').value.trim() || $('#album-mix').dataset.auto === 'oui') {
      $('#album-mix').value = r.titreVideo
      $('#album-mix').dataset.auto = 'oui'
    }
    // Pochette du mix : la sienne s'il en a une, sinon la miniature de la vidéo.
    if (!morceaux.get(mixe.fichier)?.aPochette) {
      const mini = await api.miniatureYouTube(lien).catch(() => null)
      if (mini) mixe.pochette = await carre(mini.image, mini.bandes)
    }
    if (r.source) {
      $('#tracklist').value = r.texte
      const ecart = r.duree && Math.abs(r.duree - mixe.duree)
      etat.textContent = `Tracklist trouvée dans ${r.source}.` + (ecart > 15 ? ` Attention : la vidéo dure ${minutes(r.duree)} et ton fichier ${minutes(mixe.duree)}, les coupes risquent d’être décalées.` : '')
    } else {
      etat.textContent = `Pas de tracklist dans la description ni dans les ${r.commentairesLus} premiers commentaires. Colle-la ci-dessous.`
    }
  } catch (err) {
    etat.textContent = err.message
  }
  apercuMix()
}

// Carré pris au centre d'une miniature (bandes noires des 4:3 écartées).
async function carre(source, bandes) {
  const img = await chargerImage(source)
  const haut = bandes ? img.height * 0.125 : 0
  const hauteur = bandes ? img.height * 0.75 : img.height
  const cote = Math.min(img.width, hauteur)
  const c = document.createElement('canvas')
  c.width = c.height = Math.round(cote)
  c.getContext('2d').drawImage(img, (img.width - cote) / 2, haut + (hauteur - cote) / 2, cote, cote, 0, 0, cote, cote)
  return c.toDataURL('image/jpeg', 0.92)
}

async function ouvrirMix() {
  const m = morceaux.get(choisi)
  if (!m) return
  Object.assign(mixe, { fichier: m.fichier, duree: m.duree || (await api.duree(m.fichier)), pochette: null, dureeVideo: 0 })
  $('#titre-mix').textContent = `Découper « ${m.titre || m.nom} »`
  $('#intro-mix').textContent = `${minutes(mixe.duree)} de musique. Platine coupe le fichier aux minutages de la tracklist, sans perte de qualité, et range les morceaux dans une playlist au nom de l’album.`
  $('#tracklist').value = ''
  $('#album-mix').value = m.album || m.titre || ''
  $('#album-mix').dataset.auto = m.album ? 'non' : 'oui'
  $('#artiste-mix').value = m.artiste && m.artiste !== 'Artiste inconnu' ? m.artiste : ''
  $('#etat-mix').textContent = ''
  $('#apercu-mix').replaceChildren()
  $('#btn-decouper').disabled = true
  $('#btn-decouper').textContent = 'Découper'
  $('#voile-mix').hidden = false
  // Vidéos candidates, d'après le titre du fichier.
  const zone = $('#videos-mix')
  zone.innerHTML = '<span class="rond"></span>'
  try {
    const videos = (await api.rechercherYouTube(`${m.artiste === 'Artiste inconnu' ? '' : m.artiste} ${m.titre}`.trim())).slice(0, 4)
    zone.innerHTML = videos
      .map((v, i) => `<button class="video-mix" data-i="${i}" title="${echapper(v.titre)}"><img src="${echapper(v.vignette)}" alt="" /><b>${echapper(v.titre)}</b><small>${echapper(v.chaine)} · ${echapper(v.duree)}</small></button>`)
      .join('')
    zone.querySelectorAll('.video-mix').forEach((b) => b.addEventListener('click', () => chargerTracklist(`https://youtu.be/${videos[+b.dataset.i].id}`, b)))
  } catch {
    zone.textContent = ''
  }
}

$('#btn-mix').addEventListener('click', ouvrirMix)
$('#btn-mix-fermer').addEventListener('click', () => ($('#voile-mix').hidden = true))
$('#form-lien-mix').addEventListener('submit', (e) => {
  e.preventDefault()
  chargerTracklist(e.target.querySelector('input').value, null)
})
$('#tracklist').addEventListener('input', apercuMix)
$('#album-mix').addEventListener('input', () => ($('#album-mix').dataset.auto = 'non'))
api.sur('mix:avancement', ({ i, n, titre }) => {
  $('#btn-decouper').innerHTML = `<span class="rond"></span> ${i}/${n}`
  $('#etat-mix').textContent = titre
})

$('#btn-decouper').addEventListener('click', async () => {
  const bouton = $('#btn-decouper')
  bouton.disabled = true
  const album = $('#album-mix').value.trim() || 'Mix'
  try {
    const r = await api.mix.decouper({
      fichier: mixe.fichier,
      texte: $('#tracklist').value,
      album,
      artiste: $('#artiste-mix').value.trim(),
      pochette: mixe.pochette,
      corbeille: $('#corbeille-mix').checked
    })
    // La playlist de l'album prend la pochette du mix.
    const source = mixe.pochette || urlPochette(morceaux.get(mixe.fichier))
    if (source && reglages.parAlbum) {
      reglages = await api.pochettePlaylist(`album:${r.album}`, await versJpegPlaylist(source)).catch(() => reglages)
    }
    $('#voile-mix').hidden = true
    toast(`${r.morceaux} morceaux créés. La playlist « ${r.album} » arrive dans Spotify.`)
    await chargerBibliotheque()
  } catch (err) {
    toast(err.message)
    $('#etat-mix').textContent = err.message
  }
  bouton.disabled = false
  apercuMix()
})
