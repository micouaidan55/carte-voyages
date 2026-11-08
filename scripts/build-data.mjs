// Construit src/data/pays.json à partir de données publiques (GeoNames, mledoze/countries).
// À relancer seulement pour rafraîchir les données : npm run data
import { writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const db = require('countries-db')
const cities = require('all-the-cities')
const world = require('world-countries')

// Fuseau de la capitale pour les pays qui en ont plusieurs.
const FUSEAU_CAPITALE = {
  AU: 'Australia/Sydney', BR: 'America/Sao_Paulo', CA: 'America/Toronto', CD: 'Africa/Kinshasa',
  CL: 'America/Santiago', CN: 'Asia/Shanghai', EC: 'America/Guayaquil', ES: 'Europe/Madrid',
  FM: 'Pacific/Pohnpei', GL: 'America/Nuuk', ID: 'Asia/Jakarta', KI: 'Pacific/Tarawa',
  MN: 'Asia/Ulaanbaatar', MX: 'America/Mexico_City', NZ: 'Pacific/Auckland', PF: 'Pacific/Tahiti',
  PG: 'Pacific/Port_Moresby', PT: 'Europe/Lisbon', RU: 'Europe/Moscow', UA: 'Europe/Kiev',
  US: 'America/New_York', KZ: 'Asia/Almaty', AQ: null, UM: null,
}

// Capitales absentes ou mal repérées dans GeoNames.
const CAPITALE_MANUELLE = {
  IL: ['Jérusalem', 31.7683, 35.2137],
  PS: ['Ramallah', 31.9038, 35.2034],
  EH: ['Laâyoune', 27.1536, -13.2033],
}

// Noms français des capitales les plus connues (GeoNames donne le nom local ou anglais).
const NOM_FR = {
  London: 'Londres', Beijing: 'Pékin', Moscow: 'Moscou', Warsaw: 'Varsovie', Lisbon: 'Lisbonne',
  Brussels: 'Bruxelles', Vienna: 'Vienne', Prague: 'Prague', Copenhagen: 'Copenhague', Athens: 'Athènes',
  Cairo: 'Le Caire', Algiers: 'Alger', Rome: 'Rome', Berlin: 'Berlin', Bucharest: 'Bucarest',
  Budapest: 'Budapest', Belgrade: 'Belgrade', Sofia: 'Sofia', Stockholm: 'Stockholm', Helsinki: 'Helsinki',
  Reykjavik: 'Reykjavik', Dublin: 'Dublin', Bern: 'Berne', Luxembourg: 'Luxembourg', Valletta: 'La Valette',
  Nicosia: 'Nicosie', Ankara: 'Ankara', Tbilisi: 'Tbilissi', Yerevan: 'Erevan', Baku: 'Bakou',
  Kyiv: 'Kiev', Minsk: 'Minsk', Vilnius: 'Vilnius', Riga: 'Riga', Tallinn: 'Tallinn',
  Chisinau: 'Chișinău', Ljubljana: 'Ljubljana', Zagreb: 'Zagreb', Sarajevo: 'Sarajevo', Podgorica: 'Podgorica',
  Skopje: 'Skopje', Tirana: 'Tirana', Pristina: 'Pristina', 'Vatican City': 'Vatican',
  Tokyo: 'Tokyo', Seoul: 'Séoul', Pyongyang: 'Pyongyang', 'New Delhi': 'New Delhi', Bangkok: 'Bangkok',
  Hanoi: 'Hanoï', Singapore: 'Singapour', 'Kuala Lumpur': 'Kuala Lumpur', Manila: 'Manille',
  Jakarta: 'Jakarta', Taipei: 'Taipei', Tehran: 'Téhéran', Baghdad: 'Bagdad', Damascus: 'Damas',
  Beirut: 'Beyrouth', Amman: 'Amman', Riyadh: 'Riyad', 'Abu Dhabi': 'Abou Dabi', Doha: 'Doha',
  Kuwait: 'Koweït', Muscat: 'Mascate', "Sanaa": 'Sanaa', Kabul: 'Kaboul', Islamabad: 'Islamabad',
  Kathmandu: 'Katmandou', Dhaka: 'Dacca', Colombo: 'Colombo', Tashkent: 'Tachkent', Astana: 'Astana',
  'Mexico City': 'Mexico', Washington: 'Washington', Havana: 'La Havane', 'Panama City': 'Panama',
  'Guatemala City': 'Guatemala', 'Port-au-Prince': 'Port-au-Prince', 'Santo Domingo': 'Saint-Domingue',
  Brasília: 'Brasilia', 'Buenos Aires': 'Buenos Aires', Lima: 'Lima', Bogotá: 'Bogota', Santiago: 'Santiago',
  Montevideo: 'Montevideo', Asunción: 'Asuncion', Quito: 'Quito', Caracas: 'Caracas',
  Rabat: 'Rabat', Tunis: 'Tunis', Tripoli: 'Tripoli', Khartoum: 'Khartoum', 'Addis Ababa': 'Addis-Abeba',
  Nairobi: 'Nairobi', Pretoria: 'Pretoria', 'Cape Town': 'Le Cap', Dakar: 'Dakar', Abidjan: 'Abidjan',
  Yamoussoukro: 'Yamoussoukro', Bamako: 'Bamako', Algiers: 'Alger', Antananarivo: 'Antananarivo',
  Canberra: 'Canberra', Wellington: 'Wellington', Ottawa: 'Ottawa', Mogadishu: 'Mogadiscio',
  Ulaanbaatar: 'Oulan-Bator', 'Ulan Bator': 'Oulan-Bator', Jerusalem: 'Jérusalem', 'Kuwait City': 'Koweït',
}

const capitals = {}
for (const c of cities) {
  if (c.featureCode !== 'PPLC') continue
  if (!capitals[c.country] || c.population > capitals[c.country].population) capitals[c.country] = c
}

const onu = new Set(world.filter((w) => w.unMember).map((w) => w.cca2))
onu.add('VA') // États observateurs, comptés comme des pays
onu.add('PS')

const canon = (z) => {
  try {
    return new Intl.DateTimeFormat('en', { timeZone: z }).resolvedOptions().timeZone
  } catch {
    return null
  }
}

const out = {}
for (const c of Object.values(db.getAllCountries())) {
  const id = c.id
  let capitale = null
  if (CAPITALE_MANUELLE[id]) {
    const [nom, lat, lon] = CAPITALE_MANUELLE[id]
    capitale = { nom, lat, lon }
  } else if (capitals[id]) {
    const { name, loc } = capitals[id]
    capitale = { nom: NOM_FR[name] ?? name, lat: loc.coordinates[1], lon: loc.coordinates[0] }
  }
  const zones = [...new Set((c.timezones ?? []).map(canon).filter(Boolean))]
  out[id] = {
    capitale,
    centre: [c.coordinates.latitude, c.coordinates.longitude],
    fuseaux: zones,
    fuseauCapitale: id in FUSEAU_CAPITALE ? canon(FUSEAU_CAPITALE[id] ?? '') : (zones[0] ?? null),
    population: c.population || null,
    superficie: c.areaSqKm || null,
    monnaie: c.currencyCode || null,
    langues: (c.languages ?? []).filter((l) => /^[a-z]{2,3}$/.test(l)).slice(0, 4),
    indicatif: c.phoneCode ? (c.phoneCode.startsWith('+') ? c.phoneCode : '+' + c.phoneCode) : null,
    continent: c.continentId,
    voisins: c.neighborCountryIds ?? [],
    pays: onu.has(id),
  }
}

// Kosovo : absent de GeoNames comme pays.
out.XK ??= {
  capitale: { nom: 'Pristina', lat: 42.6629, lon: 21.1655 },
  centre: [42.6, 20.9],
  fuseaux: ['Europe/Belgrade'],
  fuseauCapitale: 'Europe/Belgrade',
  population: 1800000,
  superficie: 10887,
  monnaie: 'EUR',
  langues: ['sq', 'sr'],
  indicatif: '+383',
  continent: 'EU',
  voisins: ['AL', 'MK', 'ME', 'RS'],
  pays: false,
}

writeFileSync('src/data/pays.json', JSON.stringify(out))

// Villes de plus de 20 000 habitants (et toutes les capitales), chargées à la demande.
const VILLE_FR = {
  ...NOM_FR,
  Venice: 'Venise', Naples: 'Naples', Milan: 'Milan', Turin: 'Turin', Genoa: 'Gênes', Florence: 'Florence',
  Seville: 'Séville', Cordoba: 'Cordoue', Saragossa: 'Saragosse', Marrakesh: 'Marrakech', Fes: 'Fès',
  Munich: 'Munich', Cologne: 'Cologne', Hamburg: 'Hambourg', Nuremberg: 'Nuremberg', Aachen: 'Aix-la-Chapelle',
  Antwerp: 'Anvers', Ghent: 'Gand', Bruges: 'Bruges', 'The Hague': 'La Haye', Geneva: 'Genève', Basel: 'Bâle',
  Zurich: 'Zurich', 'Saint Petersburg': 'Saint-Pétersbourg', Krakow: 'Cracovie', Gdansk: 'Gdańsk',
  Thessaloniki: 'Thessalonique', Istanbul: 'Istanbul', Edinburgh: 'Édimbourg', 'New York City': 'New York',
  'New Orleans': 'La Nouvelle-Orléans', Philadelphia: 'Philadelphie', Montreal: 'Montréal', Quebec: 'Québec',
  'Cape Town': 'Le Cap', Alexandria: 'Alexandrie', Mecca: 'La Mecque', Shanghai: 'Shanghai', Canton: 'Canton',
  Guangzhou: 'Canton', 'Ho Chi Minh City': 'Hô Chi Minh-Ville', Bombay: 'Bombay', Mumbai: 'Bombay',
  Calcutta: 'Calcutta', Kolkata: 'Calcutta', Tangier: 'Tanger', Bucharest: 'Bucarest',
}
const villes = cities
  .filter((c) => c.population >= 20000 || c.featureCode === 'PPLC')
  .sort((a, b) => b.population - a.population)
  .map((c) => {
    const nom = VILLE_FR[c.name] ?? c.name
    const row = [nom, c.country, +c.loc.coordinates[1].toFixed(3), +c.loc.coordinates[0].toFixed(3), Math.round(c.population / 1000)]
    if (nom !== c.name) row.push(c.name)
    return row
  })
writeFileSync('src/data/villes.json', JSON.stringify(villes))
console.log(villes.length, 'villes')
console.log(Object.keys(out).length, 'pays,', [...onu].filter((c) => out[c]).length, 'États reconnus')
