import { describe, expect, it } from 'vitest'
import {
  distanceKm,
  formatDuration,
  formatOffset,
  formatPopulation,
  guessHome,
  languesOf,
  monnaieOf,
  offsetMinutes,
  pointOf,
  progress,
  trip,
  zoneRange,
} from './info.js'

const hiver = new Date('2026-01-15T12:00:00Z')
const ete = new Date('2026-07-15T12:00:00Z')

describe('trajet', () => {
  it('mesure Paris → New York à environ 5 840 km', () => {
    expect(distanceKm(pointOf('FR'), pointOf('US'))).toBeGreaterThan(6100) // Washington, un peu plus loin
    expect(distanceKm([48.8566, 2.3522], [40.7128, -74.006])).toBeCloseTo(5837, -1)
  })

  it('estime un vol Paris → Tokyo autour de 12 h', () => {
    const t = trip('FR', 'JP', hiver)
    expect(t.flight).toBeGreaterThan(11)
    expect(t.flight).toBeLessThan(13)
    expect(t.drive).toBeNull()
  })

  it('propose la voiture pour un pays voisin', () => {
    const t = trip('FR', 'BE', hiver)
    expect(t.drive).toBeGreaterThan(3)
    expect(t.drive).toBeLessThan(6)
  })

  it('ne calcule pas de trajet vers son propre pays', () => {
    expect(trip('FR', 'FR', hiver)).toMatchObject({ km: null, offset: 0 })
  })

  it('arrondit les durées au quart d’heure', () => {
    expect(formatDuration(12.1)).toBe('12 h 00'.replace(' 00', ''))
    expect(formatDuration(1.6)).toBe('1 h 30')
    expect(formatDuration(0.3)).toBe('15 min')
  })
})

describe('décalage horaire', () => {
  it('tient compte de l’heure d’été', () => {
    expect(offsetMinutes('Europe/Paris', hiver)).toBe(60)
    expect(offsetMinutes('Europe/Paris', ete)).toBe(120)
  })

  it('donne Tokyo à +8 h de Paris en hiver et +7 h en été', () => {
    expect(trip('FR', 'JP', hiver).offset).toBe(8 * 60)
    expect(trip('FR', 'JP', ete).offset).toBe(7 * 60)
  })

  it('gère les demi-heures (Inde)', () => {
    expect(trip('FR', 'IN', hiver).offset).toBe(4 * 60 + 30)
    expect(formatOffset(270)).toBe('+4 h 30')
    expect(formatOffset(-360)).toBe('−6 h')
    expect(formatOffset(0)).toBe('même heure')
  })

  it('compte les fuseaux des grands pays', () => {
    const us = zoneRange('US', 'FR', hiver)
    expect(us.count).toBeGreaterThanOrEqual(6)
    expect(us.max).toBe(-6 * 60) // côte Est, 6 h de moins que Paris
    expect(us.min).toBeLessThanOrEqual(-11 * 60) // Hawaï
    expect(zoneRange('FR', 'FR', hiver)).toMatchObject({ count: 1, min: 0 })
  })
})

describe('infos et progression', () => {
  it('donne langues et monnaie en français', () => {
    expect(languesOf('JP')).toEqual(['Japonais'])
    expect(monnaieOf('FR')).toBe('Euro (EUR)')
  })

  it('formate la population', () => {
    expect(formatPopulation(64768389)).toBe('65 millions')
    expect(formatPopulation(1330044000)).toBe('1,3 milliard')
  })

  it('compte 195 pays répartis par continent', () => {
    const p = progress(['FR', 'IT', 'JP', 'GI'])
    expect(p.total).toBe(195)
    expect(p.done).toBe(3) // Gibraltar n'est pas un pays
    expect(p.list.find((r) => r.id === 'EU').done).toBe(2)
  })

  it('devine le pays à partir de la langue du téléphone', () => {
    expect(guessHome(['fr-FR', 'en'])).toBe('FR')
    expect(guessHome(['fr'])).toBeNull()
  })
})
