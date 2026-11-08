const KEY = 'carte-voyages:v1'

function safeStorage() {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function createStore(storage = safeStorage()) {
  let visited = new Map()
  const listeners = new Set()

  try {
    const raw = storage?.getItem(KEY)
    if (raw) {
      for (const { code, addedAt } of JSON.parse(raw)) visited.set(code, addedAt)
    }
  } catch {
    visited = new Map()
  }

  function save() {
    try {
      storage?.setItem(KEY, JSON.stringify([...visited].map(([code, addedAt]) => ({ code, addedAt }))))
    } catch {
      // Stockage indisponible (navigation privée) : on garde en mémoire.
    }
    listeners.forEach((fn) => fn())
  }

  return {
    has: (code) => visited.has(code),
    get size() {
      return visited.size
    },
    codes: () => [...visited.keys()],
    add(code, addedAt = Date.now()) {
      if (visited.has(code)) return false
      visited.set(code, addedAt)
      save()
      return true
    },
    remove(code) {
      if (!visited.has(code)) return null
      const addedAt = visited.get(code)
      visited.delete(code)
      save()
      return addedAt
    },
    subscribe(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
  }
}
