import PAYS from './data/pays.json'

export { PAYS }

export const CONTINENTS = {
  EU: 'Europe',
  AS: 'Asie',
  AF: 'Afrique',
  NA: 'Amérique du Nord',
  SA: 'Amérique du Sud',
  OC: 'Océanie',
  AN: 'Antarctique',
}

const langues = new Intl.DisplayNames(['fr'], { type: 'language' })
const monnaies = new Intl.DisplayNames(['fr'], { type: 'currency' })

// Point de référence d'un pays : sa capitale, sinon son centre.
export function pointOf(code) {
  const p = PAYS[code]
  if (!p) return null
  if (p.capitale) return [p.capitale.lat, p.capitale.lon]
  return p.centre
}

export function distanceKm([lat1, lon1], [lat2, lon2]) {
  const rad = Math.PI / 180
  const dLat = (lat2 - lat1) * rad
  const dLon = (lon2 - lon1) * rad
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(a))
}

// Vol direct : ~830 km/h en croisière + 30 min de décollage et d'atterrissage.
export function flightHours(km) {
  return 0.5 + km / 830
}

// Voiture : la route fait ~20 % de plus que la ligne droite, à ~95 km/h de moyenne (autoroute surtout).
export function driveHours(km) {
  return (km * 1.2) / 95
}

export function formatDuration(hours) {
  const total = Math.max(5, Math.round((hours * 60) / 15) * 15)
  const h = Math.floor(total / 60)
  const m = total % 60
  if (!h) return `${m} min`
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`
}

export function formatKm(km) {
  const arrondi = km < 100 ? Math.round(km) : Math.round(km / 10) * 10
  return `${arrondi.toLocaleString('fr-FR')} km`
}

// Décalage d'un fuseau par rapport à UTC, en minutes, à une date donnée (heure d'été comprise).
export function offsetMinutes(timeZone, date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  }).formatToParts(date)
  const get = (type) => Number(parts.find((p) => p.type === type).value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'))
  return Math.round((asUtc - Math.floor(date.getTime() / 60000) * 60000) / 60000)
}

export function formatOffset(minutes) {
  if (minutes === 0) return 'même heure'
  const sign = minutes > 0 ? '+' : '−'
  const abs = Math.abs(minutes)
  const h = Math.floor(abs / 60)
  const m = abs % 60
  return `${sign}${h} h${m ? ' ' + String(m).padStart(2, '0') : ''}`
}

export function localTime(timeZone, date = new Date()) {
  return new Intl.DateTimeFormat('fr-FR', { timeZone, hour: '2-digit', minute: '2-digit', weekday: 'long' }).format(
    date,
  )
}

// Fuseaux d'un pays : combien, et l'écart du plus en retard au plus en avance,
// par rapport à la capitale du pays d'origine (ou à UTC si aucun).
export function zoneRange(code, home = null, date = new Date()) {
  const zones = PAYS[code]?.fuseaux ?? []
  const tzHome = home ? PAYS[home]?.fuseauCapitale : null
  const base = tzHome ? offsetMinutes(tzHome, date) : 0
  const offsets = [...new Set(zones.map((z) => offsetMinutes(z, date) - base))].sort((a, b) => a - b)
  return { count: offsets.length, min: offsets[0], max: offsets[offsets.length - 1] }
}

// Tout ce que la fiche affiche « depuis chez moi ».
export function trip(home, dest, date = new Date()) {
  const from = pointOf(home)
  const to = pointOf(dest)
  const result = { km: null, flight: null, drive: null, offset: null }
  if (from && to && home !== dest) {
    const km = distanceKm(from, to)
    result.km = km
    if (km > 350) result.flight = flightHours(km)
    const voisin = PAYS[home]?.voisins.includes(dest)
    if (voisin || km < 1200) result.drive = driveHours(km)
  }
  const tzHome = PAYS[home]?.fuseauCapitale
  const tzDest = PAYS[dest]?.fuseauCapitale
  if (tzHome && tzDest) result.offset = offsetMinutes(tzDest, date) - offsetMinutes(tzHome, date)
  return result
}

export function languesOf(code) {
  return (PAYS[code]?.langues ?? [])
    .map((l) => {
      try {
        const nom = langues.of(l)
        return nom && nom !== l ? nom : null
      } catch {
        return null
      }
    })
    .filter(Boolean)
    .map((nom) => nom.charAt(0).toUpperCase() + nom.slice(1))
}

export function monnaieOf(code) {
  const c = PAYS[code]?.monnaie
  if (!c) return null
  const nom = monnaies.of(c)
  return nom && nom !== c ? `${nom.charAt(0).toUpperCase() + nom.slice(1)} (${c})` : c
}

export function formatPopulation(n) {
  if (!n) return null
  if (n >= 1e9) return `${(n / 1e9).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} milliard${n >= 2e9 ? 's' : ''}`
  if (n >= 1e6) return `${(n / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: n < 1e7 ? 1 : 0 })} millions`
  if (n >= 1e4) return `${Math.round(n / 1000).toLocaleString('fr-FR')} 000`
  return n.toLocaleString('fr-FR')
}

// Progression par continent, sur les 195 pays reconnus.
export function progress(visitedCodes) {
  const visited = new Set(visitedCodes)
  const rows = {}
  for (const [code, p] of Object.entries(PAYS)) {
    if (!p.pays || !CONTINENTS[p.continent]) continue
    const row = (rows[p.continent] ??= { id: p.continent, name: CONTINENTS[p.continent], total: 0, done: 0 })
    row.total++
    if (visited.has(code)) row.done++
  }
  const list = Object.values(rows).sort((a, b) => b.done / b.total - a.done / a.total || b.total - a.total)
  const total = list.reduce((s, r) => s + r.total, 0)
  const done = list.reduce((s, r) => s + r.done, 0)
  return { list, total, done }
}

// Devine le pays d'origine à partir de la langue du téléphone (fr-FR → FR).
export function guessHome(locales = navigator.languages ?? [navigator.language]) {
  for (const l of locales) {
    const region = l?.split('-')[1]
    if (region && PAYS[region.toUpperCase()]) return region.toUpperCase()
  }
  return null
}
