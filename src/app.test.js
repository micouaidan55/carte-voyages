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

  it('retire un pays des envies quand on le visite', () => {
    const s = createStore(memoryStorage())
    s.wish.add('PE')
    s.visited.add('PE')
    expect(s.wish.has('PE')).toBe(false)
  })

  it('garde le pays d’origine', () => {
    const storage = memoryStorage()
    createStore(storage).setHome('BE')
    expect(createStore(storage).home).toBe('BE')
  })

  it('restaure une sauvegarde sans rien effacer', () => {
    const a = createStore(memoryStorage())
    a.add('FR')
    a.wish.add('IS')
    a.setHome('FR')
    const b = createStore(memoryStorage())
    b.add('JP')
    expect(b.importData(a.exportData())).toBe(1)
    expect(b.codes().sort()).toEqual(['FR', 'JP'])
    expect(b.wish.codes()).toEqual(['IS'])
    expect(b.home).toBe('FR')
    expect(() => b.importData({ foo: 1 })).toThrow()
  })

  it('garde les souvenirs et les inclut dans la sauvegarde', () => {
    const storage = memoryStorage()
    const a = createStore(storage)
    a.setSouvenir('IT', { annee: 2019, coeur: true })
    a.setSouvenir('IT', { texte: 'Pâtes à Bologne' })
    a.setSouvenir('ES', { annee: 3000 })
    const b = createStore(storage)
    expect(b.souvenir('IT')).toEqual({ annee: 2019, coeur: true, texte: 'Pâtes à Bologne' })
    expect(b.souvenir('ES').annee).toBeNull()
    const c = createStore(memoryStorage())
    c.setSouvenir('IT', { annee: 2021 })
    c.importData(b.exportData())
    expect(c.souvenir('IT').annee).toBe(2021) // le téléphone garde sa version
    b.setSouvenir('IT', { annee: null, coeur: false, texte: '' })
    expect(createStore(storage).exportData().souvenirs).toEqual({})
  })

  it('résiste à des données abîmées', () => {
    const storage = memoryStorage()
    storage.setItem('carte-voyages:v1', '{pas du json')
    expect(createStore(storage).size).toBe(0)
  })
})
