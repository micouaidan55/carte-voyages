// Image de la carte à partager (format portrait 1080 × 1350, idéal pour les réseaux).
import { geoNaturalEarth1, geoPath } from 'd3-geo'

const W = 1080
const H = 1350

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

const POLICE = '-apple-system, BlinkMacSystemFont, Helvetica Neue, Helvetica, Arial, sans-serif'

// Construit le SVG de l'affiche. couleurs : { fond, ocean, terre, bord, visite, envie, texte, doux }
export function afficheSvg({ shapes, villes = [], visited, wish, couleurs: c, titre, sousTitre, lignes }) {
  const projection = geoNaturalEarth1().fitExtent(
    [
      [50, 360],
      [W - 50, 960],
    ],
    { type: 'Sphere' },
  )
  const path = geoPath(projection)
  const pays = shapes
    .map(({ f, code }) => {
      const fill = code && visited.has(code) ? c.visite : code && wish.has(code) ? c.envie : c.terre
      const d = path(f)
      return d ? `<path d="${d}" fill="${fill}"/>` : ''
    })
    .join('')
  const points = villes
    .map((v) => {
      const p = projection([v.lon, v.lat])
      return p ? `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="4.5" fill="${c.fond}" stroke="${c.texte}" stroke-width="2"/>` : ''
    })
    .join('')
  const bas = lignes
    .map(
      (l, i) =>
        `<text x="${W / 2}" y="${1080 + i * 52}" text-anchor="middle" font-size="34" fill="${c.texte}">${esc(l)}</text>`,
    )
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${POLICE}">
  <rect width="${W}" height="${H}" fill="${c.fond}"/>
  <text x="${W / 2}" y="190" text-anchor="middle" font-size="150" font-weight="800" fill="${c.visite}">${esc(titre)}</text>
  <text x="${W / 2}" y="270" text-anchor="middle" font-size="46" font-weight="600" fill="${c.texte}">${esc(sousTitre)}</text>
  <path d="${path({ type: 'Sphere' })}" fill="${c.ocean}"/>
  <g stroke="${c.bord}" stroke-width="0.7" stroke-linejoin="round">${pays}</g>
  <g>${points}</g>
  ${bas}
  <text x="${W / 2}" y="${H - 60}" text-anchor="middle" font-size="28" fill="${c.doux}">Mes pays · ma carte du monde</text>
</svg>`
}

// Transforme le SVG en image PNG.
export async function svgEnPng(svg) {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    canvas.getContext('2d').drawImage(img, 0, 0, W, H)
    return await new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Image impossible'))), 'image/png'),
    )
  } finally {
    URL.revokeObjectURL(url)
  }
}
