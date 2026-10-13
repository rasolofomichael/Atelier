// Vocabulaire et réglages propres à chaque type de projet.

export const KINDS = {
  fiction: {
    projectLabel: 'Nouveau projet de fiction',
    newProjectName: 'Nouveau projet',
    kindLabel: 'Fiction',
    items: 'Scènes', item: 'Scène', bigLabel: 'SCÈNES', newItem: 'Nouvelle scène', firstItem: 'Première scène',
    addLabel: 'Nouvelle scène',
    titlePh: 'Titre de la scène', textPh: 'Écris ici…', template: '',
    del: 'Supprimer la scène', keepOne: 'Garde au moins une scène',
    statuses: { idee: 'Idée', brouillon: 'Brouillon', revise: 'Révisée' },
    done: n => `${n} révisée${n > 1 ? 's' : ''}`,
    bank: "Bible de l'univers", bankTab: 'Bible', addEntry: 'Fiche',
    types: [['Personnage', 'Personnages'], ['Lieu', 'Lieux'], ['Lore', 'Lore']],
    namePh: 'Nom', aliasPh: 'Alias, surnoms', notesPh: 'Notes, apparence, histoire, règles…',
    emptyBank: 'Aucune fiche dans cette catégorie.',
    mentions: 'Présents dans cette scène',
    noMentions: "Aucune fiche de la bible n'apparaît encore dans cette scène.",
    bankHint: "Les fiches citées dans la scène en cours sont marquées. Les alias se séparent par des virgules.",
  },
  chansons: {
    projectLabel: 'Nouveau recueil de chansons',
    newProjectName: 'Nouvelles chansons',
    kindLabel: 'Chansons',
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

export const kindOf = project => KINDS[project?.kind] ?? KINDS.fiction;

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
