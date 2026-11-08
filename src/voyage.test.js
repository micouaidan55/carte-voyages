import { describe, expect, it } from 'vitest'
import { API_PAR_DEFAUT, createTrips, fusionnerTrajets, itineraireHtml, itineraireTexte, lienCarte, trajetsHtml } from './voyage.js'

function memoryStorage() {
  const data = {}
  return { getItem: (k) => data[k] ?? null, setItem: (k, v) => (data[k] = v) }
}

const exemple = {
  titre: 'Kyoto en 2 jours',
  resume: 'Temples et ruelles.',
  etapes: ['Kyoto'],
  jours: [
    {
      numero: 1,
      titre: 'Higashiyama',
      lieu: 'Kyoto',
      activites: [{ moment: 'matin', titre: 'Kiyomizu-dera', detail: 'Arriver à 8 h.', duree: '2 h' }],
      restaurants: [
        { repas: 'dîner', nom: '<img src=x onerror=alert(1)>', cuisine: 'kaiseki', prix: '€€€', quartier: 'Gion', pourquoi: 'Menu du soir.' },
      ],
      deplacement: '',
    },
  ],
  budget: '120 € par jour',
  conseils: ['Prendre le bus 100.'],
}

describe('voyages enregistrés', () => {
  it('garde, liste et supprime les voyages', () => {
    const storage = memoryStorage()
    const a = createTrips(storage)
    const t = a.add('JP', { jours: 2 }, exemple)
    const b = createTrips(storage)
    expect(b.list()).toHaveLength(1)
    expect(b.get(t.id).itineraire.titre).toBe('Kyoto en 2 jours')
    const removed = b.remove(t.id)
    expect(b.list()).toHaveLength(0)
    b.restore(removed)
    expect(createTrips(storage).list()).toHaveLength(1)
  })

  it('utilise l’adresse du serveur par défaut', () => {
    const t = createTrips(memoryStorage())
    expect(t.api).toEqual({ url: API_PAR_DEFAUT, code: '' })
    t.setApi({ code: 'abc' })
    expect(t.api.code).toBe('abc')
  })
})

describe('affichage', () => {
  it('échappe le texte venant de l’IA', () => {
    const html = itineraireHtml(exemple, 'Japon')
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
    expect(html).toContain('Kiyomizu-dera')
  })

  it('crée un lien Google Maps pour chaque restaurant', () => {
    expect(lienCarte('Ganko', 'Gion', 'Kyoto')).toBe('https://www.google.com/maps/search/?api=1&query=Ganko%20Gion%20Kyoto')
  })

  it('produit un texte à partager', () => {
    expect(itineraireTexte(exemple)).toContain('Jour 1 · Kyoto — Higashiyama')
  })
})

describe('trajets', () => {
  const af = { type: 'avion', numero: 'AF276', compagnie: 'Air France', depart_lieu: 'Paris', depart_code: 'CDG', depart_date: '2027-05-12', depart_heure: '10:25', arrivee_lieu: 'Tokyo', arrivee_code: 'HND', arrivee_date: '2027-05-13', arrivee_heure: '06:05', reference: 'ABC123' }
  const retour = { ...af, numero: 'AF275', depart_lieu: 'Tokyo', depart_date: '2027-05-20' }

  it('ajoute sans doublon et trie par date', () => {
    const a = fusionnerTrajets([retour], [af, af])
    expect(a.ajoutes).toBe(1)
    expect(a.tous.map((t) => t.numero)).toEqual(['AF276', 'AF275'])
  })

  it('affiche l’arrivée le lendemain et échappe le texte', () => {
    const html = trajetsHtml([{ ...af, compagnie: '<b>x</b>' }])
    expect(html).toContain('<sup>+1</sup>')
    expect(html).not.toContain('<b>x</b>')
  })

  it('met à jour un voyage enregistré', () => {
    const t = createTrips(memoryStorage())
    const v = t.add('JP', { jours: 2 }, exemple)
    t.update(v.id, { vols: [af] })
    expect(t.get(v.id).vols).toHaveLength(1)
  })
})
