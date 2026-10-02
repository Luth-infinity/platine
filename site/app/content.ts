/**
 * Les textes du site, dans les deux langues. La vitrine ne contient pas une
 * phrase en dur : sinon l'anglais finit par prendre du retard sur le français.
 * Les captures de l'app restent en français dans les deux langues.
 */

export type Langue = 'fr' | 'en';

export type Contenu = {
  meta: { title: string; description: string };
  nav: { fonctionnement: string; telecharger: string; versions: string; langue: string };
  hero: { titre: string; texte: string; bouton: string; boutonMac: string; plateformes: string };
  rangement: { titre: string; texte: string; avant: string; apres: string; champs: [string, string, string] };
  pochettes: { titre: string; texte: string; sources: { nom: string; texte: string }[]; styles: string[]; stylesTitre: string };
  playlists: { titre: string; texte: string; points: { nom: string; texte: string }[] };
  honnete: { titre: string; texte: string; colonnes: { titre: string; texte: string }[]; limites: string[] };
  telecharger: {
    titre: string;
    windows: string;
    macArm: string;
    macIntel: string;
    version: string;
    toutes: string;
    premiers: { titre: string; texte: string }[];
  };
  journal: { titre: string; vide: string };
  pied: { par: string; code: string; licence: string };
};

export const fr: Contenu = {
  meta: {
    title: 'Platine, tes MP3 propres dans Spotify',
    description:
      'Platine range ton dossier de MP3 pour Spotify : titres nettoyés, pochettes, playlists qui se remplissent toutes seules. Windows et macOS, gratuit, open source.'
  },
  nav: { fonctionnement: 'Fonctionnement', telecharger: 'Télécharger', versions: 'Versions', langue: 'Langue' },
  hero: {
    titre: 'Platine',
    texte:
      'Tes MP3 rangés et propres dans Spotify. Dépose un fichier dans ton dossier : titre, artiste, pochette, playlist, Platine s’occupe du reste.',
    bouton: 'Télécharger pour Windows',
    boutonMac: 'Télécharger pour macOS',
    plateformes: 'Windows et macOS · gratuit · open source'
  },
  rangement: {
    titre: 'Dépose, c’est rangé',
    texte:
      'Platine surveille ton dossier de musique. Chaque fichier qui arrive est converti en MP3 si besoin, son titre est nettoyé et l’artiste retrouvé. Il apparaît aussitôt dans les fichiers locaux de Spotify.',
    avant: 'Le fichier',
    apres: 'Dans Spotify',
    champs: ['Titre', 'Artiste', 'Album']
  },
  pochettes: {
    titre: 'Une pochette pour chaque morceau',
    texte: 'Une pochette s’ajoute en un clic et se retrouve dans Spotify, sur l’ordinateur comme sur le téléphone.',
    sources: [
      { nom: 'Image YouTube', texte: 'Platine cherche la vidéo d’après le titre et propose ses miniatures, recadrées au carré.' },
      { nom: 'Studio', texte: 'Sept styles à composer, n’importe quelle couleur, avec ou sans texte.' },
      { nom: 'Importer', texte: 'Une image de ton ordinateur, glissée sur la pochette.' },
      { nom: 'Catalogue', texte: 'La pochette officielle, quand le morceau existe en album.' }
    ],
    stylesTitre: 'Les styles du studio',
    styles: ['Dégradé', 'Vinyle', 'Affiche', 'Néon', 'Grille', 'Ondes', 'Halo', 'Mosaïque']
  },
  playlists: {
    titre: 'Les playlists suivent',
    texte:
      'Avec le mode playlists, chaque nouveau morceau rejoint ses playlists dans Spotify, et ce que tu changes dans Platine y est repris en quelques secondes.',
    points: [
      { nom: 'Une playlist générale', texte: 'Tout ton dossier, toujours à jour.' },
      { nom: 'Une par album', texte: 'Dès que deux morceaux partagent un album.' },
      { nom: 'Les tiennes', texte: 'Créées dans Platine, un clic pour y ajouter un morceau.' },
      { nom: 'Nom et image', texte: 'Renomme une playlist ou change son image : Spotify suit.' }
    ]
  },
  honnete: {
    titre: 'Comment marchent les playlists',
    texte:
      'Spotify ne laisse aucune application ajouter un fichier local à une playlist. Pour y arriver, Platine installe sur ta demande Spicetify, un outil open source qui ajoute une extension à l’app Spotify de ton ordinateur.',
    colonnes: [
      { titre: 'Sans le mode playlists', texte: 'Tout le reste fonctionne : rangement, pochettes, fichiers locaux. Les playlists se remplissent à la main, Ctrl+A puis glisser.' },
      { titre: 'Avec', texte: 'Un clic dans Platine installe Spicetify, sauvegarde Spotify et relance l’app. Spotify ne l’autorise pas officiellement, mais le tolère.' },
      { titre: 'Pour revenir en arrière', texte: 'Le bouton Désactiver remet Spotify d’origine. Après une mise à jour de Spotify, Platine propose de réactiver.' }
    ],
    limites: [
      'La version Microsoft Store de Spotify ne peut pas être modifiée : installe Spotify depuis spotify.com.',
      'Sur Mac, macOS peut demander d’autoriser la modification de Spotify. Platine indique la commande à taper.',
      'Aucun compte à relier : Platine travaille avec l’app Spotify de l’ordinateur, en gratuit comme en Premium.',
      'Platine ne télécharge pas de musique : elle range les fichiers que tu as déjà.'
    ]
  },
  telecharger: {
    titre: 'Télécharger',
    windows: 'Windows',
    macArm: 'macOS · Apple Silicon',
    macIntel: 'macOS · Intel',
    version: 'Version',
    toutes: 'Toutes les versions',
    premiers: [
      { titre: 'Premier lancement sur Windows', texte: 'Windows ne connaît pas encore Platine : clique sur « Informations complémentaires » puis « Exécuter quand même ».' },
      { titre: 'Premier lancement sur Mac', texte: 'Platine n’est pas signée par Apple : fais un clic droit sur l’app, puis Ouvrir.' },
      { titre: 'Sur le téléphone', texte: 'Télécharge la playlist dans Spotify, avec le téléphone sur le même Wi-Fi que l’ordinateur. Spotify réserve cette étape à Premium : en gratuit, tout fonctionne sur l’ordinateur.' }
    ]
  },
  journal: { titre: 'Versions', vide: 'La première version arrive.' },
  pied: { par: 'Une app de Luth', code: 'Code source', licence: 'Licence MIT' }
};

