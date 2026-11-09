import './style.css'
import { geoArea, geoGraticule10, geoNaturalEarth1, geoPath } from 'd3-geo'
import { select } from 'd3-selection'
import { zoom, zoomIdentity } from 'd3-zoom'
import 'd3-transition'
import { feature } from 'topojson-client'
import world from 'world-atlas/countries-50m.json'
import { buildIndex, codeForFeature, flagOf, nameOf, search } from './countries.js'
import {
  CONTINENTS,
  PAYS,
  formatDuration,
  formatKm,
  formatOffset,
  formatPopulation,
  guessHome,
  languesOf,
  localTime,
  monnaieOf,
  progress,
  trip,
  zoneRange,
} from './info.js'
import { createStore, villeKey } from './store.js'
import { loadVilles, searchVilles } from './villes.js'
import { PARTIES, fusionnerValise, genererValise, progression } from './valise.js'
import { SOURCE, formatTaux, getTaux } from './taux.js'
import { afficheSvg, svgEnPng } from './affiche.js'
import { aReserver, departPropose, plusJours } from './reserver.js'
import { CATEGORIES, bilan, equilibre, formatArgent, lireMontant, nouvelleDepense } from './depenses.js'
import { ajouterActivite, ajouterJour, ajouterRestaurant, modifierJour, retirerElement, retirerJour } from './plan.js'
import { CLE_LIEN, decoderVoyage, encoderVoyage, fusionnerVoyage, nettoyerVoyage } from './invitation.js'
import { aFaireMaintenant, aujourdhui, compteARebours, echeance, icsVoyage } from './rappels.js'
import {
  API_PAR_DEFAUT,
  ENVIES,
  createTrips,
  demanderItineraire,
  itineraireHtml,
  itineraireVide,
  fusionnerTrajets,
  lireReservation,
  trajetsHtml,
  reveiller,
} from './voyage.js'

const trips = createTrips()

const store = createStore()
const index = buildIndex()
const $ = (id) => document.getElementById(id)
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const label = (code) => `${flagOf(code)} ${nameOf(code)}`

if (!store.home) {
  const guess = guessHome()
  if (guess) store.setHome(guess)
}

// ---------- Carte ----------

const shapes = feature(world, world.objects.countries).features.map((f) => ({ f, code: codeForFeature(f) }))
const svg = select('#map')
const projection = geoNaturalEarth1()
const path = geoPath(projection)
const root = svg.append('g')
const sphere = root.append('path').attr('class', 'sphere').datum({ type: 'Sphere' })
const graticule = root.append('path').attr('class', 'graticule').datum(geoGraticule10())
const countries = root
  .append('g')
  .selectAll('path')
  .data(shapes)
  .join('path')
  .attr('class', (d) => (d.code ? 'country' : 'country inert'))

const areaByCode = new Map()
let totalArea = 0
for (const { f, code } of shapes) {
  const a = geoArea(f)
  totalArea += a
  if (code) areaByCode.set(code, (areaByCode.get(code) ?? 0) + a)
}

let width = 0
let height = 0
const cityLayer = root.append('g').attr('class', 'cities')
let zoomK = 1

function paintCities() {
  cityLayer
    .selectAll('circle')
    .data(store.villes.list(), villeKey)
    .join('circle')
    .attr('cx', (v) => projection([v.lon, v.lat])[0])
    .attr('cy', (v) => projection([v.lon, v.lat])[1])
    .attr('r', 3.2 / Math.sqrt(zoomK))
    .attr('stroke-width', 1.2 / Math.sqrt(zoomK))
}

const zoomer = zoom().on('zoom', (event) => {
  root.attr('transform', event.transform)
  zoomK = event.transform.k
  cityLayer.selectAll('circle').attr('r', 3.2 / Math.sqrt(zoomK)).attr('stroke-width', 1.2 / Math.sqrt(zoomK))
  svg.classed('zoomed', event.transform.k > 4)
})
svg.call(zoomer).on('dblclick.zoom', null)

function layout() {
  width = window.innerWidth
  height = window.innerHeight
  svg.attr('viewBox', `0 0 ${width} ${height}`)
  const top = 76
  const bottom = height - 84
  const free = bottom - top
  // En portrait, le monde entier serait minuscule : on l'agrandit et on fait glisser la carte.
  const fitWidth = width - 16
  const mapWidth = width < height ? Math.min(fitWidth * 2, free * 0.62 * 1.95) : Math.min(fitWidth, free * 1.95)
  const mapHeight = mapWidth / 1.95
  const x0 = (width - mapWidth) / 2
  const y0 = top + (free - mapHeight) / 2
  projection.fitExtent(
    [
      [x0, y0],
      [x0 + mapWidth, y0 + mapHeight],
    ],
    { type: 'Sphere' },
  )
  sphere.attr('d', path)
  graticule.attr('d', path)
  countries.attr('d', (d) => path(d.f))
  paintCities()
  zoomer.scaleExtent([Math.min(1, fitWidth / mapWidth), 60]).translateExtent([
    [Math.min(0, x0) - 8, top - height * 0.3],
    [Math.max(width, x0 + mapWidth) + 8, bottom + height * 0.3],
  ])
}

function paint() {
  paintCities()
  countries
    .classed('visited', (d) => d.code && store.visited.has(d.code))
    .classed('wish', (d) => d.code && store.wish.has(d.code))
    .classed('home', (d) => d.code && d.code === store.home)
    .classed('selected', (d) => d.code && d.code === selected)
}

function flash(code) {
  countries
    .filter((d) => d.code === code)
    .classed('pop', false)
    .each(function () {
      void this.getBoundingClientRect()
    })
    .classed('pop', true)
}

function mainPart(f) {
  if (f.geometry.type !== 'MultiPolygon') return f
  let best = null
  let bestArea = -1
  for (const coordinates of f.geometry.coordinates) {
    const part = { type: 'Polygon', coordinates }
    const a = geoArea(part)
    if (a > bestArea) [best, bestArea] = [part, a]
  }
  return best
}

// Centre le pays dans la partie de l'écran qui reste visible.
function focus(code) {
  const shape = shapes.find((s) => s.code === code)
  if (!shape) return false
  const [[x0, y0], [x1, y1]] = path.bounds(mainPart(shape.f))
  const visibleTop = 80
  let visibleBottom = (window.visualViewport?.height ?? height) - 120
  if (!$('fiche').hidden) visibleBottom = Math.min(visibleBottom, $('fiche').getBoundingClientRect().top - 12)
  const visibleHeight = Math.max(120, visibleBottom - visibleTop)
  const k = Math.max(0.8, Math.min(8, 0.35 / Math.max((x1 - x0) / width, (y1 - y0) / visibleHeight)))
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  svg
    .transition()
    .duration(600)
    .call(zoomer.transform, zoomIdentity.translate(width / 2 - k * cx, visibleTop + visibleHeight / 2 - k * cy).scale(k))
  return true
}

function focusPoint(v, k = 6) {
  const [x, y] = projection([v.lon, v.lat])
  const visibleTop = 80
  const visibleHeight = (window.visualViewport?.height ?? height) - visibleTop - 120
  svg
    .transition()
    .duration(600)
    .call(zoomer.transform, zoomIdentity.translate(width / 2 - k * x, visibleTop + visibleHeight / 2 - k * y).scale(k))
}

countries.on('click', (event, d) => {
  if (d.code) openFiche(d.code)
})
sphere.on('click', () => closeFiche())

$('btn-reset').addEventListener('click', () => {
  svg.transition().duration(500).call(zoomer.transform, zoomIdentity)
})

// ---------- Messages et annulation ----------

let toastTimer
let undoAction = null
function toast(text, undo = null) {
  $('toast-text').textContent = text
  undoAction = undo
  $('toast-undo').hidden = !undo
  $('toast').hidden = false
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => ($('toast').hidden = true), 4000)
}

$('toast-undo').addEventListener('click', () => {
  undoAction?.()
  undoAction = null
  $('toast').hidden = true
})

function addVisited(code) {
  const wasWish = store.wish.has(code)
  if (!store.visited.add(code)) return
  flash(code)
  toast(`Ajouté : ${label(code)}`, () => {
    store.visited.remove(code)
    if (wasWish) store.wish.add(code)
  })
}

function removeVisited(code) {
  const addedAt = store.visited.remove(code)
  if (addedAt === null) return
  toast(`Retiré : ${label(code)}`, () => store.visited.add(code, addedAt))
}

// ---------- Fiche d'un pays ----------

let selected = null
let clock = null

function openFiche(code) {
  selected = code
  closeSearch()
  renderFiche()
  const fiche = $('fiche')
  const wasHidden = fiche.hidden
  fiche.hidden = false
  document.body.classList.add('fiche-open')
  $('fiche').querySelector('.fiche-body').scrollTop = 0
  paint()
  requestAnimationFrame(() => {
    fiche.classList.add('open')
    setTimeout(() => focus(code), wasHidden ? 260 : 0)
  })
  clearInterval(clock)
  clock = setInterval(renderTrip, 20000)
}

function closeFiche() {
  if (!selected) return
  selected = null
  clearInterval(clock)
  const fiche = $('fiche')
  fiche.classList.remove('open')
  document.body.classList.remove('fiche-open')
  setTimeout(() => {
    if (!selected) fiche.hidden = true
  }, 260)
  paint()
}

$('f-close').addEventListener('click', closeFiche)

