import { describe, expect, it } from 'vitest'
import { aFaireMaintenant, compteARebours, echeance, icsVoyage, jourEnCours, joursAvant } from './rappels.js'
import { genererValise } from './valise.js'

describe('dates limites', () => {
  it('connaît le délai de chaque démarche proposée', () => {
    const avant = genererValise({ code: 'US', home: 'FR', bebe: true, enfants: true }).filter((i) => i.g === 'avant')
    for (const i of avant) expect(joursAvant(i.t), i.t).not.toBeNull()
  })

  it('classe les démarches selon la date', () => {
    const medecin = { t: 'Voir le médecin un mois avant (vaccins, traitements)', ok: false }
    expect(echeance(medecin, '2027-05-15', '2027-03-01')).toMatchObject({ date: '2027-04-15', etat: 'plus-tard' })
    expect(echeance(medecin, '2027-05-15', '2027-04-13').etat).toBe('urgent')
    expect(echeance(medecin, '2027-05-15', '2027-05-01').etat).toBe('retard')
    expect(echeance({ ...medecin, ok: true }, '2027-05-15', '2027-05-01').etat).toBe('fait')
    expect(echeance({ t: 'Pyjama' }, '2027-05-15', '2027-05-01')).toBeNull()
    const items = [medecin, { t: 'Peser la valise', ok: false }]
    expect(aFaireMaintenant(items, '2027-05-15', '2027-05-01')).toEqual([medecin])
  })

  it('compte les jours avant le départ', () => {
    expect(compteARebours('2027-05-15', '2027-05-20', '2027-05-03')).toBe('Départ dans 12 jours')
    expect(compteARebours('2027-05-15', '2027-05-20', '2027-05-14')).toBe('Départ demain')
    expect(compteARebours('2027-05-15', '2027-05-20', '2027-05-17')).toBe('Bon voyage !')
    expect(compteARebours('2027-05-15', '2027-05-20', '2027-06-01')).toBe('Voyage terminé')
  })
})

describe('calendrier', () => {
  const ics = icsVoyage({
    id: 'abc',
    titre: 'Tokyo · 5 jours',
    lieu: 'Japon',
    depart: '2027-05-12',
    retour: '2027-05-17',
    vols: [{ numero: 'AF276', compagnie: 'Air France', depart_code: 'CDG', arrivee_code: 'HND', depart_date: '2027-05-12', depart_heure: '10:25', arrivee_date: '2027-05-13', arrivee_heure: '06:05', reference: 'ABC123' }],
    rappels: [{ t: 'Voir le médecin; vaccins, rappel', date: '2027-04-12' }],
    now: new Date('2026-11-08T10:00:00Z'),
  })

  it('produit un fichier valide', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics.endsWith('END:VCALENDAR')).toBe(true)
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(3)
    expect(ics).toContain('DTSTART;VALUE=DATE:20270512')
    expect(ics).toContain('DTEND;VALUE=DATE:20270518')
    expect(ics).toContain('DTSTART:20270512T102500')
    expect(ics).toContain('DTEND:20270513T060500')
    expect(ics).toContain('SUMMARY:À faire : Voir le médecin\\; vaccins\\, rappel')
  })

  it('plie les lignes trop longues', () => {
    for (const l of ics.split('\r\n')) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75)
  })
})

describe('jour en cours pendant le voyage', () => {
  it('donne le numéro du jour seulement pendant le séjour', () => {
    expect(jourEnCours('2027-05-12', 5, '2027-05-11')).toBeNull()
    expect(jourEnCours('2027-05-12', 5, '2027-05-12')).toBe(0)
    expect(jourEnCours('2027-05-12', 5, '2027-05-14')).toBe(2)
    expect(jourEnCours('2027-05-12', 5, '2027-05-16')).toBe(4)
    expect(jourEnCours('2027-05-12', 5, '2027-05-17')).toBeNull()
    expect(jourEnCours(null, 5, '2027-05-12')).toBeNull()
  })
})