export const en: Contenu = {
  meta: {
    title: 'Platine, your MP3s, tidy in Spotify',
    description:
      'Platine gets your MP3 folder ready for Spotify: clean titles, covers, playlists that fill themselves. Windows and macOS, free, open source.'
  },
  nav: { fonctionnement: 'How it works', telecharger: 'Download', versions: 'Releases', langue: 'Language' },
  hero: {
    titre: 'Platine',
    texte:
      'Your MP3s, tidy in Spotify. Drop a file in your folder: title, artist, cover, playlist, Platine handles the rest.',
    bouton: 'Download for Windows',
    boutonMac: 'Download for macOS',
    plateformes: 'Windows and macOS · free · open source'
  },
  rangement: {
    titre: 'Drop it, it’s sorted',
    texte:
      'Platine watches your music folder. Every new file is converted to MP3 if needed, its title cleaned up and its artist found. It shows up right away in Spotify’s local files.',
    avant: 'The file',
    apres: 'In Spotify',
    champs: ['Title', 'Artist', 'Album']
  },
  pochettes: {
    titre: 'A cover for every track',
    texte: 'Add a cover in one click and find it in Spotify, on your computer and on your phone.',
    sources: [
      { nom: 'YouTube image', texte: 'Platine finds the video from the title and offers its thumbnails, cropped square.' },
      { nom: 'Studio', texte: 'Seven styles to compose, any colour, with or without text.' },
      { nom: 'Import', texte: 'An image from your computer, dropped on the cover.' },
      { nom: 'Catalogue', texte: 'The official cover, when the track exists on an album.' }
    ],
    stylesTitre: 'Studio styles',
    styles: ['Gradient', 'Vinyl', 'Poster', 'Neon', 'Grid', 'Waves', 'Halo', 'Mosaic']
  },
  playlists: {
    titre: 'Playlists follow',
    texte:
      'With playlist mode on, every new track joins its playlists in Spotify, and whatever you change in Platine shows up there within seconds.',
    points: [
      { nom: 'One main playlist', texte: 'Your whole folder, always up to date.' },
      { nom: 'One per album', texte: 'As soon as two tracks share an album.' },
      { nom: 'Your own', texte: 'Made in Platine, one click to add a track.' },
      { nom: 'Name and image', texte: 'Rename a playlist or change its image: Spotify follows.' }
    ]
  },
  honnete: {
    titre: 'How playlists work',
    texte:
      'Spotify lets no app add a local file to a playlist. To get there, Platine installs Spicetify when you ask, an open-source tool that adds an extension to the Spotify app on your computer.',
    colonnes: [
      { titre: 'Without playlist mode', texte: 'Everything else works: sorting, covers, local files. Playlists are filled by hand, Ctrl+A then drag.' },
      { titre: 'With it', texte: 'One click in Platine installs Spicetify, backs up Spotify and restarts the app. Spotify does not officially allow it, but tolerates it.' },
      { titre: 'To go back', texte: 'The Disable button restores the original Spotify. After a Spotify update, Platine offers to turn it back on.' }
    ],
    limites: [
      'The Microsoft Store version of Spotify cannot be modified: install Spotify from spotify.com.',
      'On a Mac, macOS may ask before Spotify can be modified. Platine shows the command to type.',
      'No account to link: Platine works with the Spotify app on your computer, free or Premium.',
      'Platine does not download music: it tidies the files you already have.'
    ]
  },
  telecharger: {
    titre: 'Download',
    windows: 'Windows',
    macArm: 'macOS · Apple Silicon',
    macIntel: 'macOS · Intel',
    version: 'Version',
    toutes: 'All releases',
    premiers: [
      { titre: 'First launch on Windows', texte: 'Windows does not know Platine yet: click “More info”, then “Run anyway”.' },
      { titre: 'First launch on Mac', texte: 'Platine is not signed by Apple: right-click the app, then Open.' },
      { titre: 'On your phone', texte: 'Download the playlist in Spotify, with your phone on the same Wi-Fi as your computer. Spotify keeps this step for Premium: on a free account, everything works on the computer.' }
    ]
  },
  journal: { titre: 'Releases', vide: 'The first release is on its way.' },
  pied: { par: 'An app by Luth', code: 'Source code', licence: 'MIT licence' }
};
