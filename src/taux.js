// Taux de change (ExchangeRate-API, gratuit, mis à jour chaque jour), gardés en mémoire pour le hors-ligne.

const KEY = 'carte-voyages:taux'
const URL_TAUX = 'https://open.er-api.com/v6/latest/'
export const SOURCE = { nom: 'ExchangeRate-API', url: 'https://www.exchangerate-api.com' }
const DOUZE_HEURES = 12 * 3600 * 1000

function safeStorage() {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export async function getTaux(base, { storage = safeStorage(), fetchFn = globalThis.fetch, now = Date.now() } = {}) {
  let cache = null
  try {
    cache = JSON.parse(storage?.getItem(KEY) ?? 'null')
  } catch {
    cache = null
  }
  const valide = cache && cache.base === base && cache.rates
  if (valide && now - cache.fetchedAt < DOUZE_HEURES) return cache
  try {
    const r = await fetchFn(URL_TAUX + encodeURIComponent(base))
    const data = await r.json()
    if (data.result !== 'success' || !data.rates) throw new Error('réponse invalide')
    const next = { base, rates: data.rates, date: data.time_last_update_unix * 1000, fetchedAt: now }
    try {
      storage?.setItem(KEY, JSON.stringify(next))
    } catch {
      // Stockage plein.
    }
    return next
  } catch {
    return valide ? cache : null // hors connexion : on garde les derniers taux connus
  }
}

function money(amount, currency) {
  const decimals = amount === 1 || amount >= 100 ? 0 : amount >= 10 ? 1 : 2
  try {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(amount)
  } catch {
    return `${amount.toLocaleString('fr-FR', { maximumFractionDigits: decimals })} ${currency}`
  }
}

// « 1 € ≈ 162 ¥ » ; on retourne le sens pour que le chiffre reste lisible (« 1 £ ≈ 1,20 € »).
export function formatTaux(rate, from, to) {
  if (!rate || !Number.isFinite(rate) || from === to) return null
  if (rate < 1) return `${money(1, to)} ≈ ${money(1 / rate, from)}`
  return `${money(1, from)} ≈ ${money(rate, to)}`
}
