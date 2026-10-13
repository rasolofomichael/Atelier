# Format des fichiers d'un projet Atelier

Chaque projet est un dossier de fichiers Markdown, lisibles et modifiables hors de l'application.
Un projet appartient à un univers (`type` dans `projet.md`) : `roman` ou `chansons`.

```
mon-roman/
  projet.md                      type, titre, objectifs, ordre des chapitres, description
  chapitres/
    ouverture-la-tempete.md      un chapitre par fichier
    le-port.md
  univers/
    personnages/lena-ardent.md   une fiche par fichier
    lieux/vhal.md
    lore/la-grande-maree.md
```

Les anciens exports « fiction » (sans `type`, avec `scenes/` et `bible/`) sont lus comme des romans.

## Fichiers

Chaque fichier commence par un en-tête YAML (entre deux lignes `---`). Le texte suit, sans transformation.

**`projet.md`** (objectifs en mots, facultatifs)
```markdown
---
id: k3x9a2b1
titre: Les Marées de Vhal
type: roman
objectif: "80000"
objectif_jour: "1000"
chapitres:
  - ouverture-la-tempete
  - le-port
---

Description libre du projet.
```

**Chapitre** (`chapitres/*.md`) : `statut` vaut `idee`, `brouillon` ou `revise`.
```markdown
---
id: s8f2c1d0
titre: "Ouverture : la tempête"
statut: brouillon
---

Il pleuvait depuis trois jours sur Vhal…
```

**Fiche** (`univers/personnages|lieux|lore/*.md`) : le dossier détermine le type.
```markdown
---
id: f1a2b3c4
nom: Léna Ardent
alias:
  - Léna
  - la Capitaine
---

Notes libres.
```

## Règles

- **L'ordre des chapitres** vient de la liste `chapitres` de `projet.md`. Un chapitre ajouté à la main sans y être listée apparaît à la fin. Un nom listé dont le fichier manque est ignoré.
- **Les noms de fichiers sont stables** : ils sont tirés du titre à la création, puis ne changent plus, même si le titre change. L'historique git reste ainsi lisible. On peut renommer un fichier à la main, à condition de mettre à jour `projet.md`.
- **L'`id`** identifie la scène ou la fiche de façon durable. Il servira aux liens entre fiches et à la synchronisation. S'il manque, l'application en crée un.
- **Le compte de mots** n'est pas stocké : il est recalculé à partir du texte.
- Ce qui n'est pas reconnu est ignoré sans erreur (autres fichiers, dossier `bible/` inconnu, statut invalide remplacé par `idee`).

## Projets de chansons

Un projet de chansons (un recueil ou un album) suit la même logique, avec ses propres dossiers :

```
premier-album/
  projet.md                  type: chansons, ordre des chansons
  chansons/
    ville-sous-la-pluie.md   une chanson par fichier
  idees/
    titres/  phrases/  images/  themes/   la banque d'idées, une idée par fichier
```

**`projet.md`** porte `type: chansons` ; la liste d'ordre s'appelle `chansons` au lieu de `scenes`.

**Chanson** (`chansons/*.md`) : style (`pop` ou `chanson`, qui règle le compte des syllabes et des rimes), tonalité en notation anglaise (`Am`, `F#`, `Bb`…), tempo en BPM, mesure, notes sur plusieurs lignes. Les champs vides sont omis. Les sections sont des titres Markdown `##`.
```markdown
---
id: c8f2c1d0
titre: Ville sous la pluie
statut: brouillon
style: chanson
tonalite: Am
tempo: "92"
mesure: "4/4"
notes: |-
  Réf : Bashung.
  Guitare sèche.
---

## Couplet 1
Il pleut sur la ville

## Refrain
Et je reste là
```

Pour une chanson, le statut `revise` s'affiche « Finie ».
