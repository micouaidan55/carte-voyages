// Inviter des amis à un voyage : tout le voyage tient dans le lien (après le #, jamais envoyé à un serveur).
import { fusionnerTrajets } from './voyage.js'
import { fusionnerPlans } from './plan.js'

export const CLE_LIEN = 'invitation'
const MAX = 200_000 // caractères de JSON au plus, pour refuser un lien piégé

const b64url = (bytes) => {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const deB64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))

async function passer(bytes, flux) {
  const sortie = new Blob([bytes]).stream().pipeThrough(flux)
  return new Uint8Array(await new Response(sortie).arrayBuffer())
}

// Ce qui part dans le lien : le voyage entier, sans rien de propre au téléphone.
export async function encoderVoyage(trip) {
  const json = new TextEncoder().encode(JSON.stringify({ v: 1, t: trip }))
  if (typeof CompressionStream === 'function') {
    try {
      return 'z' + b64url(await passer(json, new CompressionStream('deflate-raw')))
    } catch {
      // Compression indisponible : lien plus long mais valable.
    }
  }
  return 'j' + b64url(json)
}

export async function decoderVoyage(code) {
  if (typeof code !== 'string' || code.length > MAX) throw new Error('Lien trop long')
  let bytes = deB64url(code.slice(1))
  if (code[0] === 'z') {
    const lecteur = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader()
    const morceaux = []
    let taille = 0
    for (;;) {
      const { done, value } = await lecteur.read()
      if (done) break
      taille += value.length
      if (taille > MAX * 4) throw new Error('Lien trop long')
      morceaux.push(value)
    }
    bytes = new Uint8Array(await new Blob(morceaux).arrayBuffer())
  } else if (code[0] !== 'j') throw new Error('Lien inconnu')
  const data = JSON.parse(new TextDecoder().decode(bytes))
  if (data?.v !== 1) throw new Error('Lien d’une version plus récente de l’application')
  return data.t
}

const estObjet = (x) => x && typeof x === 'object' && !Array.isArray(x)
const texte = (x, max = 500) => (typeof x === 'string' ? x.slice(0, max) : typeof x === 'number' ? String(x) : '')
const liste = (x, max = 300) => (Array.isArray(x) ? x.filter(estObjet).slice(0, max) : [])

// Le contenu vient d'un lien : on garde seulement ce qui a la bonne forme.
export function nettoyerVoyage(t, paysValides) {
  if (!estObjet(t) || typeof t.id !== 'string' || !/^[\w-]{1,40}$/.test(t.id)) return null
  if (typeof t.code !== 'string' || !paysValides.has(t.code)) return null
  if (!estObjet(t.itineraire) || !Array.isArray(t.itineraire.jours)) return null
  const it = t.itineraire
  const propre = {
    id: t.id,
    code: t.code,
    date: Number.isFinite(t.date) ? t.date : Date.now(),
    demande: estObjet(t.demande) ? t.demande : {},
    itineraire: {
      ...it,
      titre: texte(it.titre, 120) || 'Voyage',
      etapes: Array.isArray(it.etapes) ? it.etapes.map((e) => texte(e, 80)).filter(Boolean) : [],
      jours: liste(it.jours, 60).map((j) => ({
        ...j,
        activites: liste(j.activites, 20),
        restaurants: liste(j.restaurants, 10).map((r) => ({ ...r, cuisine: texte(r.cuisine, 80), nom: texte(r.nom, 120) })),
      })),
      conseils: Array.isArray(it.conseils) ? it.conseils.map((c) => texte(c)).filter(Boolean) : [],
    },
  }
  if (Array.isArray(t.valise))
    propre.valise = liste(t.valise, 400)
      .map((i) => ({ g: texte(i.g, 20) || 'valise', cat: texte(i.cat, 60), t: texte(i.t, 120), ok: i.ok === true }))
      .filter((i) => i.t)
  if (Array.isArray(t.vols)) propre.vols = liste(t.vols, 40)
  if (estObjet(t.reserver))
    propre.reserver = {
      depart: /^\d{4}-\d{2}-\d{2}$/.test(t.reserver.depart) ? t.reserver.depart : undefined,
      adultes: Math.min(9, Math.max(1, Number(t.reserver.adultes) || 1)),
      faits: estObjet(t.reserver.faits) ? Object.fromEntries(Object.keys(t.reserver.faits).map((k) => [k, true])) : {},
    }
  if (estObjet(t.prep)) propre.prep = { bebe: t.prep.bebe === true, enfants: t.prep.enfants === true }
  if (Array.isArray(t.participants)) propre.participants = [...new Set(t.participants.map((n) => texte(n, 20)).filter(Boolean))].slice(0, 12)
  if (Array.isArray(t.depenses))
    propre.depenses = liste(t.depenses, 2000)
      .filter((d) => typeof d.id === 'string' && Number.isFinite(d.montant) && typeof d.devise === 'string')
      .map((d) => {
        const p = { ...d, note: texte(d.note, 60), date: texte(d.date, 10), cat: texte(d.cat, 20) }
        if (!(typeof d.par === 'string' && Array.isArray(d.pour) && d.pour.length)) {
          delete p.par
          delete p.pour
          delete p.remb
        }
        return p
      })
  if (Number.isFinite(t.budgetPrevu)) propre.budgetPrevu = t.budgetPrevu
  return propre
}

// Met à jour sa copie avec celle d'un ami sans rien perdre : on additionne,
// les cases cochées d'un côté restent cochées, les dépenses des deux côtés sont gardées.
export function fusionnerVoyage(local, recu) {
  if (!local) return recu
  const out = { ...local, ...recu, date: local.date }
  out.itineraire = fusionnerPlans(local.itineraire, recu.itineraire)

  if (local.valise || recu.valise) {
    const cle = (i) => `${i.g}|${i.t}`
    const coches = new Set([...(local.valise ?? []), ...(recu.valise ?? [])].filter((i) => i.ok).map(cle))
    const vus = new Set()
    out.valise = [...(recu.valise ?? []), ...(local.valise ?? [])]
      .filter((i) => !vus.has(cle(i)) && vus.add(cle(i)))
      .map((i) => ({ ...i, ok: coches.has(cle(i)) }))
  }
  if (local.vols || recu.vols) out.vols = fusionnerTrajets(local.vols ?? [], recu.vols ?? []).tous
  if (local.reserver || recu.reserver)
    out.reserver = {
      ...local.reserver,
      ...recu.reserver,
      depart: recu.reserver?.depart || local.reserver?.depart,
      faits: { ...local.reserver?.faits, ...recu.reserver?.faits },
    }
  if (local.participants || recu.participants) out.participants = [...new Set([...(local.participants ?? []), ...(recu.participants ?? [])])]
  if (local.depenses || recu.depenses) {
    const parId = new Map((local.depenses ?? []).map((d) => [d.id, d]))
    for (const d of recu.depenses ?? []) parId.set(d.id, d)
    out.depenses = [...parId.values()]
  }
  if (recu.budgetPrevu == null && local.budgetPrevu != null) out.budgetPrevu = local.budgetPrevu
  return out
}