function renderFiche() {
  const code = selected
  const p = PAYS[code]
  $('f-flag').textContent = flagOf(code)
  $('f-name').textContent = nameOf(code)
  const sub = [p && CONTINENTS[p.continent], p?.capitale && `capitale ${p.capitale.nom}`].filter(Boolean)
  $('f-sub').textContent = sub.join(' · ')

  const visited = store.visited.has(code)
  const wish = store.wish.has(code)
  const bv = $('f-visited')
  bv.setAttribute('aria-pressed', visited)
  bv.innerHTML = visited ? '<span aria-hidden="true">✓</span> Visité' : '<span aria-hidden="true">＋</span> J’y suis allé'
  const bw = $('f-wish')
  bw.setAttribute('aria-pressed', wish)
  bw.hidden = visited
  bw.innerHTML = wish ? '<span aria-hidden="true">★</span> Dans mes envies' : '<span aria-hidden="true">☆</span> J’ai envie d’y aller'

  renderMemory()
  renderCities()
  renderTrip()

  const facts = []
  const fact = (dt, dd) => dd && facts.push(`<div><dt>${dt}</dt><dd>${esc(dd)}</dd></div>`)
  fact('Capitale', p?.capitale?.nom)
  const langs = languesOf(code)
  fact(langs.length > 1 ? 'Langues' : 'Langue', langs.join(', '))
  const monnaie = monnaieOf(code)
  if (monnaie) facts.push(`<div class="wide"><dt>Monnaie</dt><dd>${esc(monnaie)}<span id="f-rate" class="rate"></span></dd></div>`)
  fact('Population', formatPopulation(p?.population))
  fact('Superficie', p?.superficie && `${Math.round(p.superficie).toLocaleString('fr-FR')} km²`)
  fact('Indicatif', p?.indicatif)
  $('f-facts').innerHTML = facts.join('') || '<div><dd>Pas d’informations pour ce territoire.</dd></div>'
  renderRate(code)

  const voisins = (p?.voisins ?? []).filter((c) => PAYS[c]).sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'fr'))
  $('f-neighbours-box').hidden = voisins.length === 0
  $('f-neighbours').replaceChildren(
    ...voisins.map((c) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'pill' + (store.visited.has(c) ? ' done' : store.wish.has(c) ? ' wished' : '')
      b.textContent = label(c)
      b.addEventListener('click', () => openFiche(c))
      return b
    }),
  )
}

// ---------- Souvenirs ----------

{
  const year = new Date().getFullYear()
  $('f-year').append(new Option('Je ne sais plus', ''))
  for (let y = year; y >= 1950; y--) $('f-year').append(new Option(String(y), String(y)))
}

function renderMemory() {
  const code = selected
  const visited = store.visited.has(code)
  $('f-memory').hidden = !visited
  if (!visited) return
  const s = store.souvenir(code)
  $('f-year').value = s.annee ? String(s.annee) : ''
  $('f-heart').setAttribute('aria-pressed', s.coeur)
  $('f-heart').textContent = s.coeur ? '❤️' : '♡'
  // Ne pas écraser ce que l'utilisateur est en train d'écrire.
  if (document.activeElement !== $('f-note')) $('f-note').value = s.texte
}

$('f-year').addEventListener('change', () => {
  store.setSouvenir(selected, { annee: $('f-year').value ? Number($('f-year').value) : null })
})
$('f-heart').addEventListener('click', () => {
  store.setSouvenir(selected, { coeur: !store.souvenir(selected).coeur })
})
{
  let timer
  $('f-note').addEventListener('input', () => {
    const code = selected
    const texte = $('f-note').value
    clearTimeout(timer)
    timer = setTimeout(() => store.setSouvenir(code, { texte }), 400)
  })
  $('f-note').addEventListener('blur', () => {
    clearTimeout(timer)
    if (selected) store.setSouvenir(selected, { texte: $('f-note').value })
  })
}

// ---------- Villes dans la fiche ----------

function renderCities() {
  const code = selected
  const mine = store.villes.of(code)
  $('f-city-list').replaceChildren(
    ...mine.map((v) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'pill done city-pill'
      b.innerHTML = `<span></span><span class="x" aria-hidden="true">✕</span>`
      b.querySelector('span').textContent = v.nom
      b.setAttribute('aria-label', `Retirer ${v.nom}`)
      b.addEventListener('click', () => {
        const old = store.villes.remove(v)
        toast(`Ville retirée : ${v.nom}`, () => old && store.villes.add(old))
      })
      return b
    }),
  )
  $('f-city-empty').hidden = mine.length > 0
  renderCityResults()
}

function renderCityResults() {
  const q = $('f-city-input').value
  const code = selected
  if (q.trim().length < 2) {
    $('f-city-results').replaceChildren()
    return
  }
  loadVilles().then((villes) => {
    if ($('f-city-input').value !== q || selected !== code) return
    const found = searchVilles(villes, q, { cc: code, limit: 5 })
    $('f-city-results').replaceChildren(
      ...(found.length
        ? found.map((v) => {
            const li = document.createElement('li')
            const b = document.createElement('button')
            b.type = 'button'
            b.textContent = `${store.villes.has(v) ? '✓ ' : '＋ '}${v.nom}`
            b.addEventListener('pointerdown', (e) => e.preventDefault()) // garde le clavier ouvert
            b.addEventListener('click', () => {
              addVille({ nom: v.nom, cc: v.cc, lat: v.lat, lon: v.lon })
              $('f-city-input').value = ''
              renderCityResults()
            })
            li.append(b)
            return li
          })
        : [Object.assign(document.createElement('li'), { className: 'none', textContent: 'Aucune ville trouvée' })]),
    )
  })
}

$('f-city-input').addEventListener('input', renderCityResults)
$('f-city-input').addEventListener('focus', () => {
  loadVilles()
  setTimeout(() => $('f-city-input').scrollIntoView({ block: 'center', behavior: 'smooth' }), 350)
})
$('f-city-form').addEventListener('submit', (e) => {
  e.preventDefault()
  $('f-city-results').querySelector('button')?.click()
})

// ---------- Taux de change ----------

async function renderRate(code) {
  const to = PAYS[code]?.monnaie
  const from = (store.home && PAYS[store.home]?.monnaie) || 'EUR'
  if (!to || to === from) return
  const taux = await getTaux(from)
  const el = $('f-rate')
  if (!el || selected !== code || !taux?.rates?.[to]) return
  const texte = formatTaux(taux.rates[to], from, to)
  if (!texte) return
  const jour = new Date(taux.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  el.innerHTML = `<strong>${esc(texte)}</strong><small>Taux du ${esc(jour)} · <a href="${SOURCE.url}" target="_blank" rel="noopener">${SOURCE.nom}</a></small>`
}

function renderTrip() {
  const code = selected
  if (!code) return
  const home = store.home
  const tz = PAYS[code]?.fuseauCapitale
  const rows = []
  const row = (icon, html) => rows.push(`<li><span class="icon" aria-hidden="true">${icon}</span><span>${html}</span></li>`)
  let title

  if (!home) {
    title = '<h3>Trajet et heure</h3>'
    rows.push(
      '<li class="cta"><button id="f-set-home" class="button small" type="button">Indiquer d’où je viens</button></li>',
    )
  } else if (home === code) {
    title = `<h3>C’est chez vous</h3><button class="link" data-action="home" type="button">Changer</button>`
    if (tz) row('🕐', `Il est <strong>${esc(localTime(tz))}</strong>`)
  } else {
    title = `<h3>Depuis ${esc(label(home))}</h3><button class="link" data-action="home" type="button">Changer</button>`
    const t = trip(home, code)
    if (t.flight) row('✈️', `<strong>≈ ${formatDuration(t.flight)}</strong> de vol direct · ${formatKm(t.km)}`)
    if (t.drive) row('🚗', `<strong>≈ ${formatDuration(t.drive)}</strong> en voiture${t.flight ? '' : ' · ' + formatKm(t.km)}`)
    if (tz) {
      const ville = PAYS[code]?.capitale?.nom
      const ecart = t.offset === null ? '' : ` · <strong>${formatOffset(t.offset)}</strong>`
      row('🕐', `Il est ${esc(localTime(tz))}${ville ? ' à ' + esc(ville) : ''}${ecart}`)
    }
    const range = zoneRange(code, home)
    if (range.count > 1) {
      row('🌐', `${range.count} fuseaux horaires dans le pays : de ${formatOffset(range.min)} à ${formatOffset(range.max)}`)
    }
  }
  if (!rows.length) row('ℹ️', 'Pas de trajet calculable pour ce territoire.')
  $('f-trip').innerHTML = `<div class="card-head">${title}</div><ul class="trip">${rows.join('')}</ul>`
  $('f-set-home')?.addEventListener('click', openSettings)
  $('f-trip').querySelector('[data-action="home"]')?.addEventListener('click', openSettings)
}

$('f-visited').addEventListener('click', () => {
  const code = selected
  if (store.visited.has(code)) removeVisited(code)
  else addVisited(code)
})

$('f-wish').addEventListener('click', () => {
  const code = selected
  if (store.wish.has(code)) store.wish.remove(code)
  else store.wish.add(code)
})

// Glisser la fiche vers le bas pour la fermer.
{
  const fiche = $('fiche')
  let startY = null
  let dy = 0
  fiche.querySelector('.fiche-head').addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return
    startY = e.clientY
    dy = 0
    fiche.style.transition = 'none'
    fiche.setPointerCapture(e.pointerId)
  })
  fiche.addEventListener('pointermove', (e) => {
    if (startY === null) return
    dy = Math.max(0, e.clientY - startY)
    fiche.style.transform = `translateY(${dy}px)`
  })
  const end = () => {
    if (startY === null) return
    startY = null
    fiche.style.transition = ''
    fiche.style.transform = ''
    if (dy > 70) closeFiche()
  }
  fiche.addEventListener('pointerup', end)
  fiche.addEventListener('pointercancel', end)
}

// ---------- Compteur ----------

