# Atelier

Outil d'écriture personnel : fiction (scènes, bible d'univers) et chansons (sections, tonalité, tempo, banque d'idées), mode focus, hors ligne.

## Lancer

```sh
npm start          # http://localhost:8080
npm test           # tests unitaires (format Markdown)
npm run test:e2e   # tests dans Chromium (npm install d'abord)
```

## Publication

Chaque envoi sur `main` lance les tests puis publie l'app sur GitHub Pages
(`.github/workflows/publier.yml`) : https://rasolofomichael.github.io/Atelier/

Sur iPhone : ouvrir cette adresse dans Safari, bouton Partager, « Sur l'écran d'accueil ».
L'app fonctionne ensuite hors ligne. Quand une nouvelle version est publiée,
l'app propose « Mettre à jour » ; rien ne change pendant l'écriture sans accord.

## Organisation

- `index.html`, `styles.css`, `src/app.js` : l'application (sans framework, sans compilation).
- `src/store.js` : stockage local (IndexedDB, repli localStorage), copies de secours.
- `src/format.js` : conversion projet <-> fichiers Markdown (voir `FORMAT.md`).
- `src/kinds.js` : vocabulaire et réglages par type de projet (fiction, chansons).
- `src/zip.js` : création d'archives .zip (export Markdown, menu « Exporter en Markdown »).
- `sw.js`, `manifest.webmanifest`, `icons/`, `fonts/` : app installable et hors ligne. Tout nouveau fichier de l'app doit être ajouté à `ASSETS` dans `sw.js` (un test le vérifie).
- `prototype/atelier.html` : prototype d'origine, gardé pour référence.

## Données

- Tout est enregistré dans le navigateur (IndexedDB) 400 ms après la dernière frappe, et aussitôt que l'app passe en arrière-plan.
- Une copie de secours est faite toutes les 10 minutes d'écriture (30 gardées), consultable dans « Sauvegardes ».
- Au premier lancement, les données du prototype sont reprises automatiquement. Elles ne sont pas effacées de l'ancien emplacement.
- Si une écriture échoue, une copie d'urgence est mise dans localStorage et récupérée au lancement suivant.
