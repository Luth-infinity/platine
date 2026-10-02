const { contextBridge, ipcRenderer, webUtils } = require('electron')

const appeler = async (canal, ...args) => {
  const r = await ipcRenderer.invoke(canal, ...args)
  if (!r.ok) throw new Error(r.erreur)
  return r.valeur
}

contextBridge.exposeInMainWorld('platine', {
  reglages: () => appeler('reglages:lire'),
  ecrireReglages: (modifs) => appeler('reglages:ecrire', modifs),
  choisirDossier: () => appeler('dossier:choisir'),
  ouvrirDossier: () => appeler('dossier:ouvrir'),
  copierDossier: () => appeler('dossier:copier'),
  montrer: (fichier) => appeler('fichier:montrer', fichier),
  ouvrirSpotify: () => appeler('spotify:ouvrir'),
  ouvrirLien: (url) => appeler('lien:ouvrir', url),
  lister: () => appeler('bibliotheque:lister'),
  // Electron ne donne plus `file.path` : il faut passer par webUtils.
  ajouter: (fichiers) => appeler('bibliotheque:ajouter', [...fichiers].map((f) => webUtils.getPathForFile(f))),
  enregistrer: (fichier, modifs) => appeler('piste:enregistrer', fichier, modifs),
  supprimer: (fichier) => appeler('piste:supprimer', fichier),
  chercher: (terme) => appeler('piste:chercher', terme),
  miniatureYouTube: (lien) => appeler('pochette:youtube', lien),
  rechercherYouTube: (terme) => appeler('youtube:rechercher', terme),
  choisirImage: () => appeler('pochette:choisir'),
  enregistrerPerso: (perso) => appeler('perso:enregistrer', perso),
  rapportSpotify: () => appeler('spotify:rapport'),
  nettoyerSpotify: () => appeler('spotify:nettoyer'),
  masquerAlbum: (nom) => appeler('album:masquer', nom),
  pochettePlaylist: (cle, image) => appeler('playlist:pochette', cle, image),
  afficherAlbum: (nom) => appeler('album:afficher', nom),
  maj: { etat: () => appeler('maj:etat'), installer: () => appeler('maj:installer') },
  spicetify: {
    aReparer: () => appeler('spicetify:a-reparer'),
    statut: () => appeler('spicetify:statut'),
    activer: () => appeler('spicetify:activer'),
    desactiver: () => appeler('spicetify:desactiver')
  },
  sur: (canal, rappel) => ipcRenderer.on(canal, (_e, d) => rappel(d))
})
