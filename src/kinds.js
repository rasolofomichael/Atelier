// Vocabulaire et réglages propres à chaque type de projet.

export const KINDS = {
  fiction: {
    projectLabel: 'Nouveau projet de fiction',
    newProjectName: 'Nouveau projet',
    items: 'Scènes', add: '+ Scène', newItem: 'Nouvelle scène', firstItem: 'Première scène',
    titlePh: 'Titre de la scène', textPh: 'Écris ici…', template: '',
    del: 'Supprimer la scène', keepOne: 'Garde au moins une scène',
    statuses: { idee: 'Idée', brouillon: 'Brouillon', revise: 'Révisé' },
    totals: (n, w, done) => [`${fmtWords(w)} au total`, `${n} scènes · ${done} révisées`,
      `≈ ${Math.max(1, Math.round(w / 250))} page${w > 375 ? 's' : ''} de roman`],
    bank: "Bible de l'univers", bankTab: 'Bible', addEntry: '+ Fiche',
    types: [['Personnage', 'Personnages'], ['Lieu', 'Lieux'], ['Lore', 'Lore']],
    namePh: 'Nom', aliasPh: 'Alias, surnoms', notesPh: 'Notes, apparence, histoire, règles…',
    emptyBank: 'Aucune fiche dans cette catégorie.',
    mentions: 'Présents dans cette scène',
    noMentions: "Aucune fiche de la bible n'apparaît encore dans cette scène.",
    bankHint: "Les noms de fiches repérés dans la scène s'allument en bleu. Les alias se séparent par des virgules.",
  },
  chansons: {
    projectLabel: 'Nouveau recueil de chansons',
    newProjectName: 'Nouvelles chansons',
    items: 'Chansons', add: '+ Chanson', newItem: 'Nouvelle chanson', firstItem: 'Première chanson',
    titlePh: 'Titre de la chanson', textPh: '## Couplet 1\nTes paroles…', template: '## Couplet 1\n\n\n## Refrain\n\n',
    del: 'Supprimer la chanson', keepOne: 'Garde au moins une chanson',
    statuses: { idee: 'Idée', brouillon: 'Brouillon', revise: 'Finie' },
    totals: (n, w, done) => [`${n} chanson${n > 1 ? 's' : ''} · ${done} finie${done > 1 ? 's' : ''}`, `${fmtWords(w)} au total`],
    bank: "Banque d'idées", bankTab: 'Idées', addEntry: '+ Idée',
    types: [['Titre', 'Titres'], ['Phrase', 'Phrases'], ['Image', 'Images'], ['Thème', 'Thèmes']],
    namePh: 'Idée', aliasPh: 'Variantes, séparées par des virgules', notesPh: 'Contexte, pour quelle chanson…',
    emptyBank: 'Aucune idée dans cette catégorie.',
    mentions: 'Idées reprises dans cette chanson',
    noMentions: "Aucune idée de la banque n'apparaît encore dans cette chanson.",
    bankHint: 'Les idées reprises dans la chanson s\'allument en bleu. Garde ici titres, phrases et images à piocher d\'une chanson à l\'autre.',
    songs: true,
  },
};

export const kindOf = project => KINDS[project?.kind] ?? KINDS.fiction;

export function fmtWords(n) {
  return n.toLocaleString('fr-FR') + (n > 1 ? ' mots' : ' mot');
}

// Tonalités : valeur stockée en notation anglaise (utile pour les accords), affichage en français.
const NOTES_FR = { C: 'Do', 'C#': 'Do♯', Db: 'Ré♭', D: 'Ré', Eb: 'Mi♭', E: 'Mi', F: 'Fa', 'F#': 'Fa♯', G: 'Sol', 'G#': 'Sol♯', Ab: 'La♭', A: 'La', Bb: 'Si♭', B: 'Si' };
const MAJOR = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const MINOR = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
export const KEYS = [
  ...MAJOR.map(n => [n, `${NOTES_FR[n]} majeur (${n})`]),
  ...MINOR.map(n => [`${n}m`, `${NOTES_FR[n]} mineur (${n}m)`]),
];
export const METERS = ['4/4', '3/4', '6/8', '2/4', '12/8', '5/4'];
export const SECTIONS = ['Couplet', 'Refrain', 'Pont', 'Pré-refrain', 'Intro', 'Outro'];