function updateStats() {
  const n = store.visited.size
  $('count').textContent = n
  $('count-label').textContent = n > 1 ? 'pays visités' : 'pays visité'
  const share = store.visited.codes().reduce((sum, c) => sum + (areaByCode.get(c) ?? 0), 0) / totalArea
  const bits = []
  if (n) bits.push(`${formatPercent(share)} des terres`)
  if (store.villes.size) bits.push(`${store.villes.size} ville${store.villes.size > 1 ? 's' : ''}`)
  if (store.wish.size) bits.push(`${store.wish.size} envie${store.wish.size > 1 ? 's' : ''}`)
  $('land').textContent = bits.join(' · ')
  $('hint').hidden = n > 0 || store.wish.size > 0
}

function formatPercent(x) {
  const p = x * 100
  if (p > 0 && p < 0.1) return '< 0,1 %'
  return `${p.toLocaleString('fr-FR', { maximumFractionDigits: p < 10 ? 1 : 0 })} %`
}

// ---------- Recherche (ajout rapide) ----------

const input = $('search')
const results = $('results')
let current = []

function renderResults() {
  current = search(index, input.value)
  $('search-clear').hidden = !input.value
  results.replaceChildren(
    ...current.map((entry, i) => {
      const li = document.createElement('li')
      li.role = 'option'
      li.dataset.code = entry.code
      const done = store.visited.has(entry.code)
      li.className = (done ? 'done' : '') + (i === 0 ? ' first' : '')
      li.innerHTML = `<span class="flag">${entry.flag}</span><span class="name"></span><span class="state">${
        done ? '✓ Visité' : 'Ajouter'
      }</span><button class="info" type="button" aria-label="Voir la fiche">i</button>`
      li.querySelector('.name').textContent = entry.name
      return li
    }),
  )
  if (input.value && !current.length) {
    const li = document.createElement('li')
    li.className = 'none'
    li.textContent = 'Aucun pays ne correspond'
    results.append(li)
  }
  results.hidden = !input.value
  const q = input.value
  if (q.trim().length >= 3) {
    loadVilles().then((villes) => {
      if (input.value !== q) return
      const found = searchVilles(villes, q, { limit: 4 })
      if (!found.length) return
      results.querySelector('.none')?.remove()
      if (!current.length) current = []
      results.append(
        ...found.map((v) => {
          const li = document.createElement('li')
          li.role = 'option'
          li.dataset.ville = JSON.stringify({ nom: v.nom, cc: v.cc, lat: v.lat, lon: v.lon })
          const done = store.villes.has(v)
          li.className = 'city' + (done ? ' done' : '')
          li.innerHTML = `<span class="flag">${flagOf(v.cc)}</span><span class="name"><span></span><small></small></span><span class="state">${
            done ? '✓ Visitée' : 'Ajouter'
          }</span>`
          li.querySelector('.name span').textContent = v.nom
          li.querySelector('.name small').textContent = `Ville · ${nameOf(v.cc)}`
          return li
        }),
      )
      results.hidden = false
    })
  }
}

function addVille(v) {
  if (store.villes.has(v)) {
    toast(`${v.nom} est déjà dans vos villes`)
    return
  }
  const paysAjoute = store.villes.add(v)
  toast(
    paysAjoute ? `Ajouté : ${v.nom} et ${label(v.cc)}` : `Ville ajoutée : ${v.nom}`,
    () => {
      store.villes.remove(v)
      if (paysAjoute) store.visited.remove(v.cc)
    },
  )
}

function closeSearch() {
  input.value = ''
  renderResults()
  input.blur()
}

function choose(code) {
  if (store.visited.has(code)) toast(`${label(code)} est déjà dans votre liste`)
  else addVisited(code)
  focus(code)
  // On vide le champ sans fermer le clavier : on peut enchaîner le pays suivant.
  input.value = ''
  renderResults()
}

input.addEventListener('input', renderResults)
input.addEventListener('focus', closeFiche)
results.addEventListener('pointerdown', (e) => {
  if (!e.target.closest('.info')) e.preventDefault() // garde le clavier ouvert
})
results.addEventListener('click', (e) => {
  const city = e.target.closest('li[data-ville]')
  if (city) {
    const v = JSON.parse(city.dataset.ville)
    addVille(v)
    focusPoint(v)
    input.value = ''
    renderResults()
    return
  }
  const li = e.target.closest('li[data-code]')
  if (!li) return
  if (e.target.closest('.info')) openFiche(li.dataset.code)
  else choose(li.dataset.code)
})
$('search-form').addEventListener('submit', (e) => {
  e.preventDefault()
  if (current[0]) choose(current[0].code)
  else input.blur()
})
$('search-clear').addEventListener('pointerdown', (e) => e.preventDefault())
$('search-clear').addEventListener('click', () => {
  input.value = ''
  renderResults()
  input.focus()
})
input.addEventListener('blur', () => {
  if (!input.value) results.hidden = true
})

function followKeyboard() {
  const vv = window.visualViewport
  if (!vv) return
  const covered = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
  document.documentElement.style.setProperty('--keyboard', `${covered}px`)
  document.body.classList.toggle('typing', covered > 80)
}
window.visualViewport?.addEventListener('resize', followKeyboard)
window.visualViewport?.addEventListener('scroll', followKeyboard)
window.addEventListener('scroll', () => window.scrollTo(0, 0))

// ---------- Feuilles « Ma liste » et « Réglages » ----------

let openModal = null

function showModal(el) {
  closeFiche()
  closeSearch()
  if (openModal && openModal !== el) {
    openModal.classList.remove('open')
    openModal.hidden = true
  }
  openModal = el
  el.hidden = false
  $('sheet-backdrop').hidden = false
  requestAnimationFrame(() => {
    el.classList.add('open')
    document.body.classList.add('modal-open')
  })
}

function hideModal() {
  const el = openModal
  if (!el) return
  openModal = null
  el.classList.remove('open')
  document.body.classList.remove('modal-open')
  setTimeout(() => {
    el.hidden = true
    $('sheet-backdrop').hidden = true
  }, 250)
}

$('sheet-backdrop').addEventListener('click', hideModal)
$('btn-close').addEventListener('click', hideModal)
$('settings-close').addEventListener('click', hideModal)

let tab = 'visited'

