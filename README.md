# Mes pays

Une carte du monde pour cocher, un par un, les pays déjà visités. Pensée pour l'iPhone, installable sur l'écran d'accueil, utilisable sans connexion.

- Toucher un pays ouvre sa fiche : « J'y suis allé », « J'ai envie d'y aller », temps de vol (ou de voiture pour les pays proches) et distance depuis votre pays, heure sur place et décalage horaire, capitale, langues, monnaie, population, superficie, indicatif et pays voisins.
- Votre pays d'origine se règle dans la roue crantée (deviné d'après la langue du téléphone au départ). Les trajets partent de sa capitale ; ce sont des estimations (vol direct à ~830 km/h, voiture à ~95 km/h de moyenne).
- La barre en bas permet de chercher un pays (sans accents, en français ou en anglais, « Angleterre », « Hollande »…). Le clavier reste ouvert pour enchaîner.
- « Ma liste » : pays visités, envies (en bleu sur la carte) et progression par continent sur les 195 pays. Partage de la liste.
- Sauvegarde et restauration dans un fichier, pour changer de téléphone sans rien perdre.
- Les pays sont gardés sur l'appareil (aucun compte, aucun serveur).

## Lancer

```bash
npm install
npm run dev      # http://localhost:5180 et sur le Wi-Fi local
npm test
npm run build    # version à mettre en ligne dans dist/
```

Sur iPhone : ouvrir l'adresse dans Safari, puis Partager → « Sur l'écran d'accueil ».
Les pays ajoutés dans Safari et ceux de l'application installée sont stockés séparément par iOS.

`npm run icons` régénère les icônes. `npm run data` régénère `src/data/pays.json` (données GeoNames et mledoze/countries).
