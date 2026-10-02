// Studio de pochettes : chaque style dessine un carré de 1000 px à partir
// d'un titre, d'un artiste et d'une couleur. Tout est fait au canvas, sans
// image externe, pour marcher hors ligne.

const T = 1000

export const STYLES = [
  { id: 'degrade', nom: 'Dégradé' },
  { id: 'disque', nom: 'Vinyle' },
  { id: 'affiche', nom: 'Affiche' },
  { id: 'neon', nom: 'Néon' },
  { id: 'suisse', nom: 'Grille' },
  { id: 'ondes', nom: 'Ondes' },
  { id: 'halo', nom: 'Halo' },
  { id: 'mosaique', nom: 'Mosaïque', images: true }
]

export const COULEURS = ['#ff4d4d', '#ff8a3d', '#ffd23f', '#3ddc97', '#2ec4ff', '#4d6bff', '#9b5cff', '#ff4fb6', '#f2efe8', '#1d1d22']

export function teinteAuto(texte) {
  let h = 0
  for (const c of texte) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return hslVersHex(h % 360, 72, 56)
}

function hexVersHsl(hex) {
  const n = parseInt(hex.slice(1), 16)
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
    h *= 60
  }
  return { h, s: s * 100, l: l * 100 }
}

function hslVersHex(h, s, l) {
  s /= 100
  l /= 100
  const k = (n) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)))).toString(16).padStart(2, '0')
  return `#${f(0)}${f(8)}${f(4)}`
}

// Variante de la couleur : décalage de teinte, saturation et luminosité.
function variante(hex, dh = 0, ds = 0, dl = 0) {
  const { h, s, l } = hexVersHsl(hex)
  return hslVersHex((h + dh + 360) % 360, Math.max(0, Math.min(100, s + ds)), Math.max(0, Math.min(100, l + dl)))
}

const estClaire = (hex) => hexVersHsl(hex).l > 62
const police = (poids, taille) => `${poids} ${taille}px "Segoe UI Variable Display", "Segoe UI", "SF Pro Display", system-ui, sans-serif`

function grain(g, force = 16) {
  const img = g.getImageData(0, 0, T, T)
  for (let i = 0; i < img.data.length; i += 4) {
    const b = (Math.random() - 0.5) * force
    img.data[i] += b
    img.data[i + 1] += b
    img.data[i + 2] += b
  }
  g.putImageData(img, 0, 0)
}

function lignes(g, texte, largeur) {
  const res = []
  let cour = ''
  for (const mot of texte.split(/\s+/)) {
    const essai = cour ? `${cour} ${mot}` : mot
    if (g.measureText(essai).width > largeur && cour) {
      res.push(cour)
      cour = mot
    } else cour = essai
  }
  if (cour) res.push(cour)
  return res
}

// Plus grand corps qui tient dans `largeur` sur `max` lignes.
function ajuster(g, texte, largeur, max, depart, poids = 800) {
  let taille = depart
  g.font = police(poids, taille)
  let l = lignes(g, texte, largeur)
  while ((l.length > max || l.some((x) => g.measureText(x).width > largeur)) && taille > 40) {
    taille -= 6
    g.font = police(poids, taille)
    l = lignes(g, texte, largeur)
  }
  return { taille, lignes: l }
}

// Bloc titre + artiste aligné en bas à gauche.
function texteBas(g, { titre, artiste, texte }, couleurTexte, { marge = 80, bas = T - 80, majuscules = true, poids = 800 } = {}) {
  if (texte === 'aucun') return
  const t = majuscules ? titre.toUpperCase() : titre
  const { taille, lignes: l } = ajuster(g, t, T - marge * 2, 3, 150, poids)
  g.fillStyle = couleurTexte
  g.textBaseline = 'alphabetic'
  g.font = police(poids, taille)
  l.forEach((x, i) => g.fillText(x, marge, bas - (l.length - 1 - i) * taille * 0.95))
  if (texte !== 'titre' && artiste) {
    g.font = police(600, 38)
    g.globalAlpha = 0.85
    g.fillText(majuscules ? artiste.toUpperCase() : artiste, marge, bas - l.length * taille * 0.95 - 12)
    g.globalAlpha = 1
  }
}