function renderList() {
  const nv = store.visited.size
  const nw = store.wish.size
  $('n-visited').textContent = nv ? `(${nv})` : ''
  $('n-wish').textContent = nw ? `(${nw})` : ''
  for (const b of document.querySelectorAll('.tabs [role="tab"]')) b.setAttribute('aria-selected', b.dataset.tab === tab)
  $('btn-share').hidden = nv + nw === 0

  if (tab === 'trips') {
    const list = trips.list()
    $('visited-list').hidden = false
    $('progress').hidden = true
    $('empty').hidden = list.length > 0
    $('empty').innerHTML = 'Aucun voyage préparé.<br />Ouvrez la fiche d’un pays et touchez « Préparer un voyage ».'
    $('visited-list').replaceChildren(
      ...list.map((t) => {
        const li = document.createElement('li')
        const quand = new Date(t.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
        li.innerHTML = `<button class="row" type="button"><span class="flag">${flagOf(t.code)}</span><span class="name"><span class="trip-name"></span><small></small></span></button><button class="remove" type="button">Supprimer</button>`
        li.querySelector('.trip-name').textContent = t.itineraire.titre
        const rebours = t.reserver?.depart ? compteARebours(t.reserver.depart, plusJours(t.reserver.depart, t.demande.jours), aujourdhui()) : null
        li.querySelector('small').textContent = `${t.demande.jours} jour${t.demande.jours > 1 ? 's' : ''} · ${rebours ?? `préparé le ${quand}`}`
        li.querySelector('.row').addEventListener('click', () => openTrip(t.id))
        li.querySelector('.remove').addEventListener('click', () => {
          const removed = trips.remove(t.id)
          renderList()
          toast('Voyage supprimé', () => {
            trips.restore(removed)
            renderList()
          })
        })
        return li
      }),
    )
    return
  }

  if (tab === 'progress') {
    const p = progress(store.visited.codes())
    $('visited-list').hidden = true
    $('progress').hidden = false
    $('empty').hidden = true
    $('progress').innerHTML =
      `<div class="progress-total"><strong>${p.done}</strong> pays sur ${p.total} · ${Math.round(
        (p.done / p.total) * 100,
      )} %</div>` +
      p.list
        .map(
          (r) =>
            `<div class="bar-row"><div class="bar-label"><span>${r.name}</span><span>${r.done} / ${r.total}</span></div><div class="bar"><span style="width:${
              (r.done / r.total) * 100
            }%"></span></div></div>`,
        )
        .join('')
    return
  }

  const list = tab === 'visited' ? store.visited : store.wish
  const items = list
    .codes()
    .map((code) => ({ code, name: nameOf(code), ...(tab === 'visited' ? store.souvenir(code) : {}) }))
    .sort((a, b) => (b.annee ?? 0) - (a.annee ?? 0) || a.name.localeCompare(b.name, 'fr'))
  // Classement par année dès qu'au moins un pays en a une.
  const parAnnee = tab === 'visited' && items.some((i) => i.annee)
  let groupe = undefined
  $('visited-list').hidden = false
  $('progress').hidden = true
  $('empty').hidden = items.length > 0
  $('empty').innerHTML =
    tab === 'visited'
      ? 'Aucun pays pour l’instant.<br />Touchez la carte ou cherchez un pays en bas.'
      : 'Aucune envie pour l’instant.<br />Ouvrez la fiche d’un pays et touchez « J’ai envie d’y aller ».'
  $('visited-list').replaceChildren(
    ...items.flatMap(({ code, name, annee, coeur }) => {
      const out = []
      if (parAnnee && (annee ?? null) !== groupe) {
        groupe = annee ?? null
        const h = document.createElement('li')
        h.className = 'group'
        const n = items.filter((i) => (i.annee ?? null) === groupe).length
        h.textContent = `${groupe ?? 'Année non précisée'} · ${n} pays`
        out.push(h)
      }
      const li = document.createElement('li')
      out.push(li)
      li.innerHTML = `<button class="row" type="button"><span class="flag">${flagOf(code)}</span><span class="name"></span>${coeur ? '<span class="fav" aria-label="coup de cœur">❤️</span>' : ''}</button>${
        tab === 'wish' ? '<button class="go" type="button">J’y suis allé</button>' : ''
      }<button class="remove" type="button">Retirer</button>`
      li.querySelector('.name').textContent = name
      li.querySelector('.remove').setAttribute('aria-label', `Retirer ${name}`)
      li.querySelector('.row').addEventListener('click', () => {
        hideModal()
        setTimeout(() => openFiche(code), 260)
      })
      li.querySelector('.go')?.addEventListener('click', () => addVisited(code))
      li.querySelector('.remove').addEventListener('click', () => {
        if (tab === 'visited') removeVisited(code)
        else {
          const addedAt = store.wish.remove(code)
          toast(`Retiré des envies : ${label(code)}`, () => store.wish.add(code, addedAt))
        }
      })
      return out
    }),
  )
}

for (const b of document.querySelectorAll('.tabs [role="tab"]')) {
  b.addEventListener('click', () => {
    tab = b.dataset.tab
    renderList()
  })
}

$('btn-list').addEventListener('click', () => {
  renderList()
  showModal($('sheet'))
})

function couleurs() {
  const css = getComputedStyle(document.documentElement)
  const v = (name) => css.getPropertyValue(name).trim()
  return {
    fond: v('--bg'),
    ocean: v('--ocean'),
    terre: v('--land'),
    bord: v('--land-edge'),
    visite: v('--visited'),
    envie: v('--wish'),
    texte: v('--ink'),
    doux: v('--muted'),
  }
}

async function imageCarte() {
  const n = store.visited.size
  const p = progress(store.visited.codes())
  const continents = p.list.filter((r) => r.done).length
  const share = store.visited.codes().reduce((sum, c) => sum + (areaByCode.get(c) ?? 0), 0) / totalArea
  const lignes = [`${formatPercent(share)} des terres du globe · ${continents} continent${continents > 1 ? 's' : ''}`]
  const annees = store.visited.codes().map((c) => store.souvenir(c).annee).filter(Boolean)
  if (annees.length) lignes.push(`De ${Math.min(...annees)} à ${Math.max(...annees)}`)
  if (store.wish.size) lignes.push(`Et ${store.wish.size} envie${store.wish.size > 1 ? 's' : ''} en bleu`)
  const svg = afficheSvg({
    shapes,
    villes: store.villes.list(),
    visited: new Set(store.visited.codes()),
    wish: new Set(store.wish.codes()),
    couleurs: couleurs(),
    titre: String(n),
    sousTitre: n > 1 ? 'pays visités' : 'pays visité',
    lignes,
  })
  return svgEnPng(svg)
}

$('btn-share').addEventListener('click', async () => {
  const sorted = (codes) => codes.sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'fr')).map(label)
  const parts = []
  if (store.visited.size) parts.push(`J'ai visité ${store.visited.size} pays :\n${sorted(store.visited.codes()).join('\n')}`)
  if (store.wish.size) parts.push(`Mes envies :\n${sorted(store.wish.codes()).join('\n')}`)
  const text = parts.join('\n\n')
  let file = null
  try {
    file = new File([await imageCarte()], 'ma-carte-du-monde.png', { type: 'image/png' })
  } catch {
    file = null
  }
  try {
    if (file && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], text, title: 'Mes pays' })
    } else if (navigator.share) {
      await navigator.share({ title: 'Mes pays', text })
    } else if (file) {
      const url = URL.createObjectURL(file)
      const a = document.createElement('a')
      a.href = url
      a.download = file.name
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      toast('Image de la carte enregistrée')
    } else {
      await navigator.clipboard.writeText(text)
      toast('Liste copiée')
    }
  } catch {
    // Partage annulé.
  }
})

// Réglages : pays d'origine et sauvegarde.

function renderHome() {
  const home = store.home
  $('home-current').innerHTML = home
    ? `<span class="flag">${flagOf(home)}</span><span><strong>${esc(nameOf(home))}</strong>${
        PAYS[home]?.capitale ? `<br /><small>Trajets calculés depuis ${esc(PAYS[home].capitale.nom)}</small>` : ''
      }</span>`
    : '<span>Aucun pays choisi</span>'
  const q = $('home-search').value
  const found = q ? search(index, q, 6) : []
  $('home-results').replaceChildren(
    ...found.map((e) => {
      const li = document.createElement('li')
      const b = document.createElement('button')
      b.type = 'button'
      b.textContent = `${e.flag} ${e.name}`
      b.addEventListener('click', () => {
        store.setHome(e.code)
        $('home-search').value = ''
        $('home-search').blur()
        renderHome()
        toast(`Vous venez de : ${label(e.code)}`)
      })
      li.append(b)
      return li
    }),
  )
}

function openSettings() {
  renderHome()
  const api = trips.api
  $('api-code').value = api.code
  $('api-url').value = api.url
  $('api-status').textContent = ''
  showModal($('settings'))
}

$('api-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  const url = $('api-url').value.trim() || API_PAR_DEFAUT
  trips.setApi({ code: $('api-code').value.trim(), url })
  $('api-status').textContent = 'Vérification… (jusqu’à une minute si le serveur dormait)'
  try {
    const sante = await reveiller(url)
    $('api-status').textContent = sante.configure
      ? `✓ Serveur prêt · ${sante.restant} voyage${sante.restant > 1 ? 's' : ''} possible${sante.restant > 1 ? 's' : ''} aujourd’hui`
      : '⚠️ Le serveur répond, mais son code d’accès n’est pas réglé.'
  } catch {
    $('api-status').textContent = '✕ Serveur injoignable. Vérifiez l’adresse.'
  }
})

// ---------- Préparer un voyage ----------

const MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']
MOIS.forEach((m, i) => $('v-mois').append(new Option(m, String(i + 1))))
$('v-envies').replaceChildren(
  ...ENVIES.map(([value, text]) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'chip-toggle'
    b.dataset.value = value
    b.setAttribute('aria-pressed', 'false')
    b.textContent = text
    b.addEventListener('click', () => b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true'))
    return b
  }),
)
for (const group of document.querySelectorAll('#voyage .segmented')) {
  group.addEventListener('click', (e) => {
    const b = e.target.closest('button')
    if (!b) return
    for (const other of group.querySelectorAll('button')) other.setAttribute('aria-pressed', other === b)
  })
}

let jours = 5
function setJours(n) {
  jours = Math.max(1, Math.min(21, n))
  $('v-jours').textContent = `${jours} jour${jours > 1 ? 's' : ''}`
  $('v-moins').disabled = jours === 1
  $('v-plus').disabled = jours === 21
}
setJours(5)
$('v-moins').addEventListener('click', () => setJours(jours - 1))
$('v-plus').addEventListener('click', () => setJours(jours + 1))

let voyagePays = null
let tripShown = null
let pending = null

function voyageView(view) {
  for (const [id, name] of [
    ['v-form', 'form'],
    ['v-loading', 'loading'],
    ['v-error', 'error'],
    ['v-tabs', 'result'],
    ['v-result-actions', 'result'],
  ])
    $(id).hidden = view !== name
  $('v-share').hidden = view !== 'result'
  if (view === 'result') showPanel('plan')
  else for (const id of ['v-result', 'v-valise', 'v-vols', 'v-reserver', 'v-depenses']) $(id).hidden = true
  $('v-body').scrollTop = 0
}

// Onglets d'un voyage : itinéraire, valise, trajets.
function showPanel(name) {
  $('v-result').hidden = name !== 'plan'
  $('v-valise').hidden = name !== 'valise'
  $('v-vols').hidden = name !== 'vols'
  $('v-reserver').hidden = name !== 'reserver'
  $('v-depenses').hidden = name !== 'depenses'
  $('v-result-actions').hidden = name !== 'plan'
  for (const b of $('v-tabs').querySelectorAll('button')) b.setAttribute('aria-pressed', b.dataset.panel === name)
  if (name === 'valise') renderValise()
  if (name === 'vols') renderVols()
  if (name === 'reserver') renderReserver()
  if (name === 'depenses') renderDepenses(true)
  updateTabCounts()
}

$('v-tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-panel]')
  if (b) showPanel(b.dataset.panel)
})

// Onglet Préparer : démarches, achats, sac à dos, valise et bébé.
function prepOptions(t) {
  if (t.prep) return t.prep
  const qui = t.demande?.voyageurs ?? ''
  return { bebe: false, enfants: /enfant/.test(qui) || (t.demande?.envies ?? []).includes('famille') }
}

function genererPour(t, opts) {
  const home = store.home && store.home !== t.code ? store.home : null
  return genererValise({
    code: t.code,
    home: store.home,
    jours: t.demande?.jours ?? 5,
    mois: t.demande?.mois ?? null,
    envies: t.demande?.envies ?? [],
    latitude: PAYS[t.code]?.capitale?.lat ?? PAYS[t.code]?.centre?.[0] ?? 45,
    volHeures: home ? (trip(home, t.code).flight ?? 0) : 0,
    autreMonnaie: Boolean(home && PAYS[home]?.monnaie !== PAYS[t.code]?.monnaie),
    ...opts,
  })
}

function valiseOf(t) {
  // Les anciennes listes (sans parties) sont refaites en gardant ce qui était coché.
  if (Array.isArray(t.valise) && t.valise.some((i) => i.g)) return t.valise
  const valise = fusionnerValise(t.valise ?? [], genererPour(t, prepOptions(t)))
  tripShown = trips.update(t.id, { valise })
  return valise
}

