// Recherche de villes (données chargées seulement au premier besoin).
import { normalize } from './countries.js'

let index = null
let loading = null

export function buildVilles(rows) {
  return rows.map(([nom, cc, lat, lon, popK, nomEn]) => ({
    nom,
    cc,
    lat,
    lon,
    pop: popK * 1000,
    termes: [normalize(nom), ...(nomEn ? [normalize(nomEn)] : [])],
  }))
}

export function loadVilles() {
  if (index) return Promise.resolve(index)
  loading ??= import('./data/villes.json').then((m) => (index = buildVilles(m.default)))
  return loading
}

// Les villes qui commencent par la saisie d'abord, puis les plus peuplées.
export function searchVilles(villes, query, { cc = null, limit = 6 } = {}) {
  const q = normalize(query)
  if (q.length < 2) return []
  const found = []
  for (const v of villes) {
    if (cc && v.cc !== cc) continue
    let rang = 3
    for (const t of v.termes) {
      if (t === q) rang = Math.min(rang, 0)
      else if (t.startsWith(q)) rang = Math.min(rang, 1)
      else if (t.includes(' ' + q)) rang = Math.min(rang, 2)
    }
    if (rang < 3) found.push({ v, rang })
  }
  found.sort((a, b) => a.rang - b.rang || b.v.pop - a.v.pop)
  return found.slice(0, limit).map((f) => f.v)
}
