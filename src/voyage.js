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
    update(id, patch) {
      trips = trips.map((t) => (t.id === id ? { ...t, ...patch } : t))
      write(storage, KEY_TRIPS, trips)
      return trips.find((t) => t.id === id) ?? null
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

// Voyage créé sans IA : seulement la destination, pour réserver tout de suite.
export function itineraireVide(demande, capitale = '') {
  const ville = demande.ville || capitale
  return {
    titre: `${ville || demande.pays} · ${demande.jours} jour${demande.jours > 1 ? 's' : ''}`,
    resume: '',
    etapes: ville ? [ville] : [],
    jours: [],
    budget: '',
    conseils: [],
    vide: true,
  }
}

// Itinéraire en HTML. Tout texte venant de Claude (ou d'un lien d'invitation) est échappé.
// En mode édition, chaque élément a son bouton ✕ et chaque jour un petit formulaire d'ajout.
export function itineraireHtml(it, pays, { edition = false } = {}) {
  if (it.vide && !edition) {
    return `<div class="trip-result">
    <h3 class="trip-title">${esc(it.titre)}</h3>
    <p class="trip-summary">Pas encore d’itinéraire. Vous pouvez déjà réserver dans l’onglet « Réserver » et préparer le départ (onglet « Préparer »).</p>
    <button id="v-gen" class="button" type="button">✨ Préparer l’itinéraire avec Claude</button>
    <button id="plan-construire" class="button secondary" type="button">✏️ Construire le plan moi-même</button>
  </div>`
  }
  const x = (j, type, i, quoi) =>
    edition ? `<button class="plan-x" type="button" data-j="${j}" data-type="${type}" data-i="${i}" aria-label="Retirer ${esc(quoi)}">✕</button>` : ''
  const jours = (it.jours ?? [])
    .map((j, jn) => {
      const activites = (j.activites ?? [])
        .map(
          (a, i) => `<li class="act">
            ${x(jn, 'activites', i, a.titre)}<span class="moment">${esc(MOMENTS[a.moment] ?? a.moment)}</span>
            <strong>${esc(a.titre)}</strong>${a.duree ? ` <span class="duree">· ${esc(a.duree)}</span>` : ''}
            ${a.detail ? `<p>${esc(a.detail)}</p>` : ''}
          </li>`,
        )
        .join('')
      const restos = (j.restaurants ?? [])
        .map((r, i) => {
          const cuisine = r.cuisine || ''
          const nom = r.nom || `${cuisine.charAt(0).toUpperCase() + cuisine.slice(1)} (au choix sur place)`
          const lien = lienCarte(r.nom || `${cuisine} restaurant`, r.quartier, pays)
          const infos = [r.prix, cuisine, r.quartier].filter(Boolean).map(esc).join(' · ')
          return `<li class="resto">
            ${x(jn, 'restaurants', i, nom)}<span class="moment">${r.repas === 'dîner' ? '🍷 Dîner' : '🥗 Déjeuner'}</span>
            <a href="${esc(lien)}" target="_blank" rel="noopener"><strong>${esc(nom)}</strong> ↗</a>
            ${infos ? `<span class="duree">${infos}</span>` : ''}
            ${r.pourquoi ? `<p>${esc(r.pourquoi)}</p>` : ''}
          </li>`
        })
        .join('')
      const ajout = edition
        ? `<form class="plan-add" data-j="${jn}" autocomplete="off">
            <div class="plan-add-ligne">
              <select name="moment" aria-label="Moment">
                <option value="matin">☀️ Matin</option><option value="après-midi">🌤️ Après-midi</option><option value="soir">🌙 Soir</option>
                <option value="déjeuner">🥗 Déjeuner</option><option value="dîner">🍷 Dîner</option>
              </select>
              <input name="titre" class="v-input" maxlength="80" placeholder="Activité ou restaurant" aria-label="Activité ou restaurant" />
            </div>
            <input name="detail" class="v-input" maxlength="300" placeholder="Détail (facultatif)" aria-label="Détail" />
            <button class="button secondary" type="submit">＋ Ajouter au jour ${esc(j.numero)}</button>
          </form>`
        : ''
      const outils = edition
        ? `<span class="plan-jour-outils"><button class="link" type="button" data-edit-jour="${jn}">Modifier</button><button class="link danger" type="button" data-suppr-jour="${jn}">Retirer</button></span>`
        : ''
      return `<article class="day">
        <header><span class="day-num">Jour ${esc(j.numero)}</span><span class="day-place">${esc(j.lieu)}</span>${outils}</header>
        <h4>${esc(j.titre)}</h4>
        ${j.deplacement ? `<p class="move">🚆 ${esc(j.deplacement)}</p>` : ''}
        <ul class="acts">${activites}${restos}</ul>
        ${ajout}
      </article>`
    })
    .join('')

  const auteur = it.manuel ? '' : '<p class="ai-note">Préparé par Claude (IA). Vérifiez horaires et adresses avant d’y aller.</p>'
  return `<div class="trip-result${edition ? ' edition' : ''}">
    <h3 class="trip-title">${esc(it.titre)}</h3>
    ${edition ? '<p class="help">Mode modification : ajoutez ou retirez des activités, des restaurants et des jours.</p>' : '<button id="plan-edit" class="link plan-edit" type="button">✏️ Modifier le plan</button>'}
    ${it.resume ? `<p class="trip-summary">${esc(it.resume)}</p>` : ''}
    ${it.etapes?.length ? `<p class="steps">${it.etapes.map((e) => `<span>${esc(e)}</span>`).join('<i>→</i>')}</p>` : ''}
    ${it.budget ? `<p class="budget">💶 ${esc(it.budget)}</p>` : ''}
    ${jours}
    ${edition ? '<div class="buttons"><button id="plan-add-jour" class="button secondary" type="button">＋ Ajouter un jour</button><button id="plan-fini" class="button" type="button">Terminer</button></div>' : ''}
    ${
      it.conseils?.length
        ? `<section class="tips"><h4>Bon à savoir</h4><ul>${it.conseils.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></section>`
        : ''
    }
    ${auteur}
  </div>`
}

export async function lireReservation({ url, code }, texte) {
  let r
  try {
    r = await fetch(`${base(url)}/api/vols`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Code-Acces': code },
      body: JSON.stringify({ texte }),
    })
  } catch {
    throw new Error('Pas de connexion au serveur. Vérifiez votre réseau.')
  }
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.erreur || `Erreur du serveur (${r.status})`)
  return data
}

