// Liaison avec l'extension Spicetify. Platine ouvre un petit serveur local,
// joignable seulement depuis ce PC :
//   GET  /consignes : les playlists voulues (générale, par album, les tiennes)
//   POST /rapport   : ce que Spotify contient vraiment, pour l'afficher en direct
//   GET  /rapport   : le dernier reçu (diagnostic)
//   GET  /pochette/<clé> : l'image choisie pour une playlist
//   GET  /attendre?v= : répond dès que les consignes changent

const http = require('http')

const PORT = 47321

// Attente longue : l'extension garde une requête ouverte, Platine y répond dès
// qu'une consigne change. Windows bride les minuteurs d'une fenêtre en
// arrière-plan (une fois par minute), pas les réponses réseau.
let version = 1
const enAttente = new Set()

function signaler() {
  version++
  for (const res of enAttente) res.end(JSON.stringify({ v: version }))
  enAttente.clear()
}

function demarrer({ consignes, rapport, dernier, pochette }) {
  const serveur = http.createServer(async (req, res) => {
    if (process.env.PLATINE_JOURNAL) require('fs').appendFileSync(process.env.PLATINE_JOURNAL, `${new Date().toISOString()} ${req.method} ${req.url} ${req.headers.origin || ''}
`)
    // Spotify tourne sur une origine https : Chromium exige ces en-têtes
    // pour laisser une page appeler un serveur du réseau local.
    res.setHeader('access-control-allow-origin', '*')
    res.setHeader('access-control-allow-headers', 'content-type')
    res.setHeader('access-control-allow-private-network', 'true')
    if (req.method === 'OPTIONS') return res.writeHead(204).end()

    try {
      if (req.method === 'GET' && req.url === '/consignes') {
        res.writeHead(200, { 'content-type': 'application/json' })
        return res.end(JSON.stringify(await consignes()))
      }
      if (req.method === 'GET' && req.url.startsWith('/attendre')) {
        const connue = Number(new URL(req.url, 'http://x').searchParams.get('v'))
        res.writeHead(200, { 'content-type': 'application/json' })
        if (connue !== version) return res.end(JSON.stringify({ v: version }))
        enAttente.add(res)
        const fin = setTimeout(() => enAttente.delete(res) && res.end(JSON.stringify({ v: version })), 25000)
        res.on('close', () => {
          clearTimeout(fin)
          enAttente.delete(res)
        })
        return
      }
      if (req.method === 'GET' && req.url.startsWith('/pochette/')) {
        const image = pochette(decodeURIComponent(req.url.slice('/pochette/'.length).split('?')[0]))
        if (!image) return res.writeHead(404).end()
        res.writeHead(200, { 'content-type': 'image/jpeg' })
        return res.end(image)
      }
      if (req.method === 'GET' && req.url === '/rapport') {
        res.writeHead(200, { 'content-type': 'application/json' })
        return res.end(JSON.stringify(dernier()))
      }
      if (req.method === 'POST' && req.url === '/rapport') {
        let corps = ''
        for await (const morceau of req) {
          corps += morceau
          if (corps.length > 2e6) throw new Error('Rapport trop gros')
        }
        rapport(JSON.parse(corps))
        return res.writeHead(204).end()
      }
      res.writeHead(404).end()
    } catch (err) {
      res.writeHead(500).end(String(err.message))
    }
  })
  serveur.on('error', (err) => console.error('[liaison]', err.message))
  serveur.listen(PORT, '127.0.0.1')
  return serveur
}

module.exports = { demarrer, signaler, PORT }
