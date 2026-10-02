# Platine

App Electron (sans bundler) : `main.js` + `lib/` côté Node, `renderer/` en
HTML/CSS/JS modules, Three.js copié dans `renderer/vendor` par `npm run vendor`
(electron-builder exclut `examples/` de node_modules). Extension Spotify dans
`spicetify/platine.js`.

## Règle de fond

Platine ne télécharge jamais l'audio d'une vidéo (YouTube ou autre) : refus
explicite, ne pas ajouter yt-dlp. La miniature YouTube comme pochette (image
seule) est acceptée.

## Liaison avec Spotify

- Serveur local `127.0.0.1:47321` (`lib/liaison.js`) : `GET /consignes`,
  `POST /rapport`, `GET /rapport`, `GET /pochette/<clé>`, `GET /attendre?v=`.
  L'extension garde `/attendre` ouvert et se synchronise dès que Platine appelle
  `liaison.signaler()` (~1,5 s mesuré, Spotify en arrière-plan) ; les minuteurs,
  eux, tombent à 1/min en arrière-plan. Tout changement de consigne doit passer
  par `signaler()` (fait dans `ecrireReglages`, l'enregistrement, la relecture).
- Rapport : `illisibles` liste les entrées que Spotify ne sait pas lire.
- **Une Platine de test sert le même port** et le vrai Spotify lui obéit :
  lancer les tests avec `PLATINE_SANS_LIAISON=1`.
- Clés de playlist : `generale`, `perso:<id>`, `album:<nom>` → uri, gardées dans
  le localStorage de Spotify (`platine-playlists`). Renommer :
  `PlaylistAPI.setAttributes(uri, { name })`. Supprimer : seulement une playlist
  reliée, `RootlistAPI.remove([{ uri }])`, jamais par nom.
- Image de playlist : `PlaylistAPI.uploadImage(File)` puis
  `updateDetails(uri, { imageUploadToken })`, JPEG < 256 Ko.

## Pièges Spotify (fichiers locaux)

- URI locale = `artiste:album:titre:durée`. Un fichier pas encore analysé a une
  durée `-1`, rangée `0` dans la playlist → comparer sans la durée, ignorer
  `:-1`/`:0`, coupe-circuit à 2 essais.
- Spotify garde les anciennes versions d'un fichier retagué. L'extension ne
  prend que les morceaux listés par Platine (`consignes.pistes`), en préférant
  même album + pochette. Une entrée périmée se lit sur PC mais **ne se télécharge
  pas sur le téléphone**.
- `PlaylistAPI.remove` échoue parfois sans rien dire : l'extension reconstruit
  alors la playlist une fois.
- Spotify ne relit pas un fichier déjà connu : après chaque modification,
  Platine le cache 8 s (`.mp3.platine`) puis le remet (`faireRelire`).
- **Ne jamais toucher `Spotify/Users/<id>-user/local-files.bnk`** : c'est la
  liste des dossiers sources, pas un cache.
- Téléphone resté sur l'ancienne playlist : Paramètres Android → Applications →
  Spotify → Stockage → Vider le cache.

## Spicetify (`lib/spicetify.js`)

Installé à la demande depuis la release GitHub officielle (Windows :
`%LOCALAPPDATA%\spicetify`, macOS : `~/.spicetify`). Si Spotify a changé de
version depuis la sauvegarde et que ses fichiers d'origine ont disparu,
`backup` est impossible : seule une réinstallation de Spotify par-dessus règle
le cas (message prévu). Version Microsoft Store : non modifiable. macOS : droits
d'écriture sur `Spotify.app` parfois nécessaires.

## Release

Tag `vX.Y.Z` → `.github/workflows/release.yml` construit Windows + deux `.dmg`
(ffmpeg retéléchargé pour Intel), publie la release, `latest.yml` sert à
`lib/maj.js`. Notes de version : français, puis `## English`.
