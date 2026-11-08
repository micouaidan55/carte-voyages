import { describe, expect, it } from 'vitest'
import { formatTaux, getTaux } from './taux.js'

function memoryStorage() {
  const data = {}
  return { getItem: (k) => data[k] ?? null, setItem: (k, v) => (data[k] = v) }
}

const ok = (rates) => async () => ({
  json: async () => ({ result: 'success', rates, time_last_update_unix: 1_800_000_000 }),
})

describe('taux de change', () => {
  it('affiche un chiffre lisible dans les deux sens', () => {
    expect(formatTaux(162.4, 'EUR', 'JPY').replace(/\s/g, ' ')).toBe('1 € ≈ 162 ¥')
    expect(formatTaux(0.834, 'EUR', 'GBP').replace(/\s/g, ' ')).toBe('1 £ ≈ 1,20 €')
    expect(formatTaux(20208.9, 'EUR', 'IDR').replace(/\s/g, ' ')).toBe('1 € ≈ 20 209 Rp')
    expect(formatTaux(1, 'EUR', 'EUR')).toBeNull()
  })

  it('garde les taux 12 h puis les rafraîchit', async () => {
    const storage = memoryStorage()
    let appels = 0
    const fetchFn = async (...a) => {
      appels++
      return ok({ JPY: 160 })(...a)
    }
    await getTaux('EUR', { storage, fetchFn, now: 0 })
    await getTaux('EUR', { storage, fetchFn, now: 3600_000 })
    expect(appels).toBe(1)
    await getTaux('EUR', { storage, fetchFn, now: 13 * 3600_000 })
    expect(appels).toBe(2)
  })

  it('utilise les derniers taux connus hors connexion', async () => {
    const storage = memoryStorage()
    await getTaux('EUR', { storage, fetchFn: ok({ USD: 1.1 }), now: 0 })
    const horsLigne = async () => {
      throw new Error('réseau')
    }
    const t = await getTaux('EUR', { storage, fetchFn: horsLigne, now: 48 * 3600_000 })
    expect(t.rates.USD).toBe(1.1)
    expect(await getTaux('USD', { storage: memoryStorage(), fetchFn: horsLigne })).toBeNull()
  })
})
