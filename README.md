# Platine

Ta bibliothèque de MP3, propre dans Spotify.

Platine surveille un dossier de musique et prépare chaque fichier pour Spotify :
conversion en MP3, titre nettoyé, artiste, album, pochette. Les morceaux
apparaissent dans les fichiers locaux de Spotify, sur l'ordinateur comme sur le
téléphone.

- **Pochettes** : miniature d'une vidéo YouTube trouvée par le nom, image
  importée, catalogue iTunes, ou studio de pochettes (sept styles, couleur libre).
- **Playlists automatiques** (optionnel) : une playlist générale, une par album,
  et les tiennes, remplies toutes seules, avec leur nom et leur image.
- **Scène 3D** : la pochette et son vinyle, en Three.js.

Platine ne télécharge pas de musique : elle range les fichiers que tu as déjà.

## Playlists automatiques

Spotify ne laisse aucune application ajouter un fichier local à une playlist.
Pour le faire quand même, Platine installe, sur ta demande, [Spicetify](https://spicetify.app)
(open source, licence MIT), qui ajoute une extension à l'app Spotify de
l'ordinateur. Spotify ne l'autorise pas officiellement mais le tolère. Après
une mise à jour de Spotify, Platine propose de réactiver ; « Désactiver » remet
Spotify d'origine. Sans ce mode, tout le reste fonctionne.

La version Microsoft Store de Spotify ne peut pas être modifiée : installe
Spotify depuis spotify.com.

## Développement

```
npm install
npm start
```

`npm run dist:win` construit l'installeur Windows. Les `.dmg` sont construits
par GitHub Actions à chaque tag `vX.Y.Z` (voir `.github/workflows/release.yml`).

## English

Platine watches a music folder and gets each file ready for Spotify (MP3,
clean title, artist, album, cover), with optional automatic playlists through
a Spicetify extension. It does not download music.

## Licence

MIT
