// Dates limites des démarches, compte à rebours et fichier calendrier (.ics) d'un voyage.
import { plusJours } from './reserver.js'

// Combien de jours avant le départ faire chaque démarche (d'après le début du texte).
const DELAIS = [
  [/^Vérifier le passeport|^Vérifier la carte d’identité/, 60],
  [/^Vérifier s’il faut un visa/, 60],
  [/^Papiers d’identité des enfants/, 45],
  [/^(ESTA|AVE|ETA|NZeTA)/, 21],
  [/^Voir le médecin/, 30],
  [/^Commander la carte européenne/, 21],
  [/^Souscrire une assurance/, 14],
  [/^Faire garder les animaux/, 14],
  [/^Prévenir sa banque/, 7],
  [/^Prendre une eSIM|^Vérifier son forfait/, 7],
  [/^Copie des papiers/, 7],
  [/^S’inscrire sur Ariane/, 3],
  [/^Prévoir un peu d’argent liquide/, 3],
  [/^Télécharger les cartes/, 2],
  [/^Enregistrement en ligne/, 1],
  [/^Peser la valise|^Vider le frigo/, 1],
]

export function joursAvant(texte) {
  for (const [re, j] of DELAIS) if (re.test(texte)) return j
  return null
}

export function aujourdhui(now = new Date()) {
  const d = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
  return d.toISOString().slice(0, 10)
}

export function joursEntre(a, b) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000)
}

// Date limite et état d'une démarche : 'fait', 'retard', 'urgent' (moins de 3 jours) ou 'plus-tard'.
export function echeance(item, depart, today) {
  const j = joursAvant(item.t)
  if (j == null || !depart) return null
  const date = plusJours(depart, -j)
  const reste = joursEntre(today, date)
  const etat = item.ok ? 'fait' : reste < 0 ? 'retard' : reste <= 3 ? 'urgent' : 'plus-tard'
  return { date, reste, etat }
}

export function compteARebours(depart, retour, today) {
  if (!depart) return null
  const avant = joursEntre(today, depart)
  if (avant > 1) return `Départ dans ${avant} jours`
  if (avant === 1) return 'Départ demain'
  if (avant === 0) return 'Départ aujourd’hui'
  if (retour && joursEntre(today, retour) >= 0) return 'Bon voyage !'
  return 'Voyage terminé'
}

// Démarches non faites dont la date est arrivée (ou dépassée).
export function aFaireMaintenant(items, depart, today) {
  return items.filter((i) => {
    const e = echeance(i, depart, today)
    return e && (e.etat === 'retard' || e.etat === 'urgent')
  })
}

const icsTexte = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1')
const icsDate = (d) => d.replaceAll('-', '')

// Plie les longues lignes comme le demande le format (60 caractères : moins de 75 octets même accentués).
function plier(ligne) {
  const c = Array.from(ligne)
  const out = [c.slice(0, 60).join('')]
  for (let i = 60; i < c.length; i += 59) out.push(' ' + c.slice(i, i + 59).join(''))
  return out.join('\r\n')
}

export function icsVoyage({ id, titre, lieu, depart, retour, vols = [], rappels = [], now = new Date() }) {
  const stamp = now.toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z'
  const ev = []
  const add = (uid, lignes) => ev.push(['BEGIN:VEVENT', `UID:${uid}@mes-pays`, `DTSTAMP:${stamp}`, ...lignes, 'END:VEVENT'])
  add(`${id}-voyage`, [
    `DTSTART;VALUE=DATE:${icsDate(depart)}`,
    `DTEND;VALUE=DATE:${icsDate(plusJours(retour, 1))}`,
    `SUMMARY:${icsTexte(`✈️ ${titre}`)}`,
    ...(lieu ? [`LOCATION:${icsTexte(lieu)}`] : []),
    'TRANSP:TRANSPARENT',
  ])
  vols.forEach((v, i) => {
    if (!v.depart_date) return
    const debut = v.depart_heure ? `DTSTART:${icsDate(v.depart_date)}T${v.depart_heure.replace(':', '')}00` : `DTSTART;VALUE=DATE:${icsDate(v.depart_date)}`
    const finDate = v.arrivee_date || v.depart_date
    const fin =
      v.depart_heure && v.arrivee_heure
        ? `DTEND:${icsDate(finDate)}T${v.arrivee_heure.replace(':', '')}00`
        : `DTEND;VALUE=DATE:${icsDate(plusJours(v.depart_date, 1))}`
    add(`${id}-trajet-${i}`, [
      debut,
      fin,
      `SUMMARY:${icsTexte(`${v.numero || v.compagnie || 'Trajet'} ${v.depart_code || v.depart_lieu} → ${v.arrivee_code || v.arrivee_lieu}`)}`,
      `DESCRIPTION:${icsTexte([v.compagnie, v.reference && `Réservation ${v.reference}`, 'Heures locales.'].filter(Boolean).join('\n'))}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'DESCRIPTION:Départ dans 3 heures',
      'TRIGGER:-PT3H',
      'END:VALARM',
    ])
  })
  rappels.forEach((r, i) => {
    add(`${id}-rappel-${i}`, [
      `DTSTART;VALUE=DATE:${icsDate(r.date)}`,
      `DTEND;VALUE=DATE:${icsDate(plusJours(r.date, 1))}`,
      `SUMMARY:${icsTexte(`À faire : ${r.t}`)}`,
      'TRANSP:TRANSPARENT',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${icsTexte(r.t)}`,
      'TRIGGER:PT9H',
      'END:VALARM',
    ])
  })
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Mes pays//FR', 'CALSCALE:GREGORIAN', ...ev.flat(), 'END:VCALENDAR']
    .map(plier)
    .join('\r\n')
}
