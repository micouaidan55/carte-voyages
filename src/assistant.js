// Assistant de l'application : contexte envoyé avec une question, et visite guidée du démarrage.
import { ajouterActivite, ajouterJour, ajouterRestaurant, retirerElement } from './plan.js'

export const KEY_VISITE = 'carte-voyages:visite'

// Ce que l'assistant sait de l'utilisateur : court, sans rien de personnel au-delà de l'app.
export function contexteAssistant({ aujourdhui, origine, visites = [], envies = [], voyage = null, nomPays = (c) => c }) {
  const c = { aujourdhui }
  if (origine) c.paysOrigine = nomPays(origine)
  if (visites.length) c.paysVisites = visites.slice(0, 80).map(nomPays)
  if (envies.length) c.envies = envies.slice(0, 40).map(nomPays)
  if (voyage) {
    const it = voyage.itineraire ?? {}
    c.voyageOuvert = {
      pays: nomPays(voyage.code),
      titre: it.titre,
      depart: voyage.reserver?.depart ?? null,
      nombreDeJours: voyage.demande?.jours ?? it.jours?.length ?? null,
      voyageurs: voyage.participants?.length ? voyage.participants : voyage.demande?.voyageurs || null,
      budgetPrevu: voyage.budgetPrevu ?? null,
      plan: (it.jours ?? []).slice(0, 30).map((j) => {
        const quoi = [...(j.activites ?? []).map((a) => a.titre), ...(j.restaurants ?? []).map((r) => r.nom)].filter(Boolean)
        return `Jour ${j.numero} · ${j.lieu} · ${j.titre}${quoi.length ? ` : ${quoi.join(', ')}` : ''}`.slice(0, 300)
      }),
    }
  }
  return c
}

// Questions proposées pour démarrer.
export function suggestions(voyage) {
  if (voyage)
    return [
      'Que reste-t-il à préparer pour ce voyage ?',
      'Quels papiers faut-il pour y aller ?',
      'Comment inviter mes amis à ce voyage ?',
      'Comment partager les frais ?',
    ]
  return ['Comment préparer un voyage ?', 'Comment ajouter les villes que j’ai visitées ?', 'Comment changer de téléphone sans rien perdre ?', 'À quoi sert le bouton 🧳 ?']
}

// Visite guidée : chaque étape montre un élément de l'écran (cible), ou s'affiche au centre.
export const ETAPES = [
  {
    titre: '👋 Bienvenue dans Mes pays',
    texte: 'Je suis votre assistant. Je vous montre l’application en quelques étapes : vos pays, vos voyages et tout ce qui va avec. Vous pouvez passer à tout moment.',
  },
  {
    titre: '🗺️ Votre carte',
    texte: 'Touchez un pays pour ouvrir sa fiche. Les pays visités sont en orange, vos envies en bleu. Écartez deux doigts pour zoomer.',
  },
  {
    cible: '#search-form',
    titre: '🔎 Chercher',
    texte: 'Tapez le nom d’un pays ou d’une ville (sans accents, en français ou en anglais) pour l’ajouter en un toucher.',
  },
  {
    titre: '📄 La fiche d’un pays',
    texte: '« J’y suis allé », « J’ai envie d’y aller », vos villes et souvenirs, le temps de vol, le décalage horaire, la monnaie et le taux de change. Et surtout « 🧳 Préparer un voyage ».',
  },
  {
    titre: '✨ Préparer un voyage',
    texte: 'Choisissez la durée, la période et vos envies : Claude prépare un plan jour par jour avec activités et restaurants. Ou « Juste réserver » pour faire le plan vous-même.',
  },
  {
    titre: '🧭 Les cinq onglets d’un voyage',
    texte: 'Plan (modifiable, météo, journée sur Google Maps), Préparer (papiers, valise, dates limites), Trajets (collez l’e-mail de votre vol), Réserver (liens déjà remplis) et Budget (dépenses et partage des frais).',
  },
  {
    titre: '👥 Voyager à plusieurs',
    texte: 'Dans un voyage, « Inviter » envoie à vos amis un lien avec tout le programme. Dans Budget, l’app calcule qui doit combien à qui.',
  },
  {
    cible: '#btn-trips',
    titre: '🧳 Vos voyages',
    texte: 'Ce bouton rouvre le voyage en cours (il s’ouvre directement sur le jour d’aujourd’hui), sinon la liste de vos voyages.',
  },
  {
    cible: '#btn-list',
    titre: '📋 Ma liste',
    texte: 'Vos pays visités, vos envies, vos voyages et votre progression par continent. « Partager » crée une belle image de votre carte.',
  },
  {
    cible: '#btn-settings',
    titre: '⚙️ Réglages',
    texte: 'Votre pays d’origine, le code d’accès pour Claude, une sauvegarde pour changer de téléphone, et cette visite à revoir quand vous voulez.',
  },
  {
    cible: '#btn-assistant',
    titre: '💬 Une question ?',
    texte: 'Touchez ce bouton à tout moment : je réponds à vos questions sur l’application et sur vos voyages, et je peux proposer des ajouts à votre plan, que vous validez d’un toucher. Bon voyage !',
  },
]

// Place la bulle sous l'élément s'il est en haut de l'écran, au-dessus sinon.
export function positionBulle(rect, hauteurEcran) {
  if (!rect) return 'centre'
  return rect.top + rect.height / 2 < hauteurEcran / 2 ? 'dessous' : 'dessus'
}

// Ajouts au plan proposés par l'assistant : l'utilisateur les valide d'un toucher.
const REPAS = ['déjeuner', 'dîner']
const MOMENTS_TEXTE = { matin: 'Matin', 'après-midi': 'Après-midi', soir: 'Soir', déjeuner: 'Déjeuner', dîner: 'Dîner' }

export const libelleProposition = (p) => `Jour ${p.jour} · ${MOMENTS_TEXTE[p.moment] ?? p.moment} : ${p.titre}`

// Renvoie le nouveau plan, ou null si le jour n'existe pas (et ne peut pas être créé).
export function appliquerProposition(it, p, joursPrevus = 0) {
  let n = it
  const j = p.jour - 1
  // Plan encore vide ou incomplet : on crée les jours manquants, sans dépasser la durée du voyage.
  if (j >= (n.jours?.length ?? 0)) {
    if (p.jour > Math.max(joursPrevus, n.jours?.length ?? 0)) return null
    const vide = n.vide
    while ((n.jours?.length ?? 0) <= j) n = ajouterJour(n)
    if (vide) n = { ...n, manuel: true }
  }
  return REPAS.includes(p.moment)
    ? ajouterRestaurant(n, j, { repas: p.moment, nom: p.titre, pourquoi: p.detail })
    : ajouterActivite(n, j, { moment: p.moment, titre: p.titre, detail: p.detail })
}

// Annule un ajout : retire l'élément ajouté à la main qui porte ce nom, ce jour-là.
export function retirerProposition(it, p) {
  const j = p.jour - 1
  const jour = it.jours?.[j]
  if (!jour) return it
  const type = REPAS.includes(p.moment) ? 'restaurants' : 'activites'
  const nom = (x) => (type === 'restaurants' ? x.nom : x.titre)
  const i = jour[type].findLastIndex((x) => x.perso && nom(x) === p.titre)
  return i < 0 ? it : retirerElement(it, j, type, i)
}
