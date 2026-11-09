// Modifier le plan à la main : jours, activités, restaurants. Chaque fonction renvoie un nouvel itinéraire.

const ORDRE = { matin: 0, 'après-midi': 1, soir: 2 }
const propre = (s, max = 200) => String(s ?? '').trim().slice(0, max)

const copie = (it) => ({
  ...it,
  vide: false,
  jours: (it.jours ?? []).map((j) => ({ ...j, activites: [...(j.activites ?? [])], restaurants: [...(j.restaurants ?? [])] })),
})

function numeroter(it) {
  it.jours = it.jours.map((j, i) => ({ ...j, numero: i + 1 }))
  // Les étapes suivent les lieux des jours, dans l'ordre.
  const lieux = it.jours.map((j) => j.lieu).filter(Boolean)
  if (lieux.length) it.etapes = lieux.filter((l, i) => l !== lieux[i - 1])
  return it
}

export function ajouterJour(it, { lieu = '', titre = '' } = {}) {
  const n = copie(it)
  const precedent = n.jours.at(-1)
  n.jours.push({
    numero: n.jours.length + 1,
    lieu: propre(lieu, 60) || precedent?.lieu || it.etapes?.[0] || '',
    titre: propre(titre, 80) || 'Journée libre',
    deplacement: '',
    activites: [],
    restaurants: [],
  })
  return numeroter(n)
}

export function modifierJour(it, j, { lieu, titre, deplacement }) {
  const n = copie(it)
  const jour = n.jours[j]
  if (!jour) return it
  if (lieu != null) jour.lieu = propre(lieu, 60) || jour.lieu
  if (titre != null) jour.titre = propre(titre, 80) || jour.titre
  if (deplacement != null) jour.deplacement = propre(deplacement, 120)
  return numeroter(n)
}

export function retirerJour(it, j) {
  const n = copie(it)
  n.jours.splice(j, 1)
  return numeroter(n)
}

export function ajouterActivite(it, j, { moment = 'matin', titre, detail = '', duree = '' }) {
  if (!propre(titre)) return it
  const n = copie(it)
  const jour = n.jours[j]
  if (!jour) return it
  const a = { moment: moment in ORDRE ? moment : 'matin', titre: propre(titre, 80), duree: propre(duree, 20), detail: propre(detail, 300), perso: true }
  // Rangée après les activités du même moment.
  const apres = jour.activites.findIndex((x) => (ORDRE[x.moment] ?? 1) > ORDRE[a.moment])
  jour.activites.splice(apres < 0 ? jour.activites.length : apres, 0, a)
  return n
}

export function ajouterRestaurant(it, j, { repas = 'dîner', nom, quartier = '', pourquoi = '' }) {
  if (!propre(nom)) return it
  const n = copie(it)
  const jour = n.jours[j]
  if (!jour) return it
  jour.restaurants.push({ repas: repas === 'déjeuner' ? 'déjeuner' : 'dîner', nom: propre(nom, 80), cuisine: '', prix: '', quartier: propre(quartier, 60), pourquoi: propre(pourquoi, 300), perso: true })
  return n
}

export function retirerElement(it, j, type, i) {
  if (type !== 'activites' && type !== 'restaurants') return it
  const n = copie(it)
  n.jours[j]?.[type].splice(i, 1)
  return n
}

// Fusion de deux versions d'un plan (invitation) : on additionne jour par jour.
export function fusionnerPlans(local, recu) {
  if (!local || local.vide) return recu
  if (!recu || recu.vide) return local
  const cleA = (a) => `${a.moment}|${a.titre}`
  const cleR = (r) => `${r.repas}|${r.nom || r.cuisine}`
  const unir = (a = [], b = [], cle) => {
    const vus = new Set(a.map(cle))
    return [...a, ...b.filter((x) => !vus.has(cle(x)) && vus.add(cle(x)))]
  }
  const n = Math.max(local.jours.length, recu.jours.length)
  const jours = Array.from({ length: n }, (_, i) => {
    const r = recu.jours[i]
    const l = local.jours[i]
    if (!r || !l) return r ?? l
    return { ...r, activites: unir(r.activites, l.activites, cleA), restaurants: unir(r.restaurants, l.restaurants, cleR) }
  })
  return numeroter({ ...recu, jours })
}
