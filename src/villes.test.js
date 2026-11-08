import { describe, expect, it } from 'vitest'
import rows from './data/villes.json'
import { buildVilles, searchVilles } from './villes.js'

const villes = buildVilles(rows)

describe('recherche de villes', () => {
  it('trouve les villes en français et en anglais', () => {
    expect(searchVilles(villes, 'venise')[0]).toMatchObject({ nom: 'Venise', cc: 'IT' })
    expect(searchVilles(villes, 'venice')[0].nom).toBe('Venise')
    expect(searchVilles(villes, 'marrakech')[0].cc).toBe('MA')
  })

  it('met la grande ville avant les homonymes', () => {
    expect(searchVilles(villes, 'paris')[0].cc).toBe('FR')
    expect(searchVilles(villes, 'londres')[0].cc).toBe('GB')
  })

  it('cherche dans un seul pays', () => {
    const r = searchVilles(villes, 'san', { cc: 'US' })
    expect(r.length).toBeGreaterThan(0)
    expect(r.every((v) => v.cc === 'US')).toBe(true)
  })

  it('contient les villes touristiques moyennes', () => {
    expect(searchVilles(villes, 'annecy')[0].cc).toBe('FR')
    expect(searchVilles(villes, 'saint-malo')[0].nom).toBe('Saint-Malo')
  })
})
