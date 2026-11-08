import isoCountries from 'i18n-iso-countries'

// Correspondance des formes de la carte sans code ISO.
const SANS_CODE = {
  Kosovo: 'XK',
  Somaliland: 'SO',
  'N. Cyprus': 'CY',
  'Indian Ocean Ter.': 'AU',
}

// Autres façons courantes de chercher un pays.
const ALIAS = {
  US: ['usa', 'amerique', 'etats unis d amerique'],
  GB: ['angleterre', 'ecosse', 'pays de galles', 'irlande du nord', 'uk', 'grande bretagne'],
  NL: ['hollande'],
  CZ: ['republique tcheque'],
  MM: ['birmanie'],
  CD: ['rdc', 'republique democratique du congo', 'zaire'],
  CG: ['congo'],
  CI: ['cote d ivoire'],
  VA: ['vatican'],
  PS: ['palestine'],
  KR: ['coree'],
  AE: ['emirats', 'dubai'],
  SZ: ['swaziland'],
  MK: ['macedoine'],
  TR: ['turquie', 'turkiye'],
  BA: ['bosnie'],
  CV: ['cap vert'],
  LK: ['ceylan'],
  IR: ['perse'],
  TL: ['timor'],
  DO: ['republique dominicaine'],
}

const nomsFr = new Intl.DisplayNames(['fr'], { type: 'region' })
const nomsEn = new Intl.DisplayNames(['en'], { type: 'region' })

export function codeForFeature(feature) {
  if (feature.id) {
    const code = isoCountries.numericToAlpha2(feature.id)
    if (code) return code
  }
  return SANS_CODE[feature.properties?.name] ?? null
}

export function nameOf(code) {
  const nom = nomsFr.of(code)
  if (code === 'VA') return 'Vatican'
  if (code === 'MM') return 'Birmanie (Myanmar)'
  return nom && nom !== code ? nom : code
}

export function flagOf(code) {
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
}

export function normalize(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export const ALL_CODES = [...Object.keys(isoCountries.getAlpha2Codes()), 'XK'].filter(
  (code, i, all) => all.indexOf(code) === i,
)

export function buildIndex(codes = ALL_CODES) {
  return codes
    .map((code) => {
      const name = nameOf(code)
      const termes = [name, nomsEn.of(code) ?? '', ...(ALIAS[code] ?? [])].map(normalize)
      return { code, name, flag: flagOf(code), termes }
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
}

// Classement : début du nom, puis début d'un mot, puis n'importe où.
export function search(index, query, limit = 8) {
  const q = normalize(query)
  if (!q) return []
  const scored = []
  for (const entry of index) {
    let best = Infinity
    for (const terme of entry.termes) {
      if (terme.startsWith(q)) best = Math.min(best, 0)
      else if ((' ' + terme).includes(' ' + q)) best = Math.min(best, 1)
      else if (terme.includes(q)) best = Math.min(best, 2)
    }
    if (best < Infinity) scored.push({ entry, best })
  }
  scored.sort((a, b) => a.best - b.best || a.entry.name.localeCompare(b.entry.name, 'fr'))
  return scored.slice(0, limit).map((s) => s.entry)
}
