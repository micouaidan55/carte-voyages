// Préparation de voyage : appel au serveur, voyages enregistrés, affichage d'un itinéraire.

export const API_PAR_DEFAUT = 'https://carte-voyages-api.onrender.com'
const KEY_TRIPS = 'carte-voyages:voyages'
const KEY_API = 'carte-voyages:api'

export const ENVIES = [
  ['culture', '🏛️ Culture'],
  ['nature', '🌿 Nature'],
  ['gastronomie', '🍽️ Gastronomie'],
  ['plage', '🏖️ Plage'],
  ['nuit', '🌙 Sorties'],
  ['aventure', '🧗 Aventure'],
  ['shopping', '🛍️ Shopping'],
  ['famille', '👨‍👩‍👧 Enfants'],
  ['insolite', '✨ Insolite'],
]

function safeStorage() {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function read(storage, key, fallback) {
  try {
    const raw = storage?.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function write(storage, key, value) {
  try {
    storage?.setItem(key, JSON.stringify(value))
  } catch {
    // Stockage plein ou indisponible.
  }
}

export function createTrips(storage = safeStorage()) {
  let trips = read(storage, KEY_TRIPS, [])
  if (!Array.isArray(trips)) trips = []
  let api = read(storage, KEY_API, {})
  if (!api || typeof api !== 'object') api = {}

  return {
    list: () => [...trips].sort((a, b) => b.date - a.date),
    get: (id) => trips.find((t) => t.id === id) ?? null,
    add(code, demande, itineraire) {
      const trip = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, code, date: Date.now(), demande, itineraire }
      trips = [trip, ...trips]
      write(storage, KEY_TRIPS, trips)
      return trip
    },
    remove(id) {
      const trip = trips.find((t) => t.id === id) ?? null
      trips = trips.filter((t) => t.id !== id)
      write(storage, KEY_TRIPS, trips)
      return trip
    },
    restore(trip) {
      if (trips.some((t) => t.id === trip.id)) return
      trips = [...trips, trip]
      write(storage, KEY_TRIPS, trips)
    },
    get api() {
      return { url: api.url || API_PAR_DEFAUT, code: api.code || '' }
    },
    setApi(next) {
      api = { ...api, ...next }
      write(storage, KEY_API, api)
    },
  }
}

const base = (url) => url.replace(/\/+$/, '')

export async function reveiller(url) {
  const r = await fetch(`${base(url)}/api/sante`, { cache: 'no-store' })
  if (!r.ok) throw new Error('Serveur injoignable')
  return r.json()
}

export async function demanderItineraire({ url, code }, demande, signal) {
  let r
  try {
    r = await fetch(`${base(url)}/api/itineraire`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Code-Acces': code },
      body: JSON.stringify(demande),
      signal,
    })
  } catch (e) {
    if (e?.name === 'AbortError') throw e
    throw new Error('Pas de connexion au serveur. Vérifiez votre réseau.')
  }
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.erreur || `Erreur du serveur (${r.status})`)
  return data.itineraire
}

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

export function lienCarte(...termes) {
  const q = termes.filter(Boolean).join(' ')
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
}

const MOMENTS = { matin: '☀️ Matin', 'après-midi': '🌤️ Après-midi', soir: '🌙 Soir' }

// Itinéraire en HTML. Tout texte venant de Claude est échappé.
export function itineraireHtml(it, pays) {
  const jours = (it.jours ?? [])
    .map((j) => {
      const activites = (j.activites ?? [])
        .map(
          (a) => `<li class="act">
            <span class="moment">${esc(MOMENTS[a.moment] ?? a.moment)}</span>
            <strong>${esc(a.titre)}</strong>${a.duree ? ` <span class="duree">· ${esc(a.duree)}</span>` : ''}
            <p>${esc(a.detail)}</p>
          </li>`,
        )
        .join('')
      const restos = (j.restaurants ?? [])
        .map((r) => {
          const nom = r.nom || `${r.cuisine.charAt(0).toUpperCase() + r.cuisine.slice(1)} (au choix sur place)`
          const lien = lienCarte(r.nom || `${r.cuisine} restaurant`, r.quartier, pays)
          return `<li class="resto">
            <span class="moment">${r.repas === 'dîner' ? '🍷 Dîner' : '🥗 Déjeuner'}</span>
            <a href="${esc(lien)}" target="_blank" rel="noopener"><strong>${esc(nom)}</strong> ↗</a>
            <span class="duree">${esc(r.prix)} · ${esc(r.cuisine)}${r.quartier ? ' · ' + esc(r.quartier) : ''}</span>
            <p>${esc(r.pourquoi)}</p>
          </li>`
        })
        .join('')
      return `<article class="day">
        <header><span class="day-num">Jour ${esc(j.numero)}</span><span class="day-place">${esc(j.lieu)}</span></header>
        <h4>${esc(j.titre)}</h4>
        ${j.deplacement ? `<p class="move">🚆 ${esc(j.deplacement)}</p>` : ''}
        <ul class="acts">${activites}${restos}</ul>
      </article>`
    })
    .join('')

  return `<div class="trip-result">
    <h3 class="trip-title">${esc(it.titre)}</h3>
    <p class="trip-summary">${esc(it.resume)}</p>
    ${it.etapes?.length ? `<p class="steps">${it.etapes.map((e) => `<span>${esc(e)}</span>`).join('<i>→</i>')}</p>` : ''}
    ${it.budget ? `<p class="budget">💶 ${esc(it.budget)}</p>` : ''}
    ${jours}
    ${
      it.conseils?.length
        ? `<section class="tips"><h4>Bon à savoir</h4><ul>${it.conseils.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></section>`
        : ''
    }
    <p class="ai-note">Préparé par Claude (IA). Vérifiez horaires et adresses avant d’y aller.</p>
  </div>`
}

export function itineraireTexte(it) {
  const lignes = [it.titre, it.resume, '']
  for (const j of it.jours ?? []) {
    lignes.push(`Jour ${j.numero} · ${j.lieu} — ${j.titre}`)
    for (const a of j.activites ?? []) lignes.push(`  ${a.moment} : ${a.titre} (${a.duree})`)
    for (const r of j.restaurants ?? []) lignes.push(`  ${r.repas} : ${r.nom || r.cuisine} ${r.prix}${r.quartier ? ', ' + r.quartier : ''}`)
    lignes.push('')
  }
  if (it.budget) lignes.push(`Budget : ${it.budget}`)
  return lignes.join('\n')
}
