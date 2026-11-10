// Météo des jours du voyage (Open-Meteo, gratuit et sans clé), gardée en mémoire pour le hors-ligne.
import { normalize } from './countries.js'
import { joursEntre } from './rappels.js'

const KEY = 'carte-voyages:meteo'
const TROIS_HEURES = 3 * 3600 * 1000
export const SOURCE_METEO = { nom: 'Open-Meteo', url: 'https://open-meteo.com' }
export const JOURS_PREVUS = 16

function safeStorage() {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

// Le séjour tombe-t-il (au moins en partie) dans les prévisions disponibles ?
export function meteoUtile(depart, nbJours, today) {
  if (!depart || !nbJours) return false
  const debut = joursEntre(today, depart)
  return debut < JOURS_PREVUS && debut + nbJours > 0
}

// Coordonnées d'un lieu du plan : la ville de ce pays qui porte ce nom, sinon la capitale.
export function placerLieu(lieu, cc, villes, capitale) {
  const essais = [lieu, String(lieu ?? '').split(/\s*[(,–—/]\s*|\s+-\s+/)[0]].map((s) => normalize(s ?? '')).filter(Boolean)
  for (const q of essais) {
    let meilleure = null
    for (const v of villes) if (v.cc === cc && v.termes.includes(q) && (!meilleure || v.pop > meilleure.pop)) meilleure = v
    if (meilleure) return { lat: meilleure.lat, lon: meilleure.lon }
  }
  return capitale ? { lat: capitale.lat, lon: capitale.lon } : null
}

const arrondi = (x) => Math.round(x * 100) / 100

export async function getMeteo(lat, lon, { storage = safeStorage(), fetchFn = globalThis.fetch, now = Date.now() } = {}) {
  const cle = `${arrondi(lat)},${arrondi(lon)}`
  let cache = {}
  try {
    cache = JSON.parse(storage?.getItem(KEY) ?? '{}') ?? {}
  } catch {
    cache = {}
  }
  const connu = cache[cle]
  if (connu && now - connu.fetchedAt < TROIS_HEURES) return connu.jours
  try {
    const params = new URLSearchParams({
      latitude: arrondi(lat),
      longitude: arrondi(lon),
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
      timezone: 'auto',
      forecast_days: JOURS_PREVUS,
    })
    const r = await fetchFn(`https://api.open-meteo.com/v1/forecast?${params}`)
    if (!r.ok) throw new Error('réponse invalide')
    const d = (await r.json())?.daily
    if (!Array.isArray(d?.time)) throw new Error('réponse invalide')
    const jours = {}
    d.time.forEach((date, i) => {
      if (d.weather_code[i] == null) return
      jours[date] = {
        code: d.weather_code[i],
        max: Math.round(d.temperature_2m_max[i]),
        min: Math.round(d.temperature_2m_min[i]),
        pluie: d.precipitation_probability_max?.[i] ?? null,
      }
    })
    // On ne garde que les dix derniers lieux consultés.
    const garde = Object.entries({ ...cache, [cle]: { jours, fetchedAt: now } })
      .sort((a, b) => b[1].fetchedAt - a[1].fetchedAt)
      .slice(0, 10)
    try {
      storage?.setItem(KEY, JSON.stringify(Object.fromEntries(garde)))
    } catch {
      // Stockage plein.
    }
    return jours
  } catch {
    return connu ? connu.jours : null // hors connexion : les dernières prévisions connues
  }
}

// Codes météo de l'OMS (WMO) en mots simples.
const TEMPS = [
  [[0], '☀️', 'Ensoleillé'],
  [[1], '🌤️', 'Plutôt beau'],
  [[2], '⛅', 'Nuageux par moments'],
  [[3], '☁️', 'Couvert'],
  [[45, 48], '🌫️', 'Brouillard'],
  [[51, 53, 55, 56, 57], '🌦️', 'Bruine'],
  [[61, 63, 65, 66, 67, 80, 81, 82], '🌧️', 'Pluie'],
  [[71, 73, 75, 77, 85, 86], '🌨️', 'Neige'],
  [[95, 96, 99], '⛈️', 'Orages'],
]

export function decrireTemps(code) {
  const t = TEMPS.find(([codes]) => codes.includes(code))
  return t ? { emoji: t[1], mot: t[2] } : { emoji: '🌡️', mot: 'Variable' }
}
