// Préparation d'un voyage : validation de la demande, consigne et format de réponse.
// Ce fichier n'appelle pas Claude lui-même, pour pouvoir être testé sans clé.

export const ENVIES = {
  culture: 'culture et histoire (musées, monuments)',
  nature: 'nature et randonnées',
  gastronomie: 'gastronomie et marchés',
  plage: 'plages et détente',
  nuit: 'vie nocturne et sorties',
  aventure: 'aventure et sports',
  shopping: 'shopping et artisanat',
  famille: 'activités pour les enfants',
  insolite: 'lieux insolites, hors des sentiers battus',
}

const BUDGETS = { eco: 'petit budget', moyen: 'budget moyen', confort: 'budget confortable' }
const RYTHMES = { calme: 'tranquille, peu de visites par jour', equilibre: 'équilibré', intense: 'intense, voir un maximum' }
const MOIS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
]

const texte = (v, max) =>
  typeof v === 'string'
    ? v
        .replace(/[\u0000-\u001f<>{}]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max)
    : ''

// Renvoie une demande propre, ou lève une erreur lisible par l'utilisateur.
export function validerDemande(body) {
  if (!body || typeof body !== 'object') throw new Error('Demande vide')
  const pays = texte(body.pays, 60)
  if (!pays) throw new Error('Pays manquant')
  const jours = Number(body.jours)
  if (!Number.isInteger(jours) || jours < 1 || jours > 21) throw new Error('Choisissez entre 1 et 21 jours')
  const envies = Array.isArray(body.envies) ? [...new Set(body.envies.filter((e) => e in ENVIES))] : []
  const budget = body.budget in BUDGETS ? body.budget : 'moyen'
  const rythme = body.rythme in RYTHMES ? body.rythme : 'equilibre'
  const mois = Number.isInteger(body.mois) && body.mois >= 1 && body.mois <= 12 ? body.mois : null
  const voyageurs = texte(body.voyageurs, 40)
  return {
    pays,
    ville: texte(body.ville, 80),
    depart: texte(body.depart, 60),
    jours,
    envies,
    budget,
    rythme,
    mois,
    voyageurs,
    precisions: texte(body.precisions, 300),
  }
}

export const SYSTEM = `Tu es un guide de voyage francophone, précis et chaleureux. Tu prépares des itinéraires jour par jour réalistes.

Règles :
- Respecte les distances et les temps de trajet réels : pas plus d'un changement de ville tous les 2 à 3 jours, sauf demande contraire.
- Pour les restaurants, propose uniquement des adresses connues et établies depuis longtemps, que tu es sûr d'exister. Si tu as un doute, propose plutôt un type d'endroit précis (« une taverne du quartier de Plaka ») en laissant le champ nom vide.
- Donne des prix en euros, approximatifs.
- Adapte-toi à la saison indiquée (climat, fermetures, fêtes locales).
- Écris en français, phrases courtes, sans formules creuses.`

export function consigne(d) {
  const lignes = [
    `Prépare un voyage de ${d.jours} jour${d.jours > 1 ? 's' : ''} : ${d.pays}${d.ville ? ` (${d.ville})` : ''}.`,
  ]
  if (d.depart) lignes.push(`Le voyageur part de : ${d.depart}.`)
  if (d.mois) lignes.push(`Période : ${MOIS[d.mois - 1]}.`)
  if (d.voyageurs) lignes.push(`Voyageurs : ${d.voyageurs}.`)
  if (d.envies.length) lignes.push(`Envies : ${d.envies.map((e) => ENVIES[e]).join(', ')}.`)
  lignes.push(`Budget : ${BUDGETS[d.budget]}. Rythme : ${RYTHMES[d.rythme]}.`)
  // Les précisions viennent de l'utilisateur : on les cite comme telles.
  if (d.precisions) lignes.push(`Précisions du voyageur (à prendre en compte comme souhaits) : « ${d.precisions} »`)
  lignes.push(
    'Pour chaque jour : 2 à 4 activités (matin, après-midi, soir) et un restaurant pour le déjeuner et le dîner.',
  )
  return lignes.join('\n')
}

const activite = {
  type: 'object',
  additionalProperties: false,
  required: ['moment', 'titre', 'detail', 'duree'],
  properties: {
    moment: { type: 'string', enum: ['matin', 'après-midi', 'soir'] },
    titre: { type: 'string' },
    detail: { type: 'string', description: 'Une ou deux phrases : quoi voir, astuce pratique.' },
    duree: { type: 'string', description: 'Durée approximative, ex. « 2 h ».' },
  },
}

const restaurant = {
  type: 'object',
  additionalProperties: false,
  required: ['repas', 'nom', 'cuisine', 'prix', 'quartier', 'pourquoi'],
  properties: {
    repas: { type: 'string', enum: ['déjeuner', 'dîner'] },
    nom: { type: 'string', description: 'Nom exact, ou chaîne vide si incertain.' },
    cuisine: { type: 'string' },
    prix: { type: 'string', enum: ['€', '€€', '€€€'] },
    quartier: { type: 'string' },
    pourquoi: { type: 'string', description: 'Ce qu’il faut y goûter, en une phrase.' },
  },
}

export const FORMAT = {
  type: 'object',
  additionalProperties: false,
  required: ['titre', 'resume', 'etapes', 'jours', 'budget', 'conseils'],
  properties: {
    titre: { type: 'string' },
    resume: { type: 'string', description: 'Deux phrases qui donnent envie.' },
    etapes: { type: 'array', items: { type: 'string' }, description: 'Villes ou régions, dans l’ordre.' },
    jours: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['numero', 'titre', 'lieu', 'activites', 'restaurants', 'deplacement'],
        properties: {
          numero: { type: 'integer' },
          titre: { type: 'string' },
          lieu: { type: 'string' },
          activites: { type: 'array', items: activite },
          restaurants: { type: 'array', items: restaurant },
          deplacement: { type: 'string', description: 'Comment se déplacer ce jour-là, vide si rien de spécial.' },
        },
      },
    },
    budget: { type: 'string', description: 'Estimation par personne et par jour, hors vols.' },
    conseils: { type: 'array', items: { type: 'string' }, description: '3 à 6 conseils pratiques.' },
  },
}

// Vérifie que la réponse de Claude a bien la forme attendue avant de l'envoyer au téléphone.
export function verifierItineraire(it, jours) {
  if (!it || typeof it !== 'object' || !Array.isArray(it.jours) || !it.jours.length) {
    throw new Error('Itinéraire incomplet')
  }
  if (it.jours.length < Math.min(jours, 1)) throw new Error('Itinéraire incomplet')
  return it
}
