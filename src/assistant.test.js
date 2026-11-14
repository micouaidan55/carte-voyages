import { describe, expect, it } from 'vitest'
import { ETAPES, appliquerProposition, contexteAssistant, libelleProposition, positionBulle, retirerProposition, suggestions } from './assistant.js'
import { itineraireVide } from './voyage.js'

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

describe('ajouts proposés par l’assistant', () => {
  const plan = {
    titre: 'Japon',
    etapes: ['Tokyo'],
    jours: [
      { numero: 1, lieu: 'Tokyo', titre: 'A', activites: [{ moment: 'soir', titre: 'Skytree' }], restaurants: [] },
      { numero: 2, lieu: 'Tokyo', titre: 'B', activites: [], restaurants: [] },
    ],
  }

  it('ajoute une activité au bon moment et un restaurant, puis les retire', () => {
    let p = appliquerProposition(plan, { jour: 1, moment: 'matin', titre: 'Senso-ji', detail: 'Tôt' })
    expect(p.jours[0].activites.map((a) => a.titre)).toEqual(['Senso-ji', 'Skytree'])
    p = appliquerProposition(p, { jour: 2, moment: 'dîner', titre: 'Ichiran', detail: 'Ramen' })
    expect(p.jours[1].restaurants[0]).toMatchObject({ nom: 'Ichiran', repas: 'dîner', pourquoi: 'Ramen', perso: true })
    p = retirerProposition(p, { jour: 1, moment: 'matin', titre: 'Senso-ji' })
    expect(p.jours[0].activites.map((a) => a.titre)).toEqual(['Skytree'])
    expect(retirerProposition(p, { jour: 1, moment: 'soir', titre: 'Skytree' }).jours[0].activites).toHaveLength(1) // pas un ajout
    expect(libelleProposition({ jour: 2, moment: 'après-midi', titre: 'Ueno' })).toBe('Jour 2 · Après-midi : Ueno')
  })

  it('crée les jours d’un plan vide sans dépasser la durée du voyage', () => {
    const vide = itineraireVide({ pays: 'Japon', ville: 'Tokyo', jours: 3 })
    const p = appliquerProposition(vide, { jour: 2, moment: 'matin', titre: 'Ueno', detail: '' }, 3)
    expect(p).toMatchObject({ vide: false, manuel: true })
    expect(p.jours).toHaveLength(2)
    expect(p.jours[1].activites[0].titre).toBe('Ueno')
    expect(appliquerProposition(vide, { jour: 5, moment: 'matin', titre: 'Trop loin', detail: '' }, 3)).toBeNull()
  })
})
