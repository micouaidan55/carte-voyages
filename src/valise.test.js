import { describe, expect, it } from 'vitest'
import { fusionnerValise, genererValise, progression, saison } from './valise.js'

const textes = (items, g) => items.filter((i) => !g || i.g === g).map((i) => i.t)

describe('préparer son voyage', () => {
  it('inverse les saisons dans l’hémisphère sud', () => {
    expect(saison(1, 48)).toBe('hiver')
    expect(saison(1, -34)).toBe('ete') // janvier à Buenos Aires
    expect(saison(7, -34)).toBe('hiver')
    expect(saison(7, 10)).toBe('tropiques')
    expect(saison(null, 48)).toBeNull()
  })

  it('demande un passeport hors d’Europe et une carte d’identité en Europe', () => {
    expect(textes(genererValise({ code: 'JP', home: 'FR' }), 'sac')).toContain('Passeport')
    const italie = genererValise({ code: 'IT', home: 'FR' })
    expect(textes(italie, 'sac')).toContain('Carte d’identité ou passeport')
    expect(textes(italie)).not.toContain('Adaptateur de prise')
  })

  it('rappelle l’ESTA pour les États-Unis et Ariane pour un Français', () => {
    const us = textes(genererValise({ code: 'US', home: 'FR' }), 'avant')
    expect(us.join()).toContain('ESTA')
    expect(us).toContain('S’inscrire sur Ariane (France Diplomatie)')
  })

  it('s’adapte aux envies, à la saison et au vol', () => {
    const hiver = textes(genererValise({ code: 'CA', home: 'FR', mois: 1, latitude: 45 }), 'valise')
    expect(hiver).toContain('Manteau chaud, bonnet, gants')
    const plage = genererValise({ code: 'TH', home: 'FR', mois: 2, latitude: 13, envies: ['plage'], volHeures: 12 })
    expect(textes(plage, 'valise')).toContain('Maillot de bain')
    expect(textes(plage, 'acheter')).toContain('Anti-moustiques')
    expect(textes(plage, 'acheter')).toContain('Coussin de voyage, masque et bouchons d’oreilles')
  })

  it('ajoute une liste bébé seulement si demandé', () => {
    expect(textes(genererValise({ code: 'ES', home: 'FR' }), 'bebe')).toHaveLength(0)
    const bebe = textes(genererValise({ code: 'ES', home: 'FR', jours: 4, bebe: true }), 'bebe')
    expect(bebe).toContain('Couches (environ 24)')
    expect(bebe).toContain('Carnet de santé')
  })

  it('garde les cases cochées et les ajouts quand la liste est refaite', () => {
    const avant = genererValise({ code: 'ES', home: 'FR' })
    avant[0].ok = true
    avant.push({ cat: 'Mes ajouts', t: 'Guitare', ok: false })
    const apres = fusionnerValise(avant, genererValise({ code: 'ES', home: 'FR', bebe: true }))
    expect(apres[0].ok).toBe(true)
    expect(apres.at(-1)).toMatchObject({ g: 'valise', t: 'Guitare' })
    expect(textes(apres, 'bebe').length).toBeGreaterThan(5)
  })

  it('compte les objets cochés', () => {
    const items = genererValise({ code: 'ES', home: 'FR' })
    items[0].ok = true
    expect(progression(items)).toMatchObject({ ok: 1, total: items.length })
  })
})
