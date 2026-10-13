// Vocabulaire et réglages propres à chaque type de projet.

export const KINDS = {
  roman: {
    projectLabel: 'Nouveau roman',
    newProjectName: 'Nouveau roman',
    kindLabel: 'Roman', icon: 'livre',
    items: 'Chapitres', item: 'Chapitre', bigLabel: 'CHAPITRES', newItem: 'Nouveau chapitre', firstItem: 'Premier chapitre',
    addLabel: 'Nouveau chapitre',
    titlePh: 'Titre du chapitre', textPh: 'Il était une fois…', template: '',
    del: 'Supprimer le chapitre', keepOne: 'Garde au moins un chapitre',
    statuses: { idee: 'Idée', brouillon: 'Brouillon', revise: 'Révisé' },
    done: n => `${n} révisé${n > 1 ? 's' : ''}`,
    bank: 'Univers du roman', bankTab: 'Univers', addEntry: 'Fiche',
    types: [['Personnage', 'Personnages'], ['Lieu', 'Lieux'], ['Lore', 'Lore']],
    namePh: 'Nom', aliasPh: 'Alias, surnoms', notesPh: 'Notes, apparence, histoire, règles…',
    emptyBank: 'Aucune fiche dans cette catégorie.',
    mentions: 'Présents dans ce chapitre',
    noMentions: "Aucune fiche de l'univers n'apparaît encore dans ce chapitre.",
    bankHint: "Les fiches citées dans le chapitre en cours sont marquées. Les alias se séparent par des virgules.",
    novel: true,
  },
  chansons: {
    projectLabel: 'Nouveau recueil de chansons',
    newProjectName: 'Nouvelles chansons',
    kindLabel: 'Chansons', icon: 'note',
    items: 'Chansons', item: 'Chanson', bigLabel: 'TITRES', newItem: 'Nouvelle chanson', firstItem: 'Première chanson',
    addLabel: 'Nouvelle chanson',
    titlePh: 'Titre de la chanson', textPh: '## Couplet 1\nTes paroles…', template: '## Couplet 1\n\n\n## Refrain\n\n',
    del: 'Supprimer la chanson', keepOne: 'Garde au moins une chanson',
    statuses: { idee: 'Idée', brouillon: 'Brouillon', revise: 'Finie' },
    done: n => `${n} finie${n > 1 ? 's' : ''}`,
    bank: "Banque d'idées", bankTab: 'Idées', addEntry: 'Idée',
    types: [['Titre', 'Titres'], ['Phrase', 'Phrases'], ['Image', 'Images'], ['Thème', 'Thèmes']],
    namePh: 'Idée', aliasPh: 'Variantes, séparées par des virgules', notesPh: 'Contexte, pour quelle chanson…',
    emptyBank: 'Aucune idée dans cette catégorie.',
    mentions: 'Idées reprises dans cette chanson',
    noMentions: "Aucune idée de la banque n'apparaît encore dans cette chanson.",
    bankHint: "Garde ici titres, phrases et images à piocher d'une chanson à l'autre. Celles reprises dans la chanson en cours sont marquées.",
    songs: true,
  },
};

export const kindOf = project => KINDS[project?.kind] ?? KINDS.roman;
export const kindName = project => (project?.kind === 'chansons' ? 'chansons' : 'roman');

// Chiffres romains pour la table des matières.
export function roman(n) {
  const t = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  for (const [v, r] of t) while (n >= v) { out += r; n -= v; }
  return out;
}

export function fmtWords(n) {
  return n.toLocaleString('fr-FR') + (n > 1 ? ' mots' : ' mot');
}

// Couleurs des cartes, dans l'ordre d'attribution automatique.
export const PALETTE = ['moutarde', 'lavande', 'rose', 'eau', 'olive', 'peche'];
export const PALETTE_LABELS = { moutarde: 'Moutarde', lavande: 'Lavande', rose: 'Vieux rose', eau: "Vert d'eau", olive: 'Olive', peche: 'Pêche' };

// Couleur suivante après `prev`, en évitant `avoid` (la carte d'après).
export function nextColor(prev, avoid) {
  let i = (PALETTE.indexOf(prev) + 1) % PALETTE.length;
  if (PALETTE[i] === avoid) i = (i + 1) % PALETTE.length;
  return PALETTE[i];
}

// Tonalités : valeur stockée en notation anglaise (utile pour les accords), affichage en français.
export const NOTES = [['C', 'Do'], ['D', 'Ré'], ['E', 'Mi'], ['F', 'Fa'], ['G', 'Sol'], ['A', 'La'], ['B', 'Si']];
const FR = Object.fromEntries(NOTES);

export function parseKey(key) {
  const m = String(key ?? '').match(/^([A-G])([#b]?)(m?)$/);
  return m ? { note: m[1], acc: m[2], minor: !!m[3] } : null;
}
export const makeKey = ({ note, acc = '', minor = false }) => `${note}${acc}${minor ? 'm' : ''}`;

export function keyLabel(key) {
  const k = parseKey(key);
  if (!k) return '';
  return `${FR[k.note]}${k.acc === '#' ? '♯' : k.acc === 'b' ? '♭' : ''} ${k.minor ? 'mineur' : 'majeur'}`;
}
export const keyShort = key => String(key ?? '').replace('#', '♯').replace(/(?<=[A-G])b/, '♭');

export const METERS = ['4/4', '3/4', '6/8', '2/4', '12/8', '5/4'];
export const SECTIONS = ['Couplet', 'Refrain', 'Pré-refrain', 'Pont', 'Intro', 'Outro'];
export const STYLES = [['pop', 'Pop', 'On compte comme on parle, les rimes approchées comptent.'],
  ['chanson', 'Chanson française', 'Le e muet compte devant une consonne, seules les rimes exactes comptent.']];
