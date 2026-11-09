import { describe, expect, it } from 'vitest'
import { ajouterActivite, ajouterJour, ajouterRestaurant, fusionnerPlans, modifierJour, retirerElement, retirerJour } from './plan.js'
import { itineraireVide } from './voyage.js'

const vide = itineraireVide({ pays: 'Japon', ville: 'Tokyo', jours: 5 })

describe('modifier le plan à la main', () => {
  it('construit un plan à partir d’un voyage sans itinéraire', () => {
    let it1 = ajouterJour(vide)
    expect(it1.vide).toBe(false)
    expect(it1.jours[0]).toMatchObject({ numero: 1, lieu: 'Tokyo', titre: 'Journée libre' })
    it1 = ajouterJour(it1, { lieu: 'Kyoto', titre: 'Temples' })
    expect(it1.etapes).toEqual(['Tokyo', 'Kyoto'])
    expect(vide.jours).toHaveLength(0) // l'original n'est pas touché
  })

  it('range les activités par moment de la journée', () => {
    let p = ajouterJour(vide)
    p = ajouterActivite(p, 0, { moment: 'soir', titre: 'Shibuya Sky' })
    p = ajouterActivite(p, 0, { moment: 'matin', titre: 'Senso-ji', detail: 'Tôt pour éviter la foule' })
    p = ajouterActivite(p, 0, { moment: 'après-midi', titre: 'Ueno' })
    p = ajouterActivite(p, 0, { moment: 'matin', titre: '   ' })
    expect(p.jours[0].activites.map((a) => a.titre)).toEqual(['Senso-ji', 'Ueno', 'Shibuya Sky'])
    expect(p.jours[0].activites[0]).toMatchObject({ perso: true, detail: 'Tôt pour éviter la foule' })
  })

  it('ajoute, modifie et retire', () => {
    let p = ajouterJour(ajouterJour(vide), { lieu: 'Kyoto' })
    p = ajouterRestaurant(p, 1, { nom: 'Ippudo', repas: 'déjeuner' })
    expect(p.jours[1].restaurants[0]).toMatchObject({ nom: 'Ippudo', repas: 'déjeuner' })
    p = retirerElement(p, 1, 'restaurants', 0)
    expect(p.jours[1].restaurants).toHaveLength(0)
    p = modifierJour(p, 0, { titre: 'Arrivée', deplacement: 'Narita Express' })
    expect(p.jours[0]).toMatchObject({ titre: 'Arrivée', deplacement: 'Narita Express' })
    p = retirerJour(p, 0)
    expect(p.jours.map((j) => [j.numero, j.lieu])).toEqual([[1, 'Kyoto']])
    expect(p.etapes).toEqual(['Kyoto'])
  })

  it('additionne deux versions du plan sans rien perdre', () => {
    const base = ajouterJour(ajouterJour(vide))
    const moi = ajouterActivite(base, 0, { titre: 'Senso-ji' })
    const ami = ajouterJour(ajouterActivite(base, 0, { titre: 'Akihabara', moment: 'soir' }), { lieu: 'Nara' })
    const f = fusionnerPlans(moi, ami)
    expect(f.jours[0].activites.map((a) => a.titre)).toEqual(['Akihabara', 'Senso-ji'])
    expect(f.jours).toHaveLength(3)
    expect(fusionnerPlans(moi, vide)).toBe(moi)
  })
})