function datesOf(t) {
  const depart = reservationOf(t).depart
  const jours = t.demande?.jours ?? t.itineraire?.jours?.length ?? 5
  return { depart, retour: plusJours(depart, jours) }
}

$('v-prep-date').addEventListener('change', (e) => {
  if (!tripShown || !/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) return
  tripShown = trips.update(tripShown.id, { reserver: { ...reservationOf(tripShown), depart: e.target.value } })
  renderValise()
})

$('v-ics').addEventListener('click', async () => {
  if (!tripShown) return
  const { depart, retour } = datesOf(tripShown)
  const valise = valiseOf(tripShown)
  const today = aujourdhui()
  const rappels = valise
    .filter((i) => i.g === 'avant' && !i.ok)
    .map((i) => ({ t: i.t, e: echeance(i, depart, today) }))
    .filter((r) => r.e)
    .map((r) => ({ t: r.t, date: r.e.date < today ? today : r.e.date }))
  const ics = icsVoyage({
    id: tripShown.id,
    titre: tripShown.itineraire.titre,
    lieu: nameOf(tripShown.code),
    depart,
    retour,
    vols: tripShown.vols ?? [],
    rappels,
  })
  const file = new File([ics], `voyage-${tripShown.code.toLowerCase()}.ics`, { type: 'text/calendar' })
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
  toast(`Calendrier : voyage, ${tripShown.vols?.length ?? 0} trajet(s) et ${rappels.length} rappel(s)`)
})

function togglePrep(cle) {
  if (!tripShown) return
  const opts = { ...prepOptions(tripShown), [cle]: !prepOptions(tripShown)[cle] }
  const valise = fusionnerValise(valiseOf(tripShown), genererPour(tripShown, opts))
  tripShown = trips.update(tripShown.id, { prep: opts, valise })
  renderValise()
}
$('v-prep-bebe').addEventListener('click', () => togglePrep('bebe'))
$('v-prep-enfants').addEventListener('click', () => togglePrep('enfants'))

function updateTabCounts() {
  if (!tripShown) return
  const p = progression(Array.isArray(tripShown.valise) ? tripShown.valise : [])
  $('v-valise-count').textContent = p.total ? `${p.ok}/${p.total}` : ''
  const n = tripShown.vols?.length ?? 0
  $('v-vols-count').textContent = n ? `(${n})` : ''
  const r = tripShown.reserver
  const faits = r ? Object.values(r.faits ?? {}).filter(Boolean).length : 0
  $('v-res-count').textContent = faits ? `✓${faits}` : ''
}

function saveValise(valise) {
  tripShown = trips.update(tripShown.id, { valise })
  renderValise()
}

function renderValise() {
  if (!tripShown) return
  const valise = valiseOf(tripShown)
  const opts = prepOptions(tripShown)
  $('v-prep-bebe').setAttribute('aria-pressed', opts.bebe)
  $('v-prep-enfants').setAttribute('aria-pressed', opts.enfants)
  $('v-valise-bar').style.width = `${progression(valise).pct}%`
  const today = aujourdhui()
  const { depart, retour } = datesOf(tripShown)
  $('v-prep-date').value = depart
  $('v-prep-count').textContent = compteARebours(depart, retour, today) + (tripShown.reserver?.depart ? '' : ' (date à confirmer)')
  const urgent = aFaireMaintenant(valise, depart, today).length
  $('v-prep-todo').textContent = urgent ? `${urgent} chose${urgent > 1 ? 's' : ''} à faire maintenant` : 'Rien d’urgent pour l’instant'
  $('v-prep-todo').className = urgent ? 'urgent' : ''
  const parties = PARTIES.filter((p) => p.id !== 'bebe' || valise.some((i) => i.g === 'bebe'))
  const partieDe = (i) => i.g ?? 'valise'
  $('v-prep-nav').replaceChildren(
    ...parties.map((p) => {
      const pr = progression(valise.filter((i) => partieDe(i) === p.id))
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'prep-jump' + (pr.total && pr.ok === pr.total ? ' done' : '')
      b.innerHTML = `<span>${p.icone}</span><small></small>`
      b.querySelector('small').textContent = `${pr.ok}/${pr.total}`
      b.setAttribute('aria-label', `${p.titre} : ${pr.ok} sur ${pr.total}`)
      b.addEventListener('click', () => $(`prep-${p.id}`).scrollIntoView({ behavior: 'smooth', block: 'start' }))
      return b
    }),
  )
  $('v-valise-list').replaceChildren(
    ...parties.map((p) => {
      const part = document.createElement('section')
      part.className = 'prep-part'
      part.id = `prep-${p.id}`
      const pr = progression(valise.filter((i) => partieDe(i) === p.id))
      const h = document.createElement('h3')
      h.innerHTML = '<span></span><small></small>'
      h.querySelector('span').textContent = `${p.icone} ${p.titre}`
      h.querySelector('small').textContent = `${pr.ok}/${pr.total}`
      part.append(h)
      const cats = [...new Set(valise.filter((i) => partieDe(i) === p.id).map((i) => i.cat))]
      for (const cat of cats) {
        const box = document.createElement('div')
        box.className = 'valise-cat'
        const h4 = document.createElement('h4')
        h4.textContent = cat
        box.append(h4)
        valise.forEach((item, i) => {
          if (item.cat !== cat || partieDe(item) !== p.id) return
          const row = document.createElement('div')
          row.className = 'valise-item' + (item.ok ? ' ok' : '')
          row.innerHTML = `<label><input type="checkbox" ${item.ok ? 'checked' : ''} /><span></span></label><button class="x" type="button" aria-label="Retirer">✕</button>`
          row.querySelector('span').textContent = item.t
          const due = item.g === 'avant' ? echeance(item, depart, today) : null
          if (due && due.etat !== 'fait') {
            const small = document.createElement('small')
            small.className = `due ${due.etat}`
            small.textContent =
              due.etat === 'retard' || due.reste === 0
                ? 'à faire maintenant'
                : `avant le ${new Date(`${due.date}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' })}`
            row.querySelector('span').append(small)
          }
          row.querySelector('input').addEventListener('change', (e) => {
            saveValise(valise.map((it, j) => (j === i ? { ...it, ok: e.target.checked } : it)))
          })
          row.querySelector('.x').addEventListener('click', () => {
            saveValise(valise.filter((_, j) => j !== i))
            toast('Retiré de la liste', () => saveValise(valise))
          })
          box.append(row)
        })
        part.append(box)
      }
      const form = document.createElement('form')
      form.className = 'field add-item'
      form.autocomplete = 'off'
      form.innerHTML = '<input type="text" maxlength="80" />'
      const input = form.querySelector('input')
      input.placeholder = '＋ Ajouter…'
      input.setAttribute('aria-label', `Ajouter à « ${p.titre} »`)
      form.addEventListener('submit', (e) => {
        e.preventDefault()
        const t = input.value.trim()
        if (!t) return
        saveValise([...valise, { g: p.id, cat: 'Mes ajouts', t: t.slice(0, 80), ok: false }])
        $(`prep-${p.id}`).querySelector('form input').focus()
      })
      part.append(form)
      return part
    }),
  )
  updateTabCounts()
}

function renderVols() {
  if (!tripShown) return
  const vols = tripShown.vols ?? []
  $('v-vols-list').innerHTML = vols.length
    ? trajetsHtml(vols)
    : '<p class="help center">Aucun trajet pour l’instant. Collez ci-dessous l’e-mail de confirmation de votre vol ou de votre train.</p>'
  for (const seg of $('v-vols-list').querySelectorAll('.segment')) {
    seg.querySelector('.seg-remove').addEventListener('click', () => {
      const i = Number(seg.dataset.i)
      const old = tripShown.vols
      tripShown = trips.update(tripShown.id, { vols: old.filter((_, j) => j !== i) })
      renderVols()
      toast('Trajet retiré', () => {
        tripShown = trips.update(tripShown.id, { vols: old })
        renderVols()
      })
    })
  }
  updateTabCounts()
}

$('v-vols-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  if (!tripShown) return
  const texte = $('v-vols-texte').value.trim()
  if (!texte) return
  if (!trips.api.code) {
    toast('Entrez d’abord le code d’accès du serveur')
    openSettings()
    return
  }
  const id = tripShown.id
  $('v-vols-go').disabled = true
  $('v-vols-status').textContent = 'Claude lit l’e-mail… (environ 10 secondes)'
  try {
    const data = await lireReservation(trips.api, texte)
    const t = trips.get(id)
    const { tous, ajoutes } = fusionnerTrajets(t.vols ?? [], data.trajets)
    const updated = trips.update(id, { vols: tous })
    if (tripShown?.id === id) tripShown = updated
    $('v-vols-texte').value = ''
    $('v-vols-status').textContent = ajoutes
      ? `✓ ${ajoutes} trajet${ajoutes > 1 ? 's' : ''} ajouté${ajoutes > 1 ? 's' : ''}`
      : data.trajets.length
        ? 'Ces trajets étaient déjà enregistrés.'
        : `Aucun trajet trouvé. ${data.remarque || ''}`
    renderVols()
  } catch (err) {
    $('v-vols-status').textContent = `✕ ${err.message}`
  } finally {
    $('v-vols-go').disabled = false
  }
})

// Onglet Réserver : liens préremplis (dates, voyageurs) et suivi de ce qui est réservé.
function reservationOf(t) {
  if (t.reserver?.depart) return t.reserver
  return { depart: departPropose(t.demande?.mois), adultes: t.demande?.voyageurs === 'seul' ? 1 : 2, faits: {} }
}

function saveReservation(patch) {
  tripShown = trips.update(tripShown.id, { reserver: { ...reservationOf(tripShown), ...patch } })
  renderReserver()
}

