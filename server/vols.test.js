import { describe, expect, it } from 'vitest'
import { FORMAT_VOLS, consigneVols, nettoyerTrajets, validerTexte } from './vols.js'

describe('lecture de réservation', () => {
  it('refuse un texte vide ou trop long', () => {
    expect(() => validerTexte({ texte: 'court' })).toThrow()
    expect(() => validerTexte({ texte: 'x'.repeat(30001) })).toThrow()
    expect(validerTexte({ texte: '  Votre vol AF276 Paris → Tokyo  ' })).toBe('Votre vol AF276 Paris → Tokyo')
  })

  it('enferme l’e-mail dans des balises de données', () => {
    expect(consigneVols('Bonjour')).toContain('<email>\nBonjour\n</email>')
  })

  it('vérifie les formats renvoyés', () => {
    const { trajets } = nettoyerTrajets({
      trajets: [
        { type: 'fusée', numero: 'AF 276', depart_code: 'cdg', depart_date: '12/05/2027', depart_heure: '10:25', arrivee_code: 'HND' },
      ],
    })
    expect(trajets[0]).toMatchObject({ type: 'avion', numero: 'AF276', depart_code: '', depart_date: '', depart_heure: '10:25', arrivee_code: 'HND' })
  })

  it('exige toutes les propriétés (sortie structurée stricte)', () => {
    const t = FORMAT_VOLS.properties.trajets.items
    expect(t.required.sort()).toEqual(Object.keys(t.properties).sort())
    expect(t.additionalProperties).toBe(false)
  })
})
