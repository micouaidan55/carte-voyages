import { describe, expect, it } from 'vitest'
import { decrireTemps, getMeteo, meteoUtile, placerLieu } from './meteo.js'

function memoryStorage() {
  const data = {}
  return { getItem: (k) => data[k] ?? null, setItem: (k, v) => (data[k] = v) }
}

const reponse = {
  daily: {
    time: ['2026-11-10', '2026-11-11'],
    weather_code: [0, 63],
    temperature_2m_max: [18.4, 12.6],
    temperature_2m_min: [9.2, 7.5],
    precipitation_probability_max: [5, 80],
  },
}

describe('météo des jours du voyage', () => {
  it('lit les prévisions jour par jour et les garde pour le hors-ligne', async () => {
    const storage = memoryStorage()
    let appels = 0
    const fetchFn = async (url) => {
      appels++
      expect(url).toContain('latitude=35.69&longitude=139.69')
      return { ok: true, json: async () => reponse }
    }
    const m = await getMeteo(35.6895, 139.6917, { storage, fetchFn, now: 1000 })
    expect(m['2026-11-11']).toEqual({ code: 63, max: 13, min: 8, pluie: 80 })
    await getMeteo(35.6895, 139.6917, { storage, fetchFn, now: 2000 })
    expect(appels).toBe(1)
    const horsLigne = await getMeteo(35.6895, 139.6917, { storage, fetchFn: async () => Promise.reject(new Error('x')), now: 1e9 })
    expect(horsLigne['2026-11-10'].max).toBe(18)
    expect(await getMeteo(1, 1, { storage, fetchFn: async () => Promise.reject(new Error('x')) })).toBeNull()
  })

  it('décrit le temps en mots simples', () => {
    expect(decrireTemps(0)).toEqual({ emoji: '☀️', mot: 'Ensoleillé' })
    expect(decrireTemps(63).mot).toBe('Pluie')
    expect(decrireTemps(95).emoji).toBe('⛈️')
    expect(decrireTemps(999).mot).toBe('Variable')
  })

  it('ne cherche la météo que si le séjour tombe dans les 16 prochains jours', () => {
    expect(meteoUtile('2026-11-09', 4, '2026-11-10')).toBe(true)
    expect(meteoUtile('2026-11-24', 3, '2026-11-10')).toBe(true)
    expect(meteoUtile('2026-11-30', 3, '2026-11-10')).toBe(false)
    expect(meteoUtile('2026-11-01', 3, '2026-11-10')).toBe(false)
    expect(meteoUtile(null, 3, '2026-11-10')).toBe(false)
  })

  it('situe un lieu : la ville du pays, sinon la capitale', () => {
    const villes = [
      { nom: 'Kyoto', cc: 'JP', lat: 35.02, lon: 135.75, pop: 1e6, termes: ['kyoto'] },
      { nom: 'Kyoto', cc: 'US', lat: 1, lon: 1, pop: 10, termes: ['kyoto'] },
    ]
    const capitale = { lat: 35.68, lon: 139.69 }
    expect(placerLieu('Kyoto', 'JP', villes, capitale)).toEqual({ lat: 35.02, lon: 135.75 })
    expect(placerLieu('Kyoto (Gion)', 'JP', villes, capitale)).toEqual({ lat: 35.02, lon: 135.75 })
    expect(placerLieu('Mont Fuji', 'JP', villes, capitale)).toEqual(capitale)
  })
})
