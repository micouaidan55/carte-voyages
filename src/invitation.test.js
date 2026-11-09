import { describe, expect, it } from 'vitest'
import { decoderVoyage, encoderVoyage, fusionnerVoyage, nettoyerVoyage } from './invitation.js'

const pays = new Set(['JP', 'FR'])
const voyage = {
  id: 'abc123',
  code: 'JP',
  date: 1,
  demande: { jours: 5, voyageurs: 'amis' },
  itineraire: {
    titre: 'Tokyo · 5 jours',
    etapes: ['Tokyo'],
    jours: [{ numero: 1, lieu: 'Tokyo', titre: 'Asakusa', activites: [{ titre: 'Senso-ji' }], restaurants: [{ cuisine: 'ramen', nom: 'Ichiran' }] }],
    conseils: [],
  },
  valise: [
    { g: 'sac', cat: 'Papiers', t: 'Passeport', ok: true },
    { g: 'valise', cat: 'Vêtements', t: 'Pull', ok: false },
  ],
  reserver: { depart: '2027-05-12', adultes: 3, faits: { vol: true } },
  participants: ['Moi', 'Léa'],
  depenses: [{ id: 'd1', montant: 90, devise: 'EUR', cat: 'repas', date: '2027-05-12', maison: 'EUR', valeur: 90, par: 'Moi', pour: ['Moi', 'Léa'] }],
  budgetPrevu: 1000,
}

describe('lien d’invitation', () => {
  it('transporte tout le voyage et le retrouve à l’identique', async () => {
    const code = await encoderVoyage(voyage)
    expect(code).toMatch(/^[zj][\w-]+$/)
    expect(await decoderVoyage(code)).toEqual(voyage)
  })

  it('compresse le voyage pour garder un lien raisonnable', async () => {
    const gros = { ...voyage, itineraire: { ...voyage.itineraire, jours: Array(10).fill(voyage.itineraire.jours[0]) } }
    const code = await encoderVoyage(gros)
    expect(code.length).toBeLessThan(JSON.stringify(gros).length)
  })

  it('refuse un lien abîmé', async () => {
    await expect(decoderVoyage('zpasdutout')).rejects.toThrow()
    await expect(decoderVoyage('x123')).rejects.toThrow()
  })
})

describe('contenu reçu', () => {
  it('garde un voyage valable', () => {
    expect(nettoyerVoyage(voyage, pays)).toMatchObject({ id: 'abc123', budgetPrevu: 1000, participants: ['Moi', 'Léa'] })
  })

  it('rejette ou répare ce qui a une mauvaise forme', () => {
    expect(nettoyerVoyage({ ...voyage, code: 'XX' }, pays)).toBeNull()
    expect(nettoyerVoyage({ ...voyage, id: '<img>' }, pays)).toBeNull()
    expect(nettoyerVoyage({ ...voyage, itineraire: 'x' }, pays)).toBeNull()
    const v = nettoyerVoyage(
      {
        ...voyage,
        valise: [{ t: 'Pull', ok: 'oui' }, 'n’importe quoi'],
        depenses: [{ id: 'x', montant: 'beaucoup', devise: 'EUR' }, { id: 'y', montant: 5, devise: 'EUR', par: 'Moi', remb: true }],
        reserver: { adultes: 99, faits: { vol: 'x' } },
      },
      pays,
    )
    expect(v.valise).toEqual([{ g: 'valise', cat: '', t: 'Pull', ok: false }])
    expect(v.depenses).toHaveLength(1)
    expect(v.depenses[0]).not.toHaveProperty('remb')
    expect(v.reserver).toMatchObject({ adultes: 9, faits: { vol: true } })
  })
})

describe('mise à jour d’une copie', () => {
  it('additionne sans rien perdre', () => {
    const local = {
      ...voyage,
      date: 42,
      valise: [
        { g: 'sac', cat: 'Papiers', t: 'Passeport', ok: false },
        { g: 'valise', cat: 'Vêtements', t: 'Pull', ok: true },
        { g: 'valise', cat: 'Mes ajouts', t: 'Guitare', ok: false },
      ],
      depenses: [...voyage.depenses, { id: 'd2', montant: 20, devise: 'EUR', cat: 'autre', date: '2027-05-13', maison: 'EUR', valeur: 20 }],
      participants: ['Moi', 'Léa', 'Tom'],
      reserver: { depart: '2027-05-12', adultes: 3, faits: { 'hotel|Tokyo': true } },
    }
    const recu = { ...voyage, depenses: [...voyage.depenses, { id: 'd3', montant: 5, devise: 'EUR', cat: 'autre', date: '2027-05-13', maison: 'EUR', valeur: 5 }] }
    const f = fusionnerVoyage(local, recu)
    expect(f.date).toBe(42)
    expect(f.valise.map((i) => [i.t, i.ok])).toEqual([
      ['Passeport', true],
      ['Pull', true],
      ['Guitare', false],
    ])
    expect(f.depenses.map((d) => d.id).sort()).toEqual(['d1', 'd2', 'd3'])
    expect(f.participants).toEqual(['Moi', 'Léa', 'Tom'])
    expect(f.reserver.faits).toEqual({ 'hotel|Tokyo': true, vol: true })
  })

  it('ne remplace pas un itinéraire par un voyage sans itinéraire', () => {
    const f = fusionnerVoyage(voyage, { ...voyage, itineraire: { titre: 'Tokyo', jours: [], vide: true } })
    expect(f.itineraire.jours).toHaveLength(1)
  })
})
