// Dépenses d'un voyage : saisies dans la monnaie locale ou la sienne, converties avec le taux du jour.
import { plusJours } from './reserver.js'
import { joursEntre } from './rappels.js'

export const CATEGORIES = [
  { id: 'repas', icone: '🍽️', nom: 'Repas' },
  { id: 'logement', icone: '🏨', nom: 'Logement' },
  { id: 'transport', icone: '🚕', nom: 'Transport' },
  { id: 'activites', icone: '🎟️', nom: 'Activités' },
  { id: 'achats', icone: '🛍️', nom: 'Achats' },
  { id: 'autre', icone: '➕', nom: 'Autre' },
]

// « 12,50 », « 12.5 », « 1 200 » → nombre ; null si illisible ou négatif.
export function lireMontant(texte) {
  const s = String(texte ?? '')
    .replace(/[\s  ]/g, '')
    .replace(',', '.')
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null
  const n = Number(s)
  return n > 0 && n < 10_000_000 ? n : null
}

// rates : taux depuis la monnaie de la maison (1 maison = rates[X] X).
export function convertir(montant, devise, maison, rates) {
  if (devise === maison) return montant
  const r = rates?.[devise]
  return r ? montant / r : null
}

export function nouvelleDepense({ montant, devise, cat, note = '', date, par, pour, remb }, maison, rates, id = Date.now().toString(36)) {
  const valeur = convertir(montant, devise, maison, rates)
  const partage = par && pour?.length ? { par, pour: [...pour] } : {}
  if (remb) partage.remb = true
  return {
    id,
    montant,
    devise,
    cat: CATEGORIES.some((c) => c.id === cat) ? cat : 'autre',
    note: note.trim().slice(0, 60),
    date,
    maison,
    valeur: valeur == null ? null : Math.round(valeur * 100) / 100,
    ...partage,
  }
}

// Valeur dans la monnaie de la maison : celle du jour de la saisie, sinon le taux actuel.
export function valeurDe(d, maison, rates) {
  if (d.valeur != null && d.maison === maison) return d.valeur
  return convertir(d.montant, d.devise, maison, rates)
}

export function bilan(depenses, { maison, rates, budget = null, depart = null, jours = null, today }) {
  let total = 0
  let sansTaux = 0
  const parCat = Object.fromEntries(CATEGORIES.map((c) => [c.id, 0]))
  const parJour = new Map()
  for (const d of depenses) {
    if (d.remb) continue // un remboursement entre voyageurs n'est pas une dépense
    const v = valeurDe(d, maison, rates)
    if (v == null) {
      sansTaux++
      continue
    }
    total += v
    parCat[d.cat] = (parCat[d.cat] ?? 0) + v
    const j = parJour.get(d.date) ?? { date: d.date, total: 0, items: [] }
    j.total += v
    j.items.push(d)
    parJour.set(d.date, j)
  }
  const jours_ = [...parJour.values()].sort((a, b) => b.date.localeCompare(a.date))
  const nbJours = jours_.length
  // Jours écoulés depuis le départ (au moins 1) pour une moyenne honnête.
  let ecoules = nbJours || 1
  if (depart && today >= depart) {
    ecoules = Math.max(1, joursEntre(depart, today) + 1)
    if (jours) ecoules = Math.min(ecoules, jours)
  }
  const moyenne = total / ecoules
  const projection = jours && depart && today >= depart && today < plusJours(depart, jours) ? moyenne * jours : null
  return {
    total,
    sansTaux,
    parCat: CATEGORIES.map((c) => ({ ...c, total: parCat[c.id], pct: total ? Math.round((parCat[c.id] / total) * 100) : 0 })).filter(
      (c) => c.total > 0,
    ),
    parJour: jours_,
    moyenne,
    reste: budget ? budget - total : null,
    projection,
  }
}

// Partage entre voyageurs : chaque dépense est divisée à parts égales entre les personnes concernées.
// Renvoie le solde de chacun et les virements les moins nombreux pour tout régler.
export function equilibre(depenses, participants, { maison, rates }) {
  const soldes = participants.map((nom) => ({ nom, paye: 0, part: 0, verse: 0, recu: 0 }))
  const de = Object.fromEntries(soldes.map((s) => [s.nom, s]))
  let ignorees = 0
  for (const d of depenses) {
    const v = valeurDe(d, maison, rates)
    const pour = (d.pour ?? []).filter((n) => de[n])
    if (v == null || !de[d.par] || !pour.length) {
      ignorees++
      continue
    }
    if (d.remb) {
      // Remboursement : réduit la dette sans changer ce que chacun a dépensé.
      de[d.par].verse += v
      for (const n of pour) de[n].recu += v / pour.length
      continue
    }
    de[d.par].paye += v
    for (const n of pour) de[n].part += v / pour.length
  }
  const cents = (x) => Math.round(x * 100)
  for (const s of soldes) {
    s.solde = (cents(s.paye) - cents(s.part) + cents(s.verse) - cents(s.recu)) / 100
    delete s.verse
    delete s.recu
    s.paye = cents(s.paye) / 100
    s.part = cents(s.part) / 100
  }
  // Le plus gros débiteur rembourse le plus gros créancier, et ainsi de suite (au centime près).
  const doit = soldes.filter((s) => s.solde < 0).map((s) => ({ nom: s.nom, c: -cents(s.solde) }))
  const recoit = soldes.filter((s) => s.solde > 0).map((s) => ({ nom: s.nom, c: cents(s.solde) }))
  const virements = []
  const tri = (l) => l.sort((a, b) => b.c - a.c)
  while (tri(doit).length && tri(recoit).length) {
    const d = doit[0]
    const r = recoit[0]
    const m = Math.abs(d.c - r.c) <= 1 ? d.c : Math.min(d.c, r.c)
    virements.push({ de: d.nom, a: r.nom, montant: m / 100 })
    d.c -= m
    r.c -= m
    if (d.c <= 1) doit.shift()
    if (r.c <= 1) recoit.shift()
  }
  return { soldes, virements, ignorees }
}

export function formatArgent(montant, devise) {
  const entier = Math.abs(montant) >= 100 || Number.isInteger(montant)
  try {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: devise,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: entier ? 0 : 2,
      maximumFractionDigits: entier ? 0 : 2,
    }).format(montant)
  } catch {
    return `${montant.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} ${devise}`
  }
}
