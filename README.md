# Atelier

Outil d'écriture personnel : scènes, bible d'univers, mode focus.

## Lancer

```sh
npm start          # http://localhost:8080
npm test           # tests unitaires (format Markdown)
npm run test:e2e   # tests dans Chromium (npm install d'abord)
```

## Organisation

- `index.html`, `styles.css`, `src/app.js` : l'application (sans framework, sans compilation).
- `src/store.js` : stockage local (IndexedDB, repli localStorage), copies de secours.
- `src/format.js` : conversion projet <-> fichiers Markdown (voir `FORMAT.md`).
- `prototype/atelier.html` : prototype d'origine, gardé pour référence.

## Données

- Tout est enregistré dans le navigateur (IndexedDB) 400 ms après la dernière frappe, et aussitôt que l'app passe en arrière-plan.
- Une copie de secours est faite toutes les 10 minutes d'écriture (30 gardées), consultable dans « Sauvegardes ».
- Au premier lancement, les données du prototype sont reprises automatiquement. Elles ne sont pas effacées de l'ancien emplacement.
- Si une écriture échoue, une copie d'urgence est mise dans localStorage et récupérée au lancement suivant.
