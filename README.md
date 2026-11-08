# Mes pays

Une carte du monde pour cocher, un par un, les pays déjà visités. Pensée pour l'iPhone, installable sur l'écran d'accueil, utilisable sans connexion.

- Toucher un pays l'ajoute ; le toucher à nouveau le retire. Chaque action peut être annulée.
- La barre en bas permet de chercher un pays (sans accents, en français ou en anglais, « Angleterre », « Hollande »…). Le clavier reste ouvert pour enchaîner.
- « Ma liste » affiche les pays visités, permet d'en retirer et de partager la liste.
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

`npm run icons` régénère les icônes.
