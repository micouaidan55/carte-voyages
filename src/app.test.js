import { describe, expect, it } from 'vitest'
import { buildIndex, flagOf, normalize, search } from './countries.js'
import { createStore } from './store.js'

function memoryStorage() {
  const data = {}
  return { getItem: (k) => data[k] ?? null, setItem: (k, v) => (data[k] = v) }
}

describe('recherche', () => {
  const index = buildIndex()

  it('ignore les accents et la casse', () => {
    expect(normalize('  Ét-ats Unis ')).toBe('et ats unis')
    expect(search(index, 'perou')[0].code).toBe('PE')
  })

  it('met en premier les noms qui commencent par la saisie', () => {
    expect(search(index, 'fra')[0].code).toBe('FR')
  })

  it('trouve les alias et les noms anglais', () => {
    expect(search(index, 'angleterre')[0].code).toBe('GB')
    expect(search(index, 'germany')[0].code).toBe('DE')
  })

  it('donne le drapeau', () => {
    expect(flagOf('FR')).toBe('🇫🇷')
  })
})

describe('pays visités', () => {
  it('garde les pays entre deux ouvertures', () => {
    const storage = memoryStorage()
    const a = createStore(storage)
    a.add('FR')
    a.add('JP')
    a.remove('FR')
    const b = createStore(storage)
    expect(b.codes()).toEqual(['JP'])
  })

  it("n'ajoute pas deux fois le même pays", () => {
    const s = createStore(memoryStorage())
    expect(s.add('IT')).toBe(true)
    expect(s.add('IT')).toBe(false)
    expect(s.size).toBe(1)
  })

  it('résiste à des données abîmées', () => {
    const storage = memoryStorage()
    storage.setItem('carte-voyages:v1', '{pas du json')
    expect(createStore(storage).size).toBe(0)
  })
})
