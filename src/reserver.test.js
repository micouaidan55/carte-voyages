import { describe, expect, it } from 'vitest'
import { aReserver, departPropose, lienBooking, lienVols, plusJours, sejours } from './reserver.js'

const it2 = {
  etapes: ['Tokyo', 'Kyoto'],
  jours: [
    { numero: 1, lieu: 'Tokyo', activites: [{ titre: 'Senso-ji' }], restaurants: [{ repas: 'dîner', nom: 'Ichiran', quartier: 'Shibuya' }] },
    { numero: 2, lieu: 'Tokyo', activites: [{ titre: 'teamLab' }], restaurants: [{ repas: 'déjeuner', nom: '' }] },
    { numero: 3, lieu: 'Kyoto', activites: [{ titre: 'Fushimi Inari' }, { titre: 'Senso-ji' }], restaurants: [] },
  ],
}

describe('réservation', () => {
  it('calcule les dates', () => {
    expect(plusJours('2027-02-27', 2)).toBe('2027-03-01')
    expect(departPropose(5, new Date('2026-11-08T10:00:00Z'))).toBe('2027-05-15')
    expect(departPropose(12, new Date('2026-11-08T10:00:00Z'))).toBe('2026-12-15')
    expect(departPropose(null, new Date('2026-11-08T10:00:00Z'))).toBe('2026-12-08')
  })

  it('répartit les nuits entre les étapes', () => {
    expect(sejours(it2, '2027-05-12', 3)).toEqual([
      { ville: 'Tokyo', arrivee: '2027-05-12', depart: '2027-05-14' },
      { ville: 'Kyoto', arrivee: '2027-05-14', depart: '2027-05-15' },
    ])
  })

  it('préremplit les liens', () => {
    const b = new URL(lienBooking({ ville: 'Kyoto', pays: 'Japon', arrivee: '2027-05-14', depart: '2027-05-15', adultes: 3 }))
    expect(b.searchParams.get('ss')).toBe('Kyoto, Japon')
    expect(b.searchParams.get('checkin')).toBe('2027-05-14')
    expect(b.searchParams.get('group_adults')).toBe('3')
    const v = decodeURIComponent(lienVols({ depuis: 'Paris', vers: 'Tokyo', aller: '2027-05-12', retour: '2027-05-15' }))
    expect(v).toContain('Flights from Paris to Tokyo on 2027-05-12 through 2027-05-15')
  })

  it('liste vol, hébergements, activités et tables sans doublon', () => {
    const items = aReserver({ it: it2, pays: 'Japon', depuis: 'Paris', aller: '2027-05-12', jours: 3 })
    expect(items.map((i) => i.cle)).toEqual([
      'vol',
      'hotel|Tokyo',
      'hotel|Kyoto',
      'act|Senso-ji',
      'resto|Ichiran',
      'act|teamLab',
      'act|Fushimi Inari',
    ])
    expect(items[1].detail).toContain('2 nuits')
  })

  it('propose le train pour un pays proche et rien sans pays d’origine', () => {
    const train = aReserver({ it: it2, pays: 'Japon', depuis: 'Paris', aller: '2027-05-12', jours: 3, avion: false })
    expect(train[0].titre).toMatch(/^Train/)
    expect(aReserver({ it: it2, pays: 'Japon', depuis: '', aller: '2027-05-12', jours: 3 })[0].cle).toBe('hotel|Tokyo')
  })
})
