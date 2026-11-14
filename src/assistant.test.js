import { describe, expect, it } from 'vitest'
import { ETAPES, contexteAssistant, positionBulle, suggestions } from './assistant.js'

const noms = { FR: 'France', JP: 'Japon', IT: 'Italie' }
const nomPays = (c) => noms[c] ?? c

describe('assistant', () => {
  it('résume l’app et le voyage ouvert pour Claude', () => {
    const c = contexteAssistant({
      aujourdhui: '2026-11-14',
      origine: 'FR',
      visites: ['IT'],
      envies: ['JP'],
      nomPays,
      voyage: {
        code: 'JP',
        demande: { jours: 2 },
        reserver: { depart: '2026-11-20' },
        participants: ['Moi', 'Léa'],
        itineraire: {
          titre: 'Japon',
          jours: [{ numero: 1, lieu: 'Tokyo', titre: 'Arrivée', activites: [{ titre: 'Senso-ji' }], restaurants: [{ nom: 'Daikokuya' }, { nom: '' }] }],
        },
      },
    })
    expect(c).toMatchObject({ paysOrigine: 'France', paysVisites: ['Italie'], envies: ['Japon'] })
    expect(c.voyageOuvert).toMatchObject({ pays: 'Japon', depart: '2026-11-20', nombreDeJours: 2, voyageurs: ['Moi', 'Léa'] })
    expect(c.voyageOuvert.plan).toEqual(['Jour 1 · Tokyo · Arrivée : Senso-ji, Daikokuya'])
    expect(contexteAssistant({ aujourdhui: '2026-11-14' })).toEqual({ aujourdhui: '2026-11-14' })
  })

  it('propose des questions adaptées', () => {
    expect(suggestions(null)).toHaveLength(4)
    expect(suggestions({}).join(' ')).toContain('ce voyage')
  })

  it('a une visite guidée complète qui finit sur l’assistant', () => {
    expect(ETAPES.length).toBeGreaterThanOrEqual(8)
    for (const e of ETAPES) expect(e.titre && e.texte).toBeTruthy()
    expect(ETAPES.at(-1).cible).toBe('#btn-assistant')
  })

  it('place la bulle là où il y a de la place', () => {
    expect(positionBulle({ top: 20, height: 40 }, 800)).toBe('dessous')
    expect(positionBulle({ top: 700, height: 56 }, 800)).toBe('dessus')
    expect(positionBulle(null, 800)).toBe('centre')
  })
})
