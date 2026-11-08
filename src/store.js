const KEY_VISITED = 'carte-voyages:v1' // nom d'origine, gardé pour ne rien perdre
const KEY_WISH = 'carte-voyages:envies'
const KEY_SETTINGS = 'carte-voyages:reglages'
const KEY_SOUVENIRS = 'carte-voyages:souvenirs'

// Un souvenir : année de visite, coup de cœur, quelques mots.
function cleanSouvenir(s) {
  if (!s || typeof s !== 'object') return null
  const annee = Number.isInteger(s.annee) && s.annee >= 1900 && s.annee <= 2100 ? s.annee : null
  const coeur = s.coeur === true
  const texte = typeof s.texte === 'string' ? s.texte.slice(0, 1000) : ''
  return annee || coeur || texte ? { annee, coeur, texte } : null
}

function toSouvenirs(obj) {
  const out = {}
  if (obj && typeof obj === 'object') {
    for (const [code, s] of Object.entries(obj)) {
      const clean = cleanSouvenir(s)
      if (clean && /^[A-Z]{2}$/.test(code)) out[code] = clean
    }
  }
  return out
}

function safeStorage() {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function read(storage, key, fallback) {
  try {
    const raw = storage?.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function write(storage, key, value) {
  try {
    storage?.setItem(key, JSON.stringify(value))
  } catch {
    // Stockage indisponible (navigation privée) : on garde en mémoire.
  }
}

function toMap(list) {
  const map = new Map()
  if (Array.isArray(list)) {
    for (const item of list) if (item && typeof item.code === 'string') map.set(item.code, item.addedAt ?? Date.now())
  }
  return map
}

export function createStore(storage = safeStorage()) {
  const lists = {
    visited: toMap(read(storage, KEY_VISITED, [])),
    wish: toMap(read(storage, KEY_WISH, [])),
  }
  const keys = { visited: KEY_VISITED, wish: KEY_WISH }
  let souvenirs = toSouvenirs(read(storage, KEY_SOUVENIRS, {}))
  let settings = read(storage, KEY_SETTINGS, {})
  if (!settings || typeof settings !== 'object') settings = {}
  const listeners = new Set()

  function save(name) {
    write(storage, keys[name], [...lists[name]].map(([code, addedAt]) => ({ code, addedAt })))
    listeners.forEach((fn) => fn())
  }

  function api(name) {
    const map = lists[name]
    return {
      has: (code) => map.has(code),
      get size() {
        return map.size
      },
      codes: () => [...map.keys()],
      add(code, addedAt = Date.now()) {
        if (map.has(code)) return false
        map.set(code, addedAt)
        // Un pays visité n'est plus une envie.
        if (name === 'visited' && lists.wish.delete(code)) save('wish')
        save(name)
        return true
      },
      remove(code) {
        if (!map.has(code)) return null
        const addedAt = map.get(code)
        map.delete(code)
        save(name)
        return addedAt
      },
    }
  }

  const visited = api('visited')
  const wish = api('wish')

  return {
    visited,
    wish,
    // Raccourcis gardés pour le code existant.
    has: visited.has,
    get size() {
      return visited.size
    },
    codes: visited.codes,
    add: visited.add,
    remove: visited.remove,

    souvenir: (code) => souvenirs[code] ?? { annee: null, coeur: false, texte: '' },
    setSouvenir(code, patch) {
      const next = cleanSouvenir({ ...(souvenirs[code] ?? {}), ...patch })
      souvenirs = { ...souvenirs }
      if (next) souvenirs[code] = next
      else delete souvenirs[code]
      write(storage, KEY_SOUVENIRS, souvenirs)
      listeners.forEach((fn) => fn())
    },

    get home() {
      return settings.home ?? null
    },
    setHome(code) {
      settings = { ...settings, home: code }
      write(storage, KEY_SETTINGS, settings)
      listeners.forEach((fn) => fn())
    },

    exportData() {
      return {
        app: 'mes-pays',
        version: 1,
        date: new Date().toISOString(),
        home: settings.home ?? null,
        visites: [...lists.visited].map(([code, addedAt]) => ({ code, addedAt })),
        envies: [...lists.wish].map(([code, addedAt]) => ({ code, addedAt })),
        souvenirs,
      }
    },
    // Fusionne une sauvegarde : rien de ce qui est déjà là n'est effacé.
    importData(data) {
      if (!data || data.app !== 'mes-pays') throw new Error('Ce fichier ne vient pas de Mes pays')
      let added = 0
      for (const [code, addedAt] of toMap(data.visites)) {
        if (!lists.visited.has(code)) {
          lists.visited.set(code, addedAt)
          lists.wish.delete(code)
          added++
        }
      }
      for (const [code, addedAt] of toMap(data.envies)) {
        if (!lists.visited.has(code) && !lists.wish.has(code)) lists.wish.set(code, addedAt)
      }
      const recus = toSouvenirs(data.souvenirs)
      souvenirs = { ...recus, ...souvenirs } // ce qui est déjà sur le téléphone gagne
      write(storage, KEY_SOUVENIRS, souvenirs)
      if (!settings.home && typeof data.home === 'string') {
        settings = { ...settings, home: data.home }
        write(storage, KEY_SETTINGS, settings)
      }
      save('wish')
      save('visited')
      return added
    },

    subscribe(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
  }
}
