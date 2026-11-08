import { describe, expect, it } from 'vitest'
import { genererValise, progression, saison } from './valise.js'

const textes = (items) => items.map((i) => i.t)

describe('liste de valise', () => {
  it('inverse les saisons dans l’hémisphère sud', () => {
    expect(saison(1, 48)).toBe('hiver')
    expect(saison(1, -34)).toBe('ete') // janvier à Buenos Aires
    expect(saison(7, -34)).toBe('hiver')
    expect(saison(7, 10)).toBe('tropiques')
    expect(saison(null, 48)).toBeNull()
  })

  it('demande un passeport hors d’Europe et une carte d’identité en Europe', () => {
    expect(textes(genererValise({ code: 'JP', home: 'FR' })).join()).toContain('Passeport')
    const italie = textes(genererValise({ code: 'IT', home: 'FR' }))
    expect(italie).toContain('Carte d’identité ou passeport')
    expect(italie).not.toContain('Adaptateur de prise')
  })

  it('s’adapte aux envies et à la saison', () => {
    const hiver = textes(genererValise({ code: 'CA', home: 'FR', mois: 1, latitude: 45 }))
    expect(hiver).toContain('Manteau chaud, bonnet, gants')
    const plage = textes(genererValise({ code: 'TH', home: 'FR', mois: 2, latitude: 13, envies: ['plage'] }))
    expect(plage).toContain('Maillot de bain')
    expect(plage).toContain('Anti-moustiques')
  })

  it('compte les objets cochés', () => {
    const items = genererValise({ code: 'ES', home: 'FR' })
    items[0].ok = true
    expect(progression(items)).toMatchObject({ ok: 1, total: items.length })
  })
})
