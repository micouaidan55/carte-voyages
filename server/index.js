// Petit serveur qui prépare des itinéraires avec Claude pour l'application Mes pays.
// Variables d'environnement :
//   ANTHROPIC_API_KEY   clé de l'API Claude (obligatoire)
//   CODE_ACCES          code à saisir dans l'application (obligatoire)
//   LIMITE_JOUR         nombre maximum d'itinéraires par jour (défaut 20)
//   ORIGINES            adresses autorisées, séparées par des virgules
//   PORT                port d'écoute (fourni par Render)
import http from 'node:http'
import { timingSafeEqual } from 'node:crypto'
import Anthropic from '@anthropic-ai/sdk'
import { FORMAT, SYSTEM, consigne, validerDemande, verifierItineraire } from './itineraire.js'
import { FORMAT_VOLS, SYSTEM_VOLS, consigneVols, nettoyerTrajets, validerTexte } from './vols.js'

const PORT = Number(process.env.PORT) || 8787
const CODE = process.env.CODE_ACCES ?? ''
const LIMITE = Number(process.env.LIMITE_JOUR) || 20
const ORIGINES = (process.env.ORIGINES ?? 'https://micouaidan55.github.io')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)
const SIMULATION = process.env.SIMULATION === '1' // pour tester sans appeler Claude

const client = SIMULATION ? null : new Anthropic()

let jour = ''
let compteur = 0

function quota() {
  const aujourdhui = new Date().toISOString().slice(0, 10)
  if (aujourdhui !== jour) {
    jour = aujourdhui
    compteur = 0
  }
  return LIMITE - compteur
}

function codeValide(recu) {
  if (!CODE || typeof recu !== 'string') return false
  const a = Buffer.from(recu)
  const b = Buffer.from(CODE)
  return a.length === b.length && timingSafeEqual(a, b)
}

function origineAutorisee(origin) {
  if (!origin) return null
  if (ORIGINES.includes(origin)) return origin
  if (/^http:\/\/(localhost|127\.0\.0\.1|\d+\.\d+\.\d+\.\d+)(:\d+)?$/.test(origin)) return origin
  return null
}

function repondre(res, status, data, origin) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin
    headers.Vary = 'Origin'
  }
  res.writeHead(status, headers)
  res.end(JSON.stringify(data))
}

async function lireCorps(req) {
  let taille = 0
  const morceaux = []
  for await (const morceau of req) {
    taille += morceau.length
    if (taille > 200_000) throw new Error('Demande trop longue')
    morceaux.push(morceau)
  }
  return JSON.parse(Buffer.concat(morceaux).toString('utf8') || '{}')
}

async function demanderAClaude(demande) {
  if (SIMULATION) return simulation(demande)
  const stream = client.beta.messages.stream({
    model: 'claude-opus-5-5',
    max_tokens: 32000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: FORMAT } },
    system: SYSTEM,
    messages: [{ role: 'user', content: consigne(demande) }],
  })
  const message = await stream.finalMessage()
  if (message.stop_reason === 'refusal') throw new Error('Claude n’a pas pu préparer ce voyage')
  if (message.stop_reason === 'max_tokens') throw new Error('Voyage trop long à préparer, essayez moins de jours')
  const texte = message.content.find((b) => b.type === 'text')?.text
  console.log(
    `itinéraire ${demande.pays} ${demande.jours} j : ${message.usage.input_tokens} entrée, ${message.usage.output_tokens} sortie`,
  )
  return verifierItineraire(JSON.parse(texte ?? ''), demande.jours)
}

async function lireReservation(texte) {
  if (SIMULATION) {
    return nettoyerTrajets({
      trajets: [
        { type: 'avion', compagnie: 'Air France', numero: 'AF 276', depart_lieu: 'Paris', depart_code: 'CDG', depart_date: '2027-05-12', depart_heure: '10:25', arrivee_lieu: 'Tokyo', arrivee_code: 'HND', arrivee_date: '2027-05-13', arrivee_heure: '06:05', reference: 'ABC123' },
      ],
      remarque: 'simulation',
    })
  }
  const stream = client.beta.messages.stream({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema: FORMAT_VOLS } },
    system: SYSTEM_VOLS,
    messages: [{ role: 'user', content: consigneVols(texte) }],
  })
  const message = await stream.finalMessage()
  if (message.stop_reason === 'refusal') throw new Error('Claude n’a pas pu lire cet e-mail')
  const brut = message.content.find((b) => b.type === 'text')?.text
  console.log(`réservation lue : ${message.usage.input_tokens} entrée, ${message.usage.output_tokens} sortie`)
  return nettoyerTrajets(JSON.parse(brut ?? '{}'))
}

