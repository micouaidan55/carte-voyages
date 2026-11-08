import { describe, expect, it } from 'vitest'
import { FORMAT, consigne, validerDemande, verifierItineraire } from './itineraire.js'

describe('demande de voyage', () => {
  it('garde une demande correcte', () => {
    const d = validerDemande({ pays: 'Japon', ville: 'Kyoto', jours: 5, envies: ['culture', 'gastronomie'], mois: 4 })
    expect(d).toMatchObject({ pays: 'Japon', ville: 'Kyoto', jours: 5, budget: 'moyen', rythme: 'equilibre', mois: 4 })
    expect(consigne(d)).toContain('5 jours : Japon (Kyoto)')
    expect(consigne(d)).toContain('avril')
  })

  it('refuse un nombre de jours hors limites', () => {
    expect(() => validerDemande({ pays: 'Italie', jours: 0 })).toThrow()
    expect(() => validerDemande({ pays: 'Italie', jours: 30 })).toThrow()
    expect(() => validerDemande({ pays: 'Italie', jours: 2.5 })).toThrow()
  })

  it('ignore les envies inconnues et nettoie le texte', () => {
    const d = validerDemande({ pays: ' Grèce<script> ', jours: 3, envies: ['plage', 'piratage', 'plage'] })
    expect(d.pays).toBe('Grèce script')
    expect(d.envies).toEqual(['plage'])
  })

  it('limite la longueur des précisions', () => {
    const d = validerDemande({ pays: 'Pérou', jours: 10, precisions: 'a'.repeat(1000) })
    expect(d.precisions.length).toBe(300)
  })
})

describe('format de réponse', () => {
  it('exige toutes les propriétés (sortie structurée stricte)', () => {
    const check = (schema) => {
      if (schema.type === 'object') {
        expect(schema.additionalProperties).toBe(false)
        expect(schema.required.sort()).toEqual(Object.keys(schema.properties).sort())
        Object.values(schema.properties).forEach(check)
      }
      if (schema.type === 'array') check(schema.items)
    }
    check(FORMAT)
  })

  it('rejette un itinéraire vide', () => {
    expect(() => verifierItineraire({ jours: [] }, 3)).toThrow()
    expect(verifierItineraire({ jours: [{}] }, 1).jours).toHaveLength(1)
  })
})
