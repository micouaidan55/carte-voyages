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
import { createStore } from './store.js'
import {
  API_PAR_DEFAUT,
  ENVIES,
  createTrips,
  demanderItineraire,
  itineraireHtml,
  itineraireTexte,
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
const zoomer = zoom().on('zoom', (event) => {
  root.attr('transform', event.transform)
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
  zoomer.scaleExtent([Math.min(1, fitWidth / mapWidth), 60]).translateExtent([
    [Math.min(0, x0) - 8, top - height * 0.3],
    [Math.max(width, x0 + mapWidth) + 8, bottom + height * 0.3],
  ])
}

function paint() {
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

  renderTrip()

  const facts = []
  const fact = (dt, dd) => dd && facts.push(`<div><dt>${dt}</dt><dd>${esc(dd)}</dd></div>`)
  fact('Capitale', p?.capitale?.nom)
  const langs = languesOf(code)
  fact(langs.length > 1 ? 'Langues' : 'Langue', langs.join(', '))
  fact('Monnaie', monnaieOf(code))
  fact('Population', formatPopulation(p?.population))
  fact('Superficie', p?.superficie && `${Math.round(p.superficie).toLocaleString('fr-FR')} km²`)
  fact('Indicatif', p?.indicatif)
  $('f-facts').innerHTML = facts.join('') || '<div><dd>Pas d’informations pour ce territoire.</dd></div>'

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
        li.querySelector('small').textContent = `${t.demande.jours} jour${t.demande.jours > 1 ? 's' : ''} · préparé le ${quand}`
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
    .map((code) => ({ code, name: nameOf(code) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  $('visited-list').hidden = false
  $('progress').hidden = true
  $('empty').hidden = items.length > 0
  $('empty').innerHTML =
    tab === 'visited'
      ? 'Aucun pays pour l’instant.<br />Touchez la carte ou cherchez un pays en bas.'
      : 'Aucune envie pour l’instant.<br />Ouvrez la fiche d’un pays et touchez « J’ai envie d’y aller ».'
  $('visited-list').replaceChildren(
    ...items.map(({ code, name }) => {
      const li = document.createElement('li')
      li.innerHTML = `<button class="row" type="button"><span class="flag">${flagOf(code)}</span><span class="name"></span></button>${
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
      return li
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

$('btn-share').addEventListener('click', async () => {
  const sorted = (codes) => codes.sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'fr')).map(label)
  const parts = []
  if (store.visited.size) parts.push(`J'ai visité ${store.visited.size} pays :\n${sorted(store.visited.codes()).join('\n')}`)
  if (store.wish.size) parts.push(`Mes envies :\n${sorted(store.wish.codes()).join('\n')}`)
  const text = parts.join('\n\n')
  try {
    if (navigator.share) await navigator.share({ title: 'Mes pays', text })
    else {
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
    ['v-result', 'result'],
    ['v-result-actions', 'result'],
  ])
    $(id).hidden = view !== name
  $('v-share').hidden = view !== 'result'
  $('v-body').scrollTop = 0
}

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
  $('v-title').textContent = `${flagOf(t.code)} ${nameOf(t.code)}`
  $('v-result').innerHTML = itineraireHtml(t.itineraire, nameOf(t.code))
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

async function lancer(demande) {
  if (!trips.api.code) {
    toast('Entrez d’abord le code d’accès du serveur')
    openSettings()
    return
  }
  derniereDemande = demande
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
    const t = trips.add(code, demande, itineraire)
    tripShown = t
    $('v-result').innerHTML = itineraireHtml(itineraire, nameOf(code))
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
$('v-cancel').addEventListener('click', () => pending?.abort())
$('v-retry').addEventListener('click', () => derniereDemande && lancer(derniereDemande))
$('v-edit').addEventListener('click', () => voyageView('form'))
$('v-new').addEventListener('click', () => voyageView('form'))
$('v-close').addEventListener('click', hideModal)
$('v-delete').addEventListener('click', () => {
  if (!tripShown) return
  const removed = trips.remove(tripShown.id)
  hideModal()
  toast('Voyage supprimé', () => trips.restore(removed))
})
$('v-share').addEventListener('click', async () => {
  if (!tripShown) return
  const text = itineraireTexte(tripShown.itineraire)
  try {
    if (navigator.share) await navigator.share({ title: tripShown.itineraire.titre, text })
    else {
      await navigator.clipboard.writeText(text)
      toast('Itinéraire copié')
    }
  } catch {
    // Partage annulé.
  }
})

$('btn-settings').addEventListener('click', openSettings)
$('home-search').addEventListener('input', renderHome)
$('home-form').addEventListener('submit', (e) => {
  e.preventDefault()
  $('home-results').querySelector('button')?.click()
})

$('btn-export').addEventListener('click', async () => {
  const data = JSON.stringify(store.exportData(), null, 2)
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
    const added = store.importData(JSON.parse(await file.text()))
    renderHome()
    toast(added ? `${added} pays restauré${added > 1 ? 's' : ''}` : 'Sauvegarde déjà à jour')
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

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {})
}