function simulation(d) {
  return {
    titre: `${d.jours} jours en ${d.pays} (simulation)`,
    resume: 'Itinéraire de test, sans appel à Claude.',
    etapes: [d.ville || 'Capitale'],
    jours: Array.from({ length: d.jours }, (_, i) => ({
      numero: i + 1,
      titre: `Jour ${i + 1}`,
      lieu: d.ville || 'Capitale',
      activites: [
        { moment: 'matin', titre: 'Vieille ville', detail: 'Balade à pied.', duree: '3 h' },
        { moment: 'après-midi', titre: 'Musée national', detail: 'Arriver tôt.', duree: '2 h' },
      ],
      restaurants: [
        { repas: 'déjeuner', nom: '', cuisine: 'locale', prix: '€', quartier: 'centre', pourquoi: 'Plat du jour.' },
        { repas: 'dîner', nom: 'Chez Test', cuisine: 'traditionnelle', prix: '€€', quartier: 'port', pourquoi: 'Poisson grillé.' },
      ],
      deplacement: i ? 'À pied' : '',
    })),
    budget: 'environ 90 € par jour',
    conseils: ['Conseil de test.'],
  }
}

const serveur = http.createServer(async (req, res) => {
  const origin = origineAutorisee(req.headers.origin)
  const url = new URL(req.url, 'http://x')

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': origin ?? 'null',
      'Access-Control-Allow-Methods': 'GET, POST',
      'Access-Control-Allow-Headers': 'Content-Type, X-Code-Acces',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    })
    return res.end()
  }

  // Sert aussi à réveiller le serveur (Render gratuit s'endort après 15 min).
  if (req.method === 'GET' && url.pathname === '/api/sante') {
    return repondre(res, 200, { ok: true, restant: quota(), configure: Boolean(CODE) }, origin)
  }

  if (req.method === 'POST' && url.pathname === '/api/itineraire') {
    if (!codeValide(req.headers['x-code-acces'])) return repondre(res, 401, { erreur: 'Code d’accès incorrect' }, origin)
    if (quota() <= 0) return repondre(res, 429, { erreur: `Limite de ${LIMITE} voyages par jour atteinte` }, origin)
    let demande
    try {
      demande = validerDemande(await lireCorps(req))
    } catch (e) {
      return repondre(res, 400, { erreur: e instanceof SyntaxError ? 'Demande illisible' : e.message }, origin)
    }
    compteur++
    try {
      return repondre(res, 200, { itineraire: await demanderAClaude(demande), restant: quota() }, origin)
    } catch (e) {
      console.error('échec itinéraire', e?.status ?? '', e?.message)
      const message =
        e instanceof Anthropic.RateLimitError
          ? 'Claude est très demandé, réessayez dans une minute'
          : e instanceof Anthropic.AuthenticationError
            ? 'Clé Claude invalide sur le serveur'
            : e instanceof Anthropic.APIError
              ? 'Claude ne répond pas, réessayez'
              : e.message || 'Erreur inconnue'
      return repondre(res, 502, { erreur: message }, origin)
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/vols') {
    if (!codeValide(req.headers['x-code-acces'])) return repondre(res, 401, { erreur: 'Code d’accès incorrect' }, origin)
    if (quota() <= 0) return repondre(res, 429, { erreur: `Limite de ${LIMITE} demandes par jour atteinte` }, origin)
    let texte
    try {
      texte = validerTexte(await lireCorps(req))
    } catch (e) {
      return repondre(res, 400, { erreur: e instanceof SyntaxError ? 'Demande illisible' : e.message }, origin)
    }
    compteur++
    try {
      return repondre(res, 200, { ...(await lireReservation(texte)), restant: quota() }, origin)
    } catch (e) {
      console.error('échec lecture réservation', e?.status ?? '', e?.message)
      const message = e instanceof Anthropic.APIError ? 'Claude ne répond pas, réessayez' : 'Impossible de lire cet e-mail'
      return repondre(res, 502, { erreur: message }, origin)
    }
  }

  repondre(res, 404, { erreur: 'Introuvable' }, origin)
})

serveur.listen(PORT, () => {
  console.log(`Serveur d'itinéraires prêt sur le port ${PORT}${SIMULATION ? ' (simulation)' : ''}`)
  if (!CODE) console.warn('CODE_ACCES n’est pas défini : toutes les demandes seront refusées.')
})
