import './style.css'
import { geoArea, geoGraticule10, geoNaturalEarth1, geoPath } from 'd3-geo'
import { select } from 'd3-selection'
import { zoom, zoomIdentity } from 'd3-zoom'
import 'd3-transition'
import { feature } from 'topojson-client'
import world from 'world-atlas/countries-50m.json'
import { buildIndex, codeForFeature, flagOf, nameOf, search } from './countries.js'
import { createStore } from './store.js'

const store = createStore()
const index = buildIndex()
const $ = (id) => document.getElementById(id)

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

// Surface de chaque pays, pour la part des terres visitées.
const areaByCode = new Map()
let totalArea = 0
for (const { f, code } of shapes) {
  const a = geoArea(f)
  totalArea += a
  if (code) areaByCode.set(code, (areaByCode.get(code) ?? 0) + a)
}

let width = 0
let height = 0
const zoomer = zoom()
  .on('zoom', (event) => {
    root.attr('transform', event.transform)
    svg.classed('zoomed', event.transform.k > 4)
  })

svg.call(zoomer).on('dblclick.zoom', null)

function layout() {
  width = window.innerWidth
  height = window.innerHeight
  svg.attr('viewBox', `0 0 ${width} ${height}`)
  // Zone libre entre le compteur (haut) et la recherche (bas).
  const top = 76
  const bottom = height - 84
  const free = bottom - top
  // En portrait, le monde entier serait minuscule : on l'agrandit pour remplir
  // l'écran et on fait glisser la carte. Pincer permet de revoir tout le monde.
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
  const minK = Math.min(1, fitWidth / mapWidth)
  zoomer.scaleExtent([minK, 60]).translateExtent([
    [Math.min(0, x0) - 8, top - height * 0.3],
    [Math.max(width, x0 + mapWidth) + 8, bottom + height * 0.3],
  ])
}

function paint() {
  countries.classed('visited', (d) => d.code && store.has(d.code))
}

function flash(code) {
  countries
    .filter((d) => d.code === code)
    .classed('pop', false)
    .each(function () {
      void this.getBoundingClientRect()
    })
    .classed('pop', true)
    .raise()
}

// Recentre sur la partie principale du pays (la métropole, pas les îles lointaines).
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

function focus(code) {
  const shape = shapes.find((s) => s.code === code)
  if (!shape) return false
  const [[x0, y0], [x1, y1]] = path.bounds(mainPart(shape.f))
  const visibleTop = 80
  const visibleHeight = (window.visualViewport?.height ?? height) - visibleTop - 120
  const k = Math.max(0.8, Math.min(8, 0.35 /Math.max((x1 - x0) / width, (y1 - y0) / visibleHeight)))
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  svg
    .transition()
    .duration(650)
    .call(zoomer.transform, zoomIdentity.translate(width / 2 - k * cx, visibleTop + visibleHeight / 2 - k * cy).scale(k))
  return true
}

countries.on('click', (event, d) => {
  if (!d.code) return
  toggle(d.code)
})

$('btn-reset').addEventListener('click', () => {
  svg.transition().duration(500).call(zoomer.transform, zoomIdentity)
})

// ---------- Ajout, retrait, annulation ----------

function add(code, addedAt) {
  if (!store.add(code, addedAt)) return false
  flash(code)
  return true
}

function toggle(code) {
  if (store.has(code)) {
    const addedAt = store.remove(code)
    toast(`Retiré : ${flagOf(code)} ${nameOf(code)}`, () => add(code, addedAt))
  } else {
    add(code)
    toast(`Ajouté : ${flagOf(code)} ${nameOf(code)}`, () => store.remove(code))
  }
}

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

// ---------- Compteur ----------

function updateStats() {
  const n = store.size
  $('count').textContent = n
  $('count-label').textContent = n > 1 ? 'pays visités' : 'pays visité'
  const share = store.codes().reduce((sum, c) => sum + (areaByCode.get(c) ?? 0), 0) / totalArea
  $('land').textContent = n ? `${formatPercent(share)} des terres du globe` : ''
  $('hint').hidden = n > 0
}

