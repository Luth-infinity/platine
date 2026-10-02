// La scène : une pochette debout et son vinyle qui en dépasse et tourne.
// Changer de morceau rentre le disque dans la pochette, change l'image,
// puis le ressort. Derrière, un halo prend la couleur de la pochette.

import * as THREE from 'three'
import { RoomEnvironment } from './vendor/RoomEnvironment.js'

const SORTI = 1.05
const RENTRE = -0.55

function texteSillons() {
  const c = document.createElement('canvas')
  c.width = c.height = 1024
  const g = c.getContext('2d')
  g.fillStyle = '#0a0a0b'
  g.fillRect(0, 0, 1024, 1024)
  // Sillons : anneaux fins de luminosité variable, plages plus sombres entre
  // les morceaux.
  for (let r = 175; r < 505; r += 1.6) {
    const plage = Math.sin(r * 0.045) > 0.93
    g.strokeStyle = plage ? 'rgba(0,0,0,0.9)' : `rgba(255,255,255,${0.01 + Math.random() * 0.02})`
    g.lineWidth = plage ? 2 : 0.7
    g.beginPath()
    g.arc(512, 512, r, 0, Math.PI * 2)
    g.stroke()
  }
  // Reflet en éventail, comme une lumière rasante sur le vinyle.
  const reflet = g.createConicGradient(0, 512, 512)
  reflet.addColorStop(0, 'rgba(255,255,255,0)')
  reflet.addColorStop(0.08, 'rgba(255,255,255,0.22)')
  reflet.addColorStop(0.16, 'rgba(255,255,255,0)')
  reflet.addColorStop(0.5, 'rgba(255,255,255,0)')
  reflet.addColorStop(0.58, 'rgba(255,255,255,0.16)')
  reflet.addColorStop(0.66, 'rgba(255,255,255,0)')
  reflet.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = reflet
  g.beginPath()
  g.arc(512, 512, 505, 0, Math.PI * 2)
  g.fill()
  // Bord légèrement plus clair.
  g.strokeStyle = 'rgba(255,255,255,0.3)'
  g.lineWidth = 5
  g.beginPath()
  g.arc(512, 512, 507, 0, Math.PI * 2)
  g.stroke()
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

function pochetteVide() {
  const c = document.createElement('canvas')
  c.width = c.height = 512
  const g = c.getContext('2d')
  const fond = g.createLinearGradient(0, 0, 512, 512)
  fond.addColorStop(0, '#2a2b31')
  fond.addColorStop(1, '#141418')
  g.fillStyle = fond
  g.fillRect(0, 0, 512, 512)
  g.strokeStyle = 'rgba(255,255,255,0.18)'
  g.lineWidth = 10
  g.lineCap = 'round'
  g.lineJoin = 'round'
  g.beginPath()
  g.moveTo(220, 330)
  g.lineTo(220, 170)
  g.lineTo(330, 150)
  g.lineTo(330, 300)
  g.stroke()
  g.beginPath()
  g.arc(196, 330, 26, 0, Math.PI * 2)
  g.arc(306, 300, 26, 0, Math.PI * 2)
  g.stroke()
  return c
}

function couleurMoyenne(image) {
  const c = document.createElement('canvas')
  c.width = c.height = 16
  const g = c.getContext('2d', { willReadFrequently: true })
  g.drawImage(image, 0, 0, 16, 16)
  const d = g.getImageData(0, 0, 16, 16).data
  // Moyenne pondérée par la saturation : un fond noir ne doit pas éteindre
  // l'accent coloré de la pochette.
  let r = 0, v = 0, b = 0, poids = 0
  for (let i = 0; i < d.length; i += 4) {
    const max = Math.max(d[i], d[i + 1], d[i + 2])
    const min = Math.min(d[i], d[i + 1], d[i + 2])
    const p = 0.15 + (max - min) / 255
    r += d[i] * p
    v += d[i + 1] * p
    b += d[i + 2] * p
    poids += p
  }
  return new THREE.Color(r / poids / 255, v / poids / 255, b / poids / 255)
}

const doux = (t) => 1 - Math.pow(1 - t, 3)
const rebond = (t) => {
  const c1 = 1.4, c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}

export function creerScene(canvas) {
  const rendu = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
  rendu.setPixelRatio(Math.min(devicePixelRatio, 2))
  rendu.toneMapping = THREE.ACESFilmicToneMapping
  rendu.outputColorSpace = THREE.SRGBColorSpace

  const scene = new THREE.Scene()
  const pmrem = new THREE.PMREMGenerator(rendu)
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100)
  camera.position.set(0, 0.15, 9)

  const lumiere = new THREE.DirectionalLight(0xffffff, 1.6)
  lumiere.position.set(-3, 4, 5)
  scene.add(lumiere, new THREE.AmbientLight(0xffffff, 0.25))

  // Halo coloré derrière l'ensemble.
  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 14),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { couleur: { value: new THREE.Color(0x444450) }, force: { value: 0.5 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader:
        'uniform vec3 couleur; uniform float force; varying vec2 vUv; void main(){ float d = distance(vUv, vec2(0.5)); float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(couleur, a * a * force); }'
    })
  )
  halo.position.set(0.2, 0, -2.5)
  scene.add(halo)

  const ensemble = new THREE.Group()
  scene.add(ensemble)

  // Vinyle
  const disque = new THREE.Group()
  const sillons = texteSillons()
  const matDisque = new THREE.MeshStandardMaterial({ map: sillons, roughness: 0.22, metalness: 0, envMapIntensity: 0.35 })
  const matTranche = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.5 })
  const galette = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.03, 128), [matTranche, matDisque, matDisque])
  galette.rotation.x = Math.PI / 2
  disque.add(galette)
  const matEtiquette = new THREE.MeshStandardMaterial({ roughness: 0.6 })
  const etiquette = new THREE.Mesh(new THREE.CircleGeometry(0.52, 96), matEtiquette)
  etiquette.position.z = 0.017
  disque.add(etiquette)
  const trou = new THREE.Mesh(new THREE.CircleGeometry(0.035, 32), new THREE.MeshBasicMaterial({ color: 0x050505 }))
  trou.position.z = 0.018
  disque.add(trou)
  disque.position.set(SORTI, 0, -0.06)
  ensemble.add(disque)

  // Pochette
  const matFace = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0 })
  const matCarton = new THREE.MeshStandardMaterial({ color: 0x1a1a1e, roughness: 0.8 })
  const pochette = new THREE.Mesh(new THREE.BoxGeometry(3.15, 3.15, 0.05), [matCarton, matCarton, matCarton, matCarton, matFace, matCarton])
  pochette.position.set(-0.55, 0, 0)
  ensemble.add(pochette)

  // Ombre douce sous l'ensemble.
  const ombreC = document.createElement('canvas')
  ombreC.width = ombreC.height = 128
  const og = ombreC.getContext('2d')
  const grad = og.createRadialGradient(64, 64, 0, 64, 64, 64)
  grad.addColorStop(0, 'rgba(0,0,0,0.55)')
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  og.fillStyle = grad
  og.fillRect(0, 0, 128, 128)
  const ombre = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.9), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(ombreC), transparent: true, depthWrite: false }))
  ombre.position.set(0.1, -1.95, -0.3)
  ombre.rotation.x = -Math.PI / 2.4
  scene.add(ombre)

  const chargeur = new THREE.TextureLoader()
  const texVide = new THREE.CanvasTexture(pochetteVide())
  texVide.colorSpace = THREE.SRGBColorSpace

  function appliquer(texture, couleur) {
    matFace.map = texture
    matEtiquette.map = texture
    matFace.needsUpdate = matEtiquette.needsUpdate = true
    cible.couleur.copy(couleur)
  }

  const cible = { couleur: new THREE.Color(0x444450) }
  let anim = null // { debut, phase: 'rentre' | 'sort', texture, couleur }
  let actuelle = null
  appliquer(texVide, new THREE.Color(0x3a3a44))

  function charger(url) {
    return new Promise((resolve) => {
      if (!url) return resolve({ texture: texVide, couleur: new THREE.Color(0x3a3a44) })
      chargeur.load(
        url,
        (t) => {
          t.colorSpace = THREE.SRGBColorSpace
          t.anisotropy = 8
          resolve({ texture: t, couleur: couleurMoyenne(t.image) })
        },
        undefined,
        () => resolve({ texture: texVide, couleur: new THREE.Color(0x3a3a44) })
      )
    })
  }

  // Change de pochette. `glisse` : rentrer et ressortir le disque (changement
  // de morceau) ; sinon la nouvelle image remplace l'ancienne sur place.
  async function definir(url, { glisse = true } = {}) {
    actuelle = url
    const prete = await charger(url)
    if (actuelle !== url) return
    // Une animation en cours appliquerait l'ancienne image en fin de course.
    if (!glisse && anim) return Object.assign(anim, prete)
    if (!glisse) return appliquer(prete.texture, prete.couleur)
    anim = { debut: performance.now(), phase: 'rentre', ...prete, depart: disque.position.x }
  }

  // Parallaxe à la souris.
  const souris = { x: 0, y: 0 }
  canvas.parentElement.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect()
    souris.x = ((e.clientX - r.left) / r.width - 0.5) * 2
    souris.y = ((e.clientY - r.top) / r.height - 0.5) * 2
  })
  canvas.parentElement.addEventListener('pointerleave', () => (souris.x = souris.y = 0))

  function redimensionner() {
    const { clientWidth: l, clientHeight: h } = canvas.parentElement
    rendu.setSize(l, h, false)
    camera.aspect = l / h
    // On recule la caméra quand la zone est étroite pour garder tout visible.
    camera.position.z = Math.max(8.2, 7.4 / Math.min(1, camera.aspect / 1.1))
    camera.updateProjectionMatrix()
  }
  new ResizeObserver(redimensionner).observe(canvas.parentElement)
  redimensionner()

  let avant = performance.now()
  const debut = avant
  let tourne = true
  function boucle() {
    requestAnimationFrame(boucle)
    if (document.hidden) return
    const maintenant = performance.now()
    const dt = Math.min((maintenant - avant) / 1000, 0.05)
    avant = maintenant
    const t = (maintenant - debut) / 1000

    if (tourne) galette.rotation.y -= dt * 0.9
    etiquette.rotation.z = -galette.rotation.y
    // Flottement léger.
    ensemble.position.y = Math.sin(t * 0.8) * 0.04
    ensemble.rotation.y += (souris.x * 0.28 - 0.18 - ensemble.rotation.y) * 0.06
    ensemble.rotation.x += (souris.y * 0.12 - ensemble.rotation.x) * 0.06

    if (anim) {
      const ecoule = performance.now() - anim.debut
      if (anim.phase === 'rentre') {
        const p = Math.min(ecoule / 320, 1)
        disque.position.x = anim.depart + (RENTRE - anim.depart) * doux(p)
        if (p === 1) {
          appliquer(anim.texture, anim.couleur)
          anim = { ...anim, phase: 'sort', debut: performance.now() }
        }
      } else {
        const p = Math.min(ecoule / 650, 1)
        disque.position.x = RENTRE + (SORTI - RENTRE) * rebond(p)
        if (p === 1) anim = null
      }
    }

    const u = halo.material.uniforms
    u.couleur.value.lerp(cible.couleur, 0.05)
    rendu.render(scene, camera)
  }
  boucle()

  return { definir, pause: (v) => (tourne = !v) }
}