const dessins = {
  degrade(g, o) {
    const c = o.couleur
    const fond = g.createLinearGradient(0, 0, T, T)
    fond.addColorStop(0, variante(c, -10, 5, 8))
    fond.addColorStop(1, variante(c, 40, 5, -38))
    g.fillStyle = fond
    g.fillRect(0, 0, T, T)
    const lueur = g.createRadialGradient(T * 0.78, T * 0.22, 0, T * 0.78, T * 0.22, T * 0.7)
    lueur.addColorStop(0, variante(c, -40, 20, 25) + 'cc')
    lueur.addColorStop(1, 'transparent')
    g.fillStyle = lueur
    g.fillRect(0, 0, T, T)
    grain(g)
    texteBas(g, o, '#ffffff')
  },

  disque(g, o) {
    g.fillStyle = '#0b0b0d'
    g.fillRect(0, 0, T, T)
    const cx = T * 0.62, cy = T * 0.4
    g.strokeStyle = 'rgba(255,255,255,0.10)'
    g.lineWidth = 2
    for (let r = T * 0.18; r < T * 0.62; r += 14) {
      g.beginPath()
      g.arc(cx, cy, r, 0, Math.PI * 2)
      g.stroke()
    }
    g.fillStyle = o.couleur
    g.beginPath()
    g.arc(cx, cy, T * 0.16, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#0b0b0d'
    g.beginPath()
    g.arc(cx, cy, 10, 0, Math.PI * 2)
    g.fill()
    grain(g, 10)
    texteBas(g, o, '#ffffff')
  },

  affiche(g, o) {
    g.fillStyle = '#efede8'
    g.fillRect(0, 0, T, T)
    g.fillStyle = o.couleur
    g.fillRect(0, T * 0.07, T, T * 0.12)
    g.fillRect(T * 0.08, T * 0.28, T * 0.05, T * 0.05)
    grain(g, 12)
    texteBas(g, o, '#121214')
  },

  neon(g, o) {
    const fond = g.createLinearGradient(0, 0, 0, T)
    fond.addColorStop(0, '#07070b')
    fond.addColorStop(1, variante(o.couleur, 0, -20, -42))
    g.fillStyle = fond
    g.fillRect(0, 0, T, T)
    // Horizon en perspective
    g.strokeStyle = o.couleur + '55'
    g.lineWidth = 2
    for (let i = 0; i < 12; i++) {
      const y = T * 0.62 + Math.pow(i / 11, 2) * T * 0.38
      g.beginPath()
      g.moveTo(0, y)
      g.lineTo(T, y)
      g.stroke()
    }
    for (let i = -8; i <= 8; i++) {
      g.beginPath()
      g.moveTo(T / 2 + i * 30, T * 0.62)
      g.lineTo(T / 2 + i * 160, T)
      g.stroke()
    }
    if (o.texte !== 'aucun') {
      const { taille, lignes: l } = ajuster(g, o.titre.toUpperCase(), T * 0.84, 2, 140)
      g.font = police(800, taille)
      g.textAlign = 'center'
      g.shadowColor = o.couleur
      g.shadowBlur = 40
      g.lineWidth = 5
      g.strokeStyle = variante(o.couleur, 0, 0, 25)
      l.forEach((x, i) => g.strokeText(x, T / 2, T * 0.42 + (i - (l.length - 1) / 2) * taille))
      g.shadowBlur = 0
      if (o.texte !== 'titre' && o.artiste) {
        g.fillStyle = '#ffffffcc'
        g.font = police(600, 36)
        g.fillText(o.artiste.toUpperCase(), T / 2, T * 0.42 + (l.length / 2) * taille + 40)
      }
      g.textAlign = 'left'
    }
  },

  suisse(g, o) {
    g.fillStyle = '#f4f2ec'
    g.fillRect(0, 0, T, T)
    const c = o.couleur
    g.fillStyle = c
    g.fillRect(0, 0, T * 0.5, T * 0.5)
    g.fillStyle = '#121214'
    g.fillRect(T * 0.5, T * 0.5, T * 0.25, T * 0.25)
    g.fillStyle = variante(c, 30, 0, -10)
    g.beginPath()
    g.arc(T * 0.75, T * 0.25, T * 0.17, 0, Math.PI * 2)
    g.fill()
    g.strokeStyle = '#12121422'
    g.lineWidth = 2
    for (let i = 1; i < 4; i++) {
      g.beginPath()
      g.moveTo((T / 4) * i, 0)
      g.lineTo((T / 4) * i, T)
      g.moveTo(0, (T / 4) * i)
      g.lineTo(T, (T / 4) * i)
      g.stroke()
    }
    grain(g, 8)
    texteBas(g, o, '#121214', { majuscules: false, poids: 700 })
  },

  ondes(g, o) {
    const sombre = !estClaire(o.couleur)
    g.fillStyle = sombre ? '#0d0d10' : '#f4f2ec'
    g.fillRect(0, 0, T, T)
    g.strokeStyle = o.couleur
    g.lineWidth = 4
    for (let k = 0; k < 26; k++) {
      const y0 = T * 0.12 + k * 22
      g.beginPath()
      for (let x = 0; x <= T; x += 8) {
        const env = Math.sin((x / T) * Math.PI)
        const y = y0 - env * Math.sin(x / 38 + k * 0.5) * 18 * (1 + (k % 5)) * 0.7
        x ? g.lineTo(x, y) : g.moveTo(x, y)
      }
      g.globalAlpha = 0.35 + (k / 26) * 0.65
      g.stroke()
    }
    g.globalAlpha = 1
    texteBas(g, o, sombre ? '#ffffff' : '#121214')
  },

  halo(g, o) {
    g.fillStyle = '#0a0a0c'
    g.fillRect(0, 0, T, T)
    for (const [x, y, r, dh] of [[0.35, 0.4, 0.5, 0], [0.68, 0.55, 0.42, 50], [0.5, 0.25, 0.3, -40]]) {
      const halo = g.createRadialGradient(T * x, T * y, 0, T * x, T * y, T * r)
      halo.addColorStop(0, variante(o.couleur, dh, 0, 5) + 'ee')
      halo.addColorStop(1, 'transparent')
      g.fillStyle = halo
      g.fillRect(0, 0, T, T)
    }
    grain(g, 22)
    if (o.texte !== 'aucun') {
      g.fillStyle = '#ffffff'
      g.textAlign = 'center'
      g.font = police(600, 54)
      g.fillText(o.titre, T / 2, T - 120, T * 0.86)
      if (o.texte !== 'titre' && o.artiste) {
        g.globalAlpha = 0.7
        g.font = police(500, 32)
        g.fillText(o.artiste, T / 2, T - 72, T * 0.86)
        g.globalAlpha = 1
      }
      g.textAlign = 'left'
    }
  },

  mosaique(g, o) {
    g.fillStyle = '#0b0b0d'
    g.fillRect(0, 0, T, T)
    const imgs = o.images.slice(0, 4)
    const n = imgs.length >= 4 ? 2 : 1
    const cote = T / n
    imgs.slice(0, n * n).forEach((img, i) => {
      const c = Math.min(img.width, img.height)
      g.drawImage(img, (img.width - c) / 2, (img.height - c) / 2, c, c, (i % n) * cote, Math.floor(i / n) * cote, cote, cote)
    })
    if (o.texte !== 'aucun') {
      g.fillStyle = o.couleur
      g.fillRect(0, T * 0.74, T, T * 0.26)
      texteBas(g, { ...o, artiste: o.texte === 'titre' ? '' : o.artiste }, estClaire(o.couleur) ? '#121214' : '#ffffff', { bas: T - 70 })
    }
  }
}

// Dessine dans un canvas de 1000 px et renvoie le canvas.
export function dessiner({ style = 'degrade', titre = '', artiste = '', couleur = '#4d6bff', texte = 'tout', images = [] }) {
  const c = document.createElement('canvas')
  c.width = c.height = T
  const g = c.getContext('2d', { willReadFrequently: true })
  const dessin = dessins[style] && (style !== 'mosaique' || images.length) ? dessins[style] : dessins.degrade
  dessin(g, { titre: titre || 'Sans titre', artiste, couleur, texte, images })
  return c
}