function formatPercent(x) {
  const p = x * 100
  if (p > 0 && p < 0.1) return '< 0,1 %'
  return `${p.toLocaleString('fr-FR', { maximumFractionDigits: p < 10 ? 1 : 0 })} %`
}

// ---------- Recherche ----------

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
      li.className = store.has(entry.code) ? 'done' : ''
      if (i === 0) li.classList.add('first')
      li.innerHTML = `<span class="flag">${entry.flag}</span><span class="name"></span><span class="state">${
        store.has(entry.code) ? '✓ Visité' : 'Ajouter'
      }</span>`
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
}

function choose(code) {
  if (store.has(code)) {
    toast(`${flagOf(code)} ${nameOf(code)} est déjà dans votre liste`)
  } else {
    add(code)
    toast(`Ajouté : ${flagOf(code)} ${nameOf(code)}`, () => store.remove(code))
  }
  focus(code)
  // On vide le champ sans fermer le clavier : on peut enchaîner le pays suivant.
  input.value = ''
  renderResults()
}

input.addEventListener('input', renderResults)
results.addEventListener('pointerdown', (e) => e.preventDefault()) // garde le clavier ouvert
results.addEventListener('click', (e) => {
  const li = e.target.closest('li[data-code]')
  if (li) choose(li.dataset.code)
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

// Le clavier de l'iPhone recouvre le bas de l'écran : la barre remonte au-dessus.
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

// ---------- Ma liste ----------

const sheet = $('sheet')

function renderList() {
  const items = store
    .codes()
    .map((code) => ({ code, name: nameOf(code) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  $('sheet-title').textContent = items.length ? `Mes pays (${items.length})` : 'Mes pays'
  $('empty').hidden = items.length > 0
  $('btn-share').hidden = items.length === 0
  $('visited-list').replaceChildren(
    ...items.map(({ code, name }) => {
      const li = document.createElement('li')
      li.innerHTML = `<button class="row" type="button"><span class="flag">${flagOf(code)}</span><span class="name"></span></button><button class="remove" type="button">Retirer</button>`
      li.querySelector('.name').textContent = name
      li.querySelector('.remove').setAttribute('aria-label', `Retirer ${name}`)
      li.querySelector('.row').addEventListener('click', () => {
        closeSheet()
        focus(code)
        flash(code)
      })
      li.querySelector('.remove').addEventListener('click', () => toggle(code))
      return li
    }),
  )
}

function openSheet() {
  renderList()
  sheet.hidden = false
  $('sheet-backdrop').hidden = false
  requestAnimationFrame(() => document.body.classList.add('sheet-open'))
}

function closeSheet() {
  document.body.classList.remove('sheet-open')
  setTimeout(() => {
    sheet.hidden = true
    $('sheet-backdrop').hidden = true
  }, 250)
}

$('btn-list').addEventListener('click', openSheet)
$('btn-close').addEventListener('click', closeSheet)
$('sheet-backdrop').addEventListener('click', closeSheet)

$('btn-share').addEventListener('click', async () => {
  const items = store
    .codes()
    .map((c) => `${flagOf(c)} ${nameOf(c)}`)
    .sort((a, b) => a.slice(5).localeCompare(b.slice(5), 'fr'))
  const text = `J'ai visité ${items.length} pays :\n${items.join('\n')}`
  try {
    if (navigator.share) await navigator.share({ title: 'Mes pays', text })
    else {
      await navigator.clipboard.writeText(text)
      toast('Liste copiée')
    }
  } catch {
    // Partage annulé par l'utilisateur.
  }
})

// ---------- Démarrage ----------

store.subscribe(() => {
  paint()
  updateStats()
  if (!sheet.hidden) renderList()
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

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {})
}