function renderReserver() {
  if (!tripShown) return
  const r = reservationOf(tripShown)
  const nbJours = tripShown.demande?.jours ?? tripShown.itineraire?.jours?.length ?? 5
  $('v-res-date').value = r.depart
  $('v-res-date').min = new Date().toISOString().slice(0, 10)
  $('v-res-adultes').textContent = String(r.adultes)
  $('v-res-moins').disabled = r.adultes <= 1
  $('v-res-plus').disabled = r.adultes >= 9
  $('v-res-retour').textContent = `Retour le ${new Date(`${plusJours(r.depart, nbJours)}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })} · ${nbJours} jour${nbJours > 1 ? 's' : ''}`
  const home = store.home && store.home !== tripShown.code ? store.home : null
  const km = home ? trip(home, tripShown.code).km : null
  const items = aReserver({
    it: tripShown.itineraire,
    pays: nameOf(tripShown.code),
    depuis: home ? PAYS[home]?.capitale?.nom || nameOf(home) : '',
    ville: tripShown.demande?.ville,
    aller: r.depart,
    jours: nbJours,
    adultes: r.adultes,
    avion: !(km && km < 700),
  })
  const cats = [...new Set(items.map((i) => i.cat))]
  $('v-res-list').replaceChildren(
    ...(home ? [] : [Object.assign(document.createElement('p'), { className: 'help', textContent: 'Indiquez votre pays d’origine dans les réglages pour voir les vols.' })]),
    ...cats.map((cat) => {
      const box = document.createElement('section')
      box.className = 'res-cat'
      const h = document.createElement('h4')
      h.textContent = cat
      box.append(h)
      for (const item of items.filter((i) => i.cat === cat)) {
        const fait = Boolean(r.faits?.[item.cle])
        const row = document.createElement('div')
        row.className = 'res-item' + (fait ? ' ok' : '')
        row.innerHTML = '<label class="res-check"><input type="checkbox" /><span><strong></strong><small></small></span></label><div class="res-links"></div>'
        row.querySelector('input').checked = fait
        row.querySelector('strong').textContent = item.titre
        row.querySelector('small').textContent = fait ? `${item.detail} · réservé` : item.detail
        row.querySelector('input').addEventListener('change', (e) =>
          saveReservation({ faits: { ...r.faits, [item.cle]: e.target.checked } }),
        )
        for (const l of item.liens) {
          const a = document.createElement('a')
          a.className = 'res-link'
          a.href = l.url
          a.target = '_blank'
          a.rel = 'noopener noreferrer'
          a.textContent = l.nom
          row.querySelector('.res-links').append(a)
        }
        box.append(row)
      }
      return box
    }),
  )
  updateTabCounts()
}

$('v-res-date').addEventListener('change', (e) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) saveReservation({ depart: e.target.value })
})
$('v-res-moins').addEventListener('click', () => saveReservation({ adultes: Math.max(1, reservationOf(tripShown).adultes - 1) }))
$('v-res-plus').addEventListener('click', () => saveReservation({ adultes: Math.min(9, reservationOf(tripShown).adultes + 1) }))

// Onglet Budget : dépenses saisies sur place, converties dans la monnaie de la maison.
let tauxMaison = null
let deviseSaisie = null
let catSaisie = 'repas'
let parSaisie = null
let pourSaisie = null // null = tout le monde

const monnaieMaison = () => (store.home && PAYS[store.home]?.monnaie) || 'EUR'
const monnaieLocale = (t) => PAYS[t.code]?.monnaie || monnaieMaison()

$('v-dep-cats').replaceChildren(
  ...CATEGORIES.map((c) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'chip-toggle'
    b.dataset.cat = c.id
    b.textContent = `${c.icone} ${c.nom}`
    b.addEventListener('click', () => {
      catSaisie = c.id
      renderDepenses()
    })
    return b
  }),
)

async function renderDepenses(chargerTaux = false) {
  if (!tripShown) return
  const t = tripShown
  const maison = monnaieMaison()
  const locale = monnaieLocale(t)
  if (!deviseSaisie || ![maison, locale].includes(deviseSaisie)) deviseSaisie = locale
  const symbole = (d) => formatArgent(0, d).replace(/[\d\s,.  ]/g, '') || d
  $('v-dep-devise').textContent = `${symbole(deviseSaisie)} ${deviseSaisie}`
  $('v-dep-devise').disabled = maison === locale
  for (const b of $('v-dep-cats').children) b.setAttribute('aria-pressed', b.dataset.cat === catSaisie)

  const rates = tauxMaison?.base === maison ? tauxMaison.rates : null
  const { depart } = datesOf(t)
  const jours = t.demande?.jours ?? 5
  const b = bilan(t.depenses ?? [], { maison, rates, budget: t.budgetPrevu ?? null, depart, jours, today: aujourdhui() })
  $('v-dep-total').textContent = formatArgent(b.total, maison)
  if (t.budgetPrevu) {
    $('v-dep-reste-label').textContent = b.reste >= 0 ? `Reste sur ${formatArgent(t.budgetPrevu, maison)}` : 'Budget dépassé de'
    $('v-dep-reste').textContent = formatArgent(Math.abs(b.reste), maison)
    $('v-dep-reste').className = b.reste < 0 ? 'over' : ''
    $('v-dep-bar').style.width = `${Math.min(100, Math.round((b.total / t.budgetPrevu) * 100))}%`
  } else {
    $('v-dep-reste-label').textContent = 'Budget'
    $('v-dep-reste').textContent = 'Fixer ›'
    $('v-dep-reste').className = ''
    $('v-dep-bar').style.width = '0%'
  }
  const infos = []
  if (b.total) infos.push(`${formatArgent(b.moyenne, maison)} par jour en moyenne`)
  if (b.projection) infos.push(`environ ${formatArgent(b.projection, maison)} à ce rythme sur ${jours} jours`)
  if (b.sansTaux) infos.push(`${b.sansTaux} dépense${b.sansTaux > 1 ? 's' : ''} sans taux de change (hors connexion)`)
  $('v-dep-info').textContent = infos.join(' · ')

  $('v-dep-bilan').replaceChildren(
    ...b.parCat.map((c) => {
      const row = document.createElement('div')
      row.className = 'dep-cat'
      row.innerHTML = '<span class="dep-cat-nom"></span><span class="dep-cat-bar"><i></i></span><span class="dep-cat-total"></span>'
      row.querySelector('.dep-cat-nom').textContent = `${c.icone} ${c.nom}`
      row.querySelector('i').style.width = `${c.pct}%`
      row.querySelector('.dep-cat-total').textContent = formatArgent(c.total, maison)
      return row
    }),
  )

  const sansTauxItems = (t.depenses ?? []).filter((d) => !b.parJour.some((j) => j.items.includes(d)))
  const groupes = [...b.parJour]
  const rembItems = sansTauxItems.filter((d) => d.remb)
  const sansTauxVrai = sansTauxItems.filter((d) => !d.remb)
  if (sansTauxVrai.length) groupes.push({ date: null, total: null, items: sansTauxVrai })
  if (rembItems.length) groupes.push({ date: null, total: null, items: rembItems, titre: 'Remboursements entre voyageurs' })
  $('v-dep-list').replaceChildren(
    ...groupes.map((g) => {
      const box = document.createElement('section')
      box.className = 'dep-jour'
      const h = document.createElement('h4')
      h.innerHTML = '<span></span><span></span>'
      h.firstChild.textContent = g.date
        ? new Date(`${g.date}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
        : g.titre || 'Sans taux de change'
      h.lastChild.textContent = g.total != null ? formatArgent(g.total, maison) : ''
      box.append(h)
      for (const d of [...g.items].reverse()) {
        const cat = CATEGORIES.find((c) => c.id === d.cat) ?? CATEGORIES.at(-1)
        const row = document.createElement('div')
        row.className = 'dep-item'
        row.innerHTML = '<span class="dep-icone"></span><span class="dep-texte"><strong></strong><small></small></span><span class="dep-montant"></span><button class="x" type="button" aria-label="Supprimer">✕</button>'
        row.querySelector('.dep-icone').textContent = d.remb ? '🤝' : cat.icone
        row.querySelector('strong').textContent = d.remb ? `${d.par} → ${d.pour[0]}` : d.note || cat.nom
        const conv = d.devise !== maison && d.valeur != null && d.maison === maison ? `≈ ${formatArgent(d.valeur, maison)}` : ''
        const qui = !d.remb && d.par && (t.participants ?? []).length > 1 ? partageTexte(d, t.participants) : ''
        row.querySelector('small').textContent = [qui, conv].filter(Boolean).join(' · ')
        row.querySelector('.dep-montant').textContent = formatArgent(d.montant, d.devise)
        row.querySelector('.x').addEventListener('click', () => {
          const avant = tripShown.depenses
          tripShown = trips.update(tripShown.id, { depenses: avant.filter((x) => x.id !== d.id) })
          renderDepenses()
          toast('Dépense supprimée', () => {
            tripShown = trips.update(tripShown.id, { depenses: avant })
            renderDepenses()
          })
        })
        box.append(row)
      }
      return box
    }),
  )
  renderPartage(t, maison, rates)
  apercuConversion()
  $('v-dep-source').innerHTML = rates
    ? `Taux du ${new Date(tauxMaison.date).toLocaleDateString('fr-FR')} · <a href="${SOURCE.url}" target="_blank" rel="noopener">${SOURCE.nom}</a>. La valeur est figée au jour de la saisie.`
    : ''

  if (chargerTaux && maison !== locale) {
    const taux = await getTaux(maison)
    if (taux && taux !== tauxMaison) {
      tauxMaison = taux
      if (tripShown?.id === t.id && !$('v-depenses').hidden) renderDepenses()
    }
  }
}

function apercuConversion() {
  const maison = monnaieMaison()
  const m = lireMontant($('v-dep-montant').value)
  const r = tauxMaison?.base === maison ? tauxMaison.rates?.[deviseSaisie] : null
  $('v-dep-conv').textContent = m && deviseSaisie !== maison && r ? `≈ ${formatArgent(m / r, maison)}` : ''
}

