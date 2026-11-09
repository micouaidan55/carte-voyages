import { describe, expect, it } from 'vitest'
import { bilan, convertir, equilibre, formatArgent, lireMontant, nouvelleDepense } from './depenses.js'

const rates = { EUR: 1, JPY: 160, USD: 1.08 }

describe('dépenses', () => {
  it('lit les montants écrits à la française', () => {
    expect(lireMontant('12,50')).toBe(12.5)
    expect(lireMontant('1 200')).toBe(1200)
    expect(lireMontant('3.5')).toBe(3.5)
    expect(lireMontant('-4')).toBeNull()
    expect(lireMontant('abc')).toBeNull()
    expect(lireMontant('0')).toBeNull()
  })

  it('convertit dans la monnaie de la maison', () => {
    expect(convertir(1600, 'JPY', 'EUR', rates)).toBe(10)
    expect(convertir(20, 'EUR', 'EUR', null)).toBe(20)
    expect(convertir(20, 'THB', 'EUR', rates)).toBeNull()
    const d = nouvelleDepense({ montant: 1234, devise: 'JPY', cat: 'repas', note: ' Ramen ', date: '2027-05-12' }, 'EUR', rates, 'a')
    expect(d).toMatchObject({ valeur: 7.71, note: 'Ramen', maison: 'EUR' })
  })

  it('fait le bilan par catégorie et par jour', () => {
    const deps = [
      nouvelleDepense({ montant: 3200, devise: 'JPY', cat: 'repas', date: '2027-05-12' }, 'EUR', rates, 'a'),
      nouvelleDepense({ montant: 100, devise: 'EUR', cat: 'logement', date: '2027-05-12' }, 'EUR', rates, 'b'),
      nouvelleDepense({ montant: 1600, devise: 'JPY', cat: 'transport', date: '2027-05-13' }, 'EUR', rates, 'c'),
      { id: 'd', montant: 50, devise: 'THB', cat: 'achats', date: '2027-05-13', maison: 'EUR', valeur: null },
    ]
    const b = bilan(deps, { maison: 'EUR', rates, budget: 500, depart: '2027-05-12', jours: 5, today: '2027-05-13' })
    expect(b.total).toBe(130)
    expect(b.sansTaux).toBe(1)
    expect(b.reste).toBe(370)
    expect(b.moyenne).toBe(65)
    expect(b.projection).toBe(325)
    expect(b.parJour.map((j) => j.date)).toEqual(['2027-05-13', '2027-05-12'])
    expect(b.parCat.map((c) => c.id)).toEqual(['repas', 'logement', 'transport'])
    expect(b.parCat[1].pct).toBe(77)
  })

  it('affiche les montants proprement', () => {
    expect(formatArgent(12.5, 'EUR').replace(/\s/g, ' ')).toBe('12,50 €')
    expect(formatArgent(1234, 'JPY').replace(/\s/g, ' ')).toBe('1 234 ¥')
  })
})

describe('partage entre voyageurs', () => {
  const dep = (montant, par, pour, devise = 'EUR') =>
    nouvelleDepense({ montant, devise, cat: 'repas', date: '2027-05-12', par, pour }, 'EUR', rates, `${montant}${par}`)

  it('garde le payeur et les personnes concernées', () => {
    expect(dep(30, 'Léa', ['Léa', 'Tom'])).toMatchObject({ par: 'Léa', pour: ['Léa', 'Tom'] })
    expect(nouvelleDepense({ montant: 5, devise: 'EUR', date: '2027-05-12' }, 'EUR', rates, 'x')).not.toHaveProperty('par')
  })

  it('calcule qui doit combien à qui', () => {
    const gens = ['Léa', 'Tom', 'Sam']
    const deps = [dep(90, 'Léa', gens), dep(30, 'Tom', ['Tom', 'Sam']), dep(3200, 'Sam', gens, 'JPY'), dep(10, 'Léa')]
    const e = equilibre(deps, gens, { maison: 'EUR', rates })
    expect(e.soldes.map((s) => [s.nom, s.paye, s.part, s.solde])).toEqual([
      ['Léa', 90, 36.67, 53.33],
      ['Tom', 30, 51.67, -21.67],
      ['Sam', 20, 51.67, -31.67],
    ])
    expect(e.virements).toEqual([
      { de: 'Sam', a: 'Léa', montant: 31.67 },
      { de: 'Tom', a: 'Léa', montant: 21.67 },
    ])
    expect(e.ignorees).toBe(1)
  })

  it('ne propose rien quand tout est réglé', () => {
    const e = equilibre([dep(20, 'Léa', ['Léa', 'Tom']), dep(20, 'Tom', ['Léa', 'Tom'])], ['Léa', 'Tom'], { maison: 'EUR', rates })
    expect(e.virements).toEqual([])
  })

  it('compte un remboursement comme un virement déjà fait', () => {
    const remb = nouvelleDepense({ montant: 20, devise: 'EUR', date: '2027-05-12', par: 'Tom', pour: ['Léa'], remb: true }, 'EUR', rates, 'r')
    const e = equilibre([dep(40, 'Léa', ['Léa', 'Tom']), remb], ['Léa', 'Tom'], { maison: 'EUR', rates })
    expect(e.virements).toEqual([])
    expect(e.soldes[0]).toMatchObject({ paye: 40, part: 20, solde: 0 })
  })
})

describe('remboursements', () => {
  it('ne comptent pas dans le total dépensé', () => {
    const r = nouvelleDepense({ montant: 20, devise: 'EUR', date: '2027-05-12', par: 'Tom', pour: ['Léa'], remb: true }, 'EUR', rates, 'r')
    expect(r.remb).toBe(true)
    expect(bilan([r], { maison: 'EUR', rates, today: '2027-05-12' }).total).toBe(0)
  })
})
