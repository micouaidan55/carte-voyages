# Mes pays

Une carte du monde pour cocher, un par un, les pays déjà visités. Pensée pour l'iPhone, installable sur l'écran d'accueil, utilisable sans connexion.

- Toucher un pays ouvre sa fiche : « J'y suis allé », « J'ai envie d'y aller », temps de vol (ou de voiture pour les pays proches) et distance depuis votre pays, heure sur place et décalage horaire, capitale, langues, monnaie, population, superficie, indicatif et pays voisins.
- Votre pays d'origine se règle dans la roue crantée (deviné d'après la langue du téléphone au départ). Les trajets partent de sa capitale ; ce sont des estimations (vol direct à ~830 km/h, voiture à ~95 km/h de moyenne).
- La barre en bas permet de chercher un pays (sans accents, en français ou en anglais, « Angleterre », « Hollande »…). Le clavier reste ouvert pour enchaîner.
- Souvenirs pour chaque pays visité : année du voyage, coup de cœur, quelques mots. La liste des pays visités se classe alors par année.
- Taux de change dans la fiche (« 1 € ≈ 177 ¥ »), depuis la monnaie de votre pays, gardés en mémoire pour le hors-ligne (source : ExchangeRate-API).
- « Ma liste » : pays visités, envies (en bleu sur la carte), voyages préparés et progression par continent sur les 195 pays. « Partager » envoie une image de votre carte (1080 × 1350) avec la liste.
- « Préparer un voyage » depuis la fiche d'un pays : nombre de jours, période, envies, budget, rythme → itinéraire jour par jour avec activités et restaurants (liens Google Maps), préparé par Claude. Les voyages sont gardés dans « Ma liste ».
- Sauvegarde et restauration dans un fichier (pays, envies, souvenirs, voyages), pour changer de téléphone sans rien perdre.
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

## Serveur d'itinéraires (dossier `server/`)

La clé de l'API Claude ne doit jamais se trouver dans l'application (elle serait lisible par tous). Un petit serveur Node la garde et prépare les itinéraires.

- Hébergement : Render, gratuit, décrit dans `render.yaml`. Au premier déploiement, Render demande `ANTHROPIC_API_KEY` et `CODE_ACCES` (un mot de passe au choix, à saisir ensuite dans l'application, roue crantée → Préparation de voyage).
- Protection : sans le bon code, le serveur refuse ; au-delà de `LIMITE_JOUR` itinéraires par jour (20 par défaut), il refuse aussi.
- Coût : environ 10 à 25 centimes par itinéraire (Claude Opus 5.5).
- Le serveur gratuit s'endort après 15 minutes : l'application le réveille dès qu'on ouvre « Préparer un voyage ».
- Essai sans Claude : `SIMULATION=1 CODE_ACCES=test npm start` dans `server/`.