$('v-dep-montant').addEventListener('input', apercuConversion)
$('v-dep-devise').addEventListener('click', () => {
  if (!tripShown) return
  const maison = monnaieMaison()
  deviseSaisie = deviseSaisie === maison ? monnaieLocale(tripShown) : maison
  renderDepenses()
})

$('v-dep-form').addEventListener('submit', (e) => {
  e.preventDefault()
  if (!tripShown) return
  const montant = lireMontant($('v-dep-montant').value)
  if (!montant) {
    toast('Entrez un montant, par exemple 12,50')
    $('v-dep-montant').focus()
    return
  }
  const maison = monnaieMaison()
  const rates = tauxMaison?.base === maison ? tauxMaison.rates : null
  const d = nouvelleDepense(
    { montant, devise: deviseSaisie, cat: catSaisie, note: $('v-dep-note').value, date: aujourdhui(), ...partageSaisi(tripShown) },
    maison,
    rates,
    `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
  )
  tripShown = trips.update(tripShown.id, { depenses: [...(tripShown.depenses ?? []), d] })
  $('v-dep-montant').value = ''
  $('v-dep-note').value = ''
  pourSaisie = null
  renderDepenses()
  toast(`Ajouté : ${formatArgent(montant, d.devise)}`)
})

// Partage des frais entre voyageurs.
const gensDe = (t) => t.participants ?? []

function partageTexte(d, gens) {
  const pour = d.pour.length === gens.length && gens.every((n) => d.pour.includes(n)) ? 'tous' : d.pour.join(', ')
  return `${d.par} pour ${pour}`
}

function partageSaisi(t) {
  const gens = gensDe(t)
  if (gens.length < 2) return {}
  const pour = pourSaisie ? gens.filter((n) => pourSaisie.includes(n)) : gens
  return { par: gens.includes(parSaisie) ? parSaisie : gens[0], pour }
}

function puce(texte, actif, onClick, label) {
  const b = document.createElement('button')
  b.type = 'button'
  b.className = 'chip-toggle'
  b.textContent = texte
  if (actif != null) b.setAttribute('aria-pressed', actif)
  if (label) b.setAttribute('aria-label', label)
  b.addEventListener('click', onClick)
  return b
}

function ajouterVoyageurs() {
  const gens = gensDe(tripShown)
  const rep = prompt(gens.length ? 'Prénom du voyageur à ajouter' : 'Prénoms des voyageurs, séparés par des virgules (par exemple : Moi, Léa)', '')
  if (!rep) return
  const noms = rep
    .split(',')
    .map((n) => n.trim().slice(0, 20))
    .filter((n) => n && !gens.includes(n))
  if (!noms.length) return
  tripShown = trips.update(tripShown.id, { participants: [...gens, ...new Set(noms)].slice(0, 12) })
  pourSaisie = null
  renderDepenses()
}

function retirerVoyageur(nom) {
  if ((tripShown.depenses ?? []).some((d) => d.par === nom || d.pour?.includes(nom)))
    return toast(`${nom} a déjà des dépenses : supprimez-les d’abord`)
  const avant = gensDe(tripShown)
  tripShown = trips.update(tripShown.id, { participants: avant.filter((n) => n !== nom) })
  renderDepenses()
  toast(`${nom} retiré`, () => {
    tripShown = trips.update(tripShown.id, { participants: avant })
    renderDepenses()
  })
}

function renderPartage(t, maison, rates) {
  const gens = gensDe(t)
  const partage = gens.length > 1
  $('v-dep-gens').replaceChildren(
    ...(gens.length ? [document.createTextNode('👥 ')] : []),
    ...gens.map((n) => puce(`${n} ✕`, null, () => retirerVoyageur(n), `Retirer ${n}`)),
    puce(gens.length ? '＋ Voyageur' : '👥 Partager les frais entre voyageurs', null, ajouterVoyageurs),
  )
  $('v-dep-partage').hidden = !partage
  if (partage) {
    if (!gens.includes(parSaisie)) parSaisie = gens[0]
    if (pourSaisie && !pourSaisie.some((n) => gens.includes(n))) pourSaisie = null
    const pour = pourSaisie ?? gens
    $('v-dep-par').replaceChildren(
      ...gens.map((n) =>
        puce(n, n === parSaisie, () => {
          parSaisie = n
          renderPartage(tripShown, maison, rates)
        }),
      ),
    )
    $('v-dep-pour').replaceChildren(
      ...gens.map((n) =>
        puce(n, pour.includes(n), () => {
          const s = pour.includes(n) ? pour.filter((x) => x !== n) : [...pour, n]
          if (!s.length) return toast('Choisissez au moins une personne')
          pourSaisie = s.length === gens.length ? null : s
          renderPartage(tripShown, maison, rates)
        }),
      ),
    )
  }

  const box = $('v-dep-comptes')
  const e = partage ? equilibre(t.depenses ?? [], gens, { maison, rates }) : null
  box.hidden = !e || !e.soldes.some((s) => s.paye)
  if (box.hidden) return box.replaceChildren()
  const h = document.createElement('h4')
  h.textContent = 'Qui doit quoi'
  const lignes = e.virements.length
    ? e.virements.map((v) => {
        const row = document.createElement('div')
        row.className = 'dep-virement'
        row.innerHTML = '<span></span><button class="link" type="button">Réglé</button>'
        row.firstChild.textContent = `${v.de} doit ${formatArgent(v.montant, maison)} à ${v.a}`
        row.lastChild.setAttribute('aria-label', `${v.de} a remboursé ${v.a}`)
        row.lastChild.addEventListener('click', () => {
          const r = nouvelleDepense(
            { montant: v.montant, devise: maison, cat: 'autre', note: 'Remboursement', date: aujourdhui(), par: v.de, pour: [v.a], remb: true },
            maison,
            rates,
            `${Date.now().toString(36)}r`,
          )
          tripShown = trips.update(tripShown.id, { depenses: [...(tripShown.depenses ?? []), r] })
          renderDepenses()
          toast(`${v.de} a remboursé ${v.a}`)
        })
        return row
      })
    : [Object.assign(document.createElement('p'), { className: 'help', textContent: 'Tout le monde est quitte 🎉' })]
  const soldes = document.createElement('p')
  soldes.className = 'help'
  soldes.textContent = e.soldes
    .map((s) => `${s.nom} a payé ${formatArgent(s.paye, maison)} (sa part : ${formatArgent(s.part, maison)})`)
    .join(' · ')
  const extra = []
  if (e.ignorees) extra.push(`${e.ignorees} dépense${e.ignorees > 1 ? 's' : ''} sans payeur ou sans taux ne ${e.ignorees > 1 ? 'sont' : 'est'} pas comptée${e.ignorees > 1 ? 's' : ''}`)
  const note = Object.assign(document.createElement('p'), { className: 'help', textContent: extra.join('') })
  box.replaceChildren(h, ...lignes, soldes, ...(extra.length ? [note] : []))
}

$('v-dep-budget').addEventListener('click', () => {
  if (!tripShown) return
  const maison = monnaieMaison()
  const rep = prompt(`Budget total du voyage (${maison}) — laisser vide pour aucun`, tripShown.budgetPrevu ?? '')
  if (rep === null) return
  const n = rep.trim() ? lireMontant(rep) : null
  if (rep.trim() && !n) return toast('Budget illisible')
  tripShown = trips.update(tripShown.id, { budgetPrevu: n })
  renderDepenses()
})

function openVoyage(code) {
  voyagePays = code
  tripShown = null
  $('v-title').textContent = `${flagOf(code)} ${nameOf(code)}`
  $('v-ville').value = ''
  $('v-precisions').value = ''
  voyageView('form')
  showModal($('voyage'))
  // Le serveur gratuit s'endort : on le réveille pendant que l'utilisateur remplit le formulaire.
  reveiller(trips.api.url).catch(() => {})
}

function openTrip(id) {
  const t = trips.get(id)
  if (!t) return
  voyagePays = t.code
  tripShown = t
  editionPlan = false
  $('v-title').textContent = `${flagOf(t.code)} ${nameOf(t.code)}`
  renderPlan()
  voyageView('result')
  showModal($('voyage'))
}

function lireFormulaire() {
  const pressed = (id) => $(id).querySelector('[aria-pressed="true"]')?.dataset.value
  return {
    pays: nameOf(voyagePays),
    ville: $('v-ville').value.trim(),
    depart: store.home && store.home !== voyagePays ? nameOf(store.home) : '',
    jours,
    mois: $('v-mois').value ? Number($('v-mois').value) : null,
    envies: [...$('v-envies').querySelectorAll('[aria-pressed="true"]')].map((b) => b.dataset.value),
    voyageurs: pressed('v-qui') ?? '',
    budget: pressed('v-budget') ?? 'moyen',
    rythme: pressed('v-rythme') ?? 'equilibre',
    precisions: $('v-precisions').value.trim(),
  }
}

const ATTENTE = [
  'Je repère les incontournables…',
  'Je cherche des coins moins connus…',
  'J’organise les journées…',
  'Je choisis de bonnes tables…',
  'Je vérifie les temps de trajet…',
  'Presque prêt…',
]

let derniereDemande = null
let derniereRemplace = null

async function lancer(demande, remplacer = null) {
  if (!trips.api.code) {
    toast('Entrez d’abord le code d’accès du serveur')
    openSettings()
    return
  }
  derniereDemande = demande
  derniereRemplace = remplacer
  voyageView('loading')
  let i = 0
  $('v-loading-text').textContent = ATTENTE[0]
  const timer = setInterval(() => {
    i = Math.min(i + 1, ATTENTE.length - 1)
    $('v-loading-text').textContent = ATTENTE[i]
  }, 9000)
  pending = new AbortController()
  const code = voyagePays
  try {
    const itineraire = await demanderItineraire(trips.api, demande, pending.signal)
    const t = remplacer && trips.get(remplacer) ? trips.update(remplacer, { itineraire }) : trips.add(code, demande, itineraire)
    tripShown = t
    editionPlan = false
    renderPlan()
    voyageView('result')
    if (openModal !== $('voyage')) toast(`Voyage prêt : ${label(code)}`)
  } catch (e) {
    if (e?.name === 'AbortError') {
      voyageView('form')
      return
    }
    $('v-error-text').textContent = e.message
    voyageView('error')
  } finally {
    clearInterval(timer)
    pending = null
  }
}

$('f-plan').addEventListener('click', () => openVoyage(selected))
$('v-form').addEventListener('submit', (e) => {
  e.preventDefault()
  lancer(lireFormulaire())
})
$('v-simple').addEventListener('click', () => {
  const demande = lireFormulaire()
  const t = trips.add(voyagePays, demande, itineraireVide(demande, PAYS[voyagePays]?.capitale?.nom))
  tripShown = t
  editionPlan = false
  renderPlan()
  voyageView('result')
  showPanel('reserver')
})
// Plan modifiable à la main.
let editionPlan = false

function renderPlan() {
  if (!tripShown) return
  $('v-result').innerHTML = itineraireHtml(tripShown.itineraire, nameOf(tripShown.code), { edition: editionPlan })
}

function savePlan(it, garderFocus) {
  tripShown = trips.update(tripShown.id, { itineraire: it })
  renderPlan()
  updateTabCounts()
  if (garderFocus != null) $('v-result').querySelector(`.plan-add[data-j="${garderFocus}"] [name="titre"]`)?.focus()
}

$('v-result').addEventListener('click', (e) => {
  if (!tripShown) return
  const it = tripShown.itineraire
  if (e.target.closest('#v-gen')) return lancer(tripShown.demande, tripShown.id)
  if (e.target.closest('#plan-construire')) {
    editionPlan = true
    return savePlan({ ...ajouterJour(it), manuel: true }, 0)
  }
  if (e.target.closest('#plan-edit')) {
    editionPlan = true
    return renderPlan()
  }
  if (e.target.closest('#plan-fini')) {
    editionPlan = false
    renderPlan()
    return $('v-result').scrollIntoView({ block: 'start' })
  }
  if (e.target.closest('#plan-add-jour')) {
    const lieu = prompt('Où êtes-vous ce jour-là ?', it.jours.at(-1)?.lieu ?? it.etapes?.[0] ?? '')
    if (lieu === null) return
    return savePlan(ajouterJour(it, { lieu }), it.jours.length)
  }
  const x = e.target.closest('.plan-x')
  if (x) {
    const avant = it
    savePlan(retirerElement(it, Number(x.dataset.j), x.dataset.type, Number(x.dataset.i)))
    return toast('Retiré du plan', () => savePlan(avant))
  }
  const modif = e.target.closest('[data-edit-jour]')
  if (modif) {
    const j = Number(modif.dataset.editJour)
    const jour = it.jours[j]
    const lieu = prompt(`Lieu du jour ${jour.numero}`, jour.lieu)
    if (lieu === null) return
    const titre = prompt(`Titre du jour ${jour.numero}`, jour.titre)
    if (titre === null) return
    const deplacement = prompt('Trajet ce jour-là (facultatif, par exemple « Shinkansen Tokyo → Kyoto, 2 h 15 »)', jour.deplacement ?? '')
    return savePlan(modifierJour(it, j, { lieu, titre, deplacement: deplacement ?? jour.deplacement }))
  }
  const suppr = e.target.closest('[data-suppr-jour]')
  if (suppr) {
    const avant = it
    savePlan(retirerJour(it, Number(suppr.dataset.supprJour)))
    toast('Jour retiré', () => savePlan(avant))
  }
})

$('v-result').addEventListener('submit', (e) => {
  const form = e.target.closest('.plan-add')
  if (!form || !tripShown) return
  e.preventDefault()
  const j = Number(form.dataset.j)
  const moment = form.moment.value
  const titre = form.titre.value.trim()
  if (!titre) return form.titre.focus()
  const detail = form.detail.value
  const it = tripShown.itineraire
  const nouveau =
    moment === 'déjeuner' || moment === 'dîner'
      ? ajouterRestaurant(it, j, { repas: moment, nom: titre, pourquoi: detail })
      : ajouterActivite(it, j, { moment, titre, detail })
  savePlan(nouveau, j)
  toast(`Ajouté au jour ${j + 1}`)
})
$('v-cancel').addEventListener('click', () => pending?.abort())
$('v-retry').addEventListener('click', () => derniereDemande && lancer(derniereDemande, derniereRemplace))
$('v-edit').addEventListener('click', () => voyageView('form'))
$('v-new').addEventListener('click', () => voyageView('form'))
$('v-close').addEventListener('click', hideModal)
$('v-delete').addEventListener('click', () => {
  if (!tripShown) return
  const removed = trips.remove(tripShown.id)
  hideModal()
  toast('Voyage supprimé', () => trips.restore(removed))
})
// Inviter des amis : le voyage entier part dans un lien.
async function inviter() {
  if (!tripShown) return
  let url
  try {
    url = `${location.origin}${location.pathname}#${CLE_LIEN}=${await encoderVoyage(tripShown)}`
  } catch {
    return toast('Impossible de préparer le lien')
  }
  const titre = tripShown.itineraire?.titre || nameOf(tripShown.code)
  const text = `Je t’invite à mon voyage « ${titre} » ${flagOf(tripShown.code)} dans Mes pays. Ouvre le lien pour avoir tout le programme :`
  try {
    if (navigator.share) {
      await navigator.share({ title: titre, text, url })
      return
    }
  } catch (err) {
    if (err?.name === 'AbortError') return
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url}`)
    toast('Lien d’invitation copié')
  } catch {
    prompt('Copiez ce lien et envoyez-le à vos amis', url)
  }
}
$('v-share').addEventListener('click', inviter)
$('v-inviter').addEventListener('click', inviter)

// Ouvrir une invitation reçue (lien ouvert ou collé).
async function recevoirInvitation(code) {
  let t
  try {
    t = nettoyerVoyage(await decoderVoyage(code), new Set(Object.keys(PAYS)))
  } catch (err) {
    return toast(err.message?.startsWith('Lien') ? err.message : 'Invitation illisible : le lien est peut-être coupé')
  }
  if (!t) return toast('Invitation illisible : le lien est peut-être coupé')
  const titre = t.itineraire.titre
  const deja = trips.get(t.id)
  const question = deja
    ? `Mettre à jour votre voyage « ${titre} » avec cette invitation ? Rien de ce que vous avez ajouté n’est perdu.`
    : `On vous invite au voyage « ${titre} » (${nameOf(t.code)}). L’ajouter à vos voyages ?`
  if (!confirm(question)) return
  if (deja) trips.update(t.id, fusionnerVoyage(deja, t))
  else trips.restore(t)
  openTrip(t.id)
  toast(deja ? 'Voyage mis à jour' : 'Voyage ajouté à « Ma liste »')
}

function lireInvitationDansAdresse() {
  const m = location.hash.match(new RegExp(`^#${CLE_LIEN}=([\\w-]+)`))
  if (!m) return
  history.replaceState(null, '', location.pathname + location.search)
  recevoirInvitation(m[1])
}
window.addEventListener('hashchange', lireInvitationDansAdresse)

$('btn-invitation').addEventListener('click', () => {
  const rep = prompt('Collez le lien d’invitation reçu')
  if (!rep) return
  const m = rep.match(new RegExp(`#${CLE_LIEN}=([\\w-]+)`))
  if (!m) return toast('Ce n’est pas un lien d’invitation Mes pays')
  recevoirInvitation(m[1])
})

$('btn-settings').addEventListener('click', openSettings)
$('home-search').addEventListener('input', renderHome)
$('home-form').addEventListener('submit', (e) => {
  e.preventDefault()
  $('home-results').querySelector('button')?.click()
})

$('btn-export').addEventListener('click', async () => {
  const data = JSON.stringify({ ...store.exportData(), voyages: trips.list() }, null, 2)
  const date = new Date().toISOString().slice(0, 10)
  const file = new File([data], `mes-pays-${date}.json`, { type: 'application/json' })
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Sauvegarde Mes pays' })
      return
    }
  } catch (err) {
    if (err?.name === 'AbortError') return
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
})