// Ajoute des trajets sans doublon (même numéro, même date de départ).
export function fusionnerTrajets(anciens = [], nouveaux = []) {
  const cle = (t) => `${t.numero}|${t.depart_date}|${t.depart_lieu}`
  const vus = new Set(anciens.map(cle))
  const ajout = nouveaux.filter((t) => {
    if (vus.has(cle(t))) return false
    vus.add(cle(t))
    return true
  })
  const tous = [...anciens, ...ajout].sort((a, b) =>
    `${a.depart_date || '9'}${a.depart_heure}`.localeCompare(`${b.depart_date || '9'}${b.depart_heure}`),
  )
  return { tous, ajoutes: ajout.length }
}

const ICONES = { avion: '✈️', train: '🚆', bus: '🚌', bateau: '⛴️' }

function dateCourte(iso) {
  if (!iso) return ''
  const d = new Date(`${iso}T12:00:00`)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
}

export function trajetsHtml(trajets) {
  return trajets
    .map((t, i) => {
      const lieu = (nom, code) => `${esc(nom)}${code ? ` <span class="iata">${esc(code)}</span>` : ''}`
      const jourSuivant = t.arrivee_date && t.depart_date && t.arrivee_date !== t.depart_date
      const suivi = t.numero
        ? `<a href="https://www.google.com/search?q=${encodeURIComponent(t.numero + ' ' + (t.depart_date || ''))}" target="_blank" rel="noopener">Suivre ↗</a>`
        : ''
      return `<article class="segment" data-i="${i}">
        <header>
          <span>${ICONES[t.type] ?? '✈️'} <strong>${esc(t.numero || t.type)}</strong>${t.compagnie ? ' · ' + esc(t.compagnie) : ''}</span>
          <button class="seg-remove" type="button" aria-label="Retirer ce trajet">✕</button>
        </header>
        <p class="seg-date">${esc(dateCourte(t.depart_date))}</p>
        <div class="seg-route">
          <div><span class="seg-time">${esc(t.depart_heure || '--:--')}</span>${lieu(t.depart_lieu, t.depart_code)}</div>
          <span class="seg-arrow">→</span>
          <div><span class="seg-time">${esc(t.arrivee_heure || '--:--')}${jourSuivant ? '<sup>+1</sup>' : ''}</span>${lieu(t.arrivee_lieu, t.arrivee_code)}</div>
        </div>
        <footer><span>${t.reference ? `Réservation <strong>${esc(t.reference)}</strong>` : ''}</span>${suivi}</footer>
      </article>`
    })
    .join('')
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