$('import-file').addEventListener('change', async (e) => {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return
  try {
    const data = JSON.parse(await file.text())
    const added = store.importData(data)
    let voyages = 0
    for (const t of Array.isArray(data.voyages) ? data.voyages : []) {
      if (t && typeof t.id === 'string' && typeof t.code === 'string' && Array.isArray(t.itineraire?.jours) && !trips.get(t.id)) {
        trips.restore(t)
        voyages++
      }
    }
    renderHome()
    const bits = []
    if (added) bits.push(`${added} pays`)
    if (voyages) bits.push(`${voyages} voyage${voyages > 1 ? 's' : ''}`)
    toast(bits.length ? `Restauré : ${bits.join(' et ')}` : 'Sauvegarde déjà à jour')
  } catch (err) {
    toast(err.message.includes('Mes pays') ? err.message : 'Fichier illisible')
  }
})

// ---------- Démarrage ----------

store.subscribe(() => {
  paint()
  updateStats()
  if (selected) renderFiche()
  if (openModal === $('sheet')) renderList()
  if (input.value) renderResults()
})

layout()
paint()
updateStats()
window.addEventListener('resize', () => {
  layout()
  followKeyboard()
})

navigator.storage?.persist?.().catch(() => {})
lireInvitationDansAdresse()

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {})
}
