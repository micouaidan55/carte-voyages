// Réservation : liens préremplis vers les sites qui vendent vols, hébergements et activités.
// Le paiement se fait sur ces sites ; l'application ne garde que les dates et ce qui est déjà réservé.

const enc = encodeURIComponent

// Ajoute n jours à une date AAAA-MM-JJ (en UTC, sans souci d'heure d'été).
export function plusJours(date, n) {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// Date de départ proposée : le 15 du mois choisi (le prochain), sinon dans un mois.
export function departPropose(mois, aujourdhui = new Date()) {
  const y = aujourdhui.getFullYear()
  const today = aujourdhui.toISOString().slice(0, 10)
  if (mois) {
    let d = `${y}-${String(mois).padStart(2, '0')}-15`
    if (d <= today) d = `${y + 1}-${String(mois).padStart(2, '0')}-15`
    return d
  }
  return plusJours(today, 30)
}

export function lienVols({ depuis, vers, aller, retour, adultes = 2 }) {
  const q = `Flights from ${depuis} to ${vers} on ${aller}${retour ? ` through ${retour}` : ''} for ${adultes} adults`
  return `https://www.google.com/travel/flights?q=${enc(q)}&hl=fr&curr=EUR`
}

export function lienTrain({ depuis, vers }) {
  return `https://www.google.com/maps/dir/?api=1&origin=${enc(depuis)}&destination=${enc(vers)}&travelmode=transit`
}

export function lienBooking({ ville, pays, arrivee, depart, adultes = 2 }) {
  const p = new URLSearchParams({
    ss: [ville, pays].filter(Boolean).join(', '),
    checkin: arrivee,
    checkout: depart,
    group_adults: String(adultes),
    no_rooms: '1',
    group_children: '0',
  })
  return `https://www.booking.com/searchresults.fr.html?${p}`
}

export function lienAirbnb({ ville, pays, arrivee, depart, adultes = 2 }) {
  const lieu = [ville, pays].filter(Boolean).join('--').replace(/\s+/g, '-')
  const p = new URLSearchParams({ checkin: arrivee, checkout: depart, adults: String(adultes) })
  return `https://www.airbnb.fr/s/${enc(lieu)}/homes?${p}`
}

export function lienActivite({ titre, lieu, date }) {
  const p = new URLSearchParams({ q: [titre, lieu].filter(Boolean).join(' ') })
  if (date) {
    p.set('date_from', date)
    p.set('date_to', date)
  }
  return `https://www.getyourguide.fr/s/?${p}`
}

export function lienTable({ nom, quartier, lieu }) {
  return `https://www.google.com/search?q=${enc(['réserver', nom, quartier, lieu].filter(Boolean).join(' '))}`
}

// Une nuit par étape : on regarde quels jours de l'itinéraire se passent dans chaque ville.
export function sejours(it, aller, nbJours) {
  const etapes = (it?.etapes ?? []).filter(Boolean)
  const jours = it?.jours ?? []
  const total = nbJours || jours.length || 1
  if (etapes.length <= 1) return [{ ville: etapes[0] ?? '', arrivee: aller, depart: plusJours(aller, total) }]
  const norm = (s) => String(s ?? '').toLowerCase()
  const res = []
  let suivant = 0
  for (const ville of etapes) {
    const idx = jours.map((j, i) => (norm(j.lieu).includes(norm(ville)) ? i : -1)).filter((i) => i >= suivant)
    if (!idx.length) continue
    const debut = Math.max(idx[0], suivant)
    let fin = idx[idx.length - 1] + 1
    res.push({ ville, arrivee: plusJours(aller, debut), depart: plusJours(aller, fin) })
    suivant = fin
  }
  if (!res.length) return [{ ville: etapes[0], arrivee: aller, depart: plusJours(aller, total) }]
  // La dernière étape va jusqu'au retour.
  res[res.length - 1].depart = plusJours(aller, total)
  return res
}

// Liste de tout ce qui peut se réserver pour un voyage.
export function aReserver({ it, pays, depuis, ville, aller, jours, adultes = 2, avion = true }) {
  const retour = plusJours(aller, jours)
  const vers = ville || it?.etapes?.[0] || pays
  const items = []
  if (depuis) {
    items.push({
      cle: 'vol',
      cat: 'Transport',
      titre: avion ? `Vol ${depuis} → ${vers}` : `Train ${depuis} → ${vers}`,
      detail: `aller-retour, ${dateCourte(aller)} – ${dateCourte(retour)}`,
      liens: avion
        ? [{ nom: 'Google Vols', url: lienVols({ depuis, vers, aller, retour, adultes }) }]
        : [
            { nom: 'Horaires', url: lienTrain({ depuis, vers }) },
            { nom: 'Google Vols', url: lienVols({ depuis, vers, aller, retour, adultes }) },
          ],
    })
  }
  for (const s of sejours(it, aller, jours)) {
    const v = s.ville || vers
    const nuits = Math.round((Date.parse(s.depart) - Date.parse(s.arrivee)) / 86400000)
    if (nuits < 1) continue
    const args = { ville: v, pays, arrivee: s.arrivee, depart: s.depart, adultes }
    items.push({
      cle: `hotel|${v}`,
      cat: 'Hébergement',
      titre: `Hébergement à ${v}`,
      detail: `${nuits} nuit${nuits > 1 ? 's' : ''}, ${dateCourte(s.arrivee)} – ${dateCourte(s.depart)}`,
      liens: [
        { nom: 'Booking', url: lienBooking(args) },
        { nom: 'Airbnb', url: lienAirbnb(args) },
      ],
    })
  }
  const vues = new Set()
  for (const [i, j] of (it?.jours ?? []).entries()) {
    const date = plusJours(aller, i)
    for (const a of j.activites ?? []) {
      const cle = `act|${a.titre}`
      if (!a.titre || vues.has(cle)) continue
      vues.add(cle)
      items.push({
        cle,
        cat: 'Activités',
        titre: a.titre,
        detail: `Jour ${j.numero ?? i + 1} · ${j.lieu || vers}`,
        liens: [{ nom: 'Billets', url: lienActivite({ titre: a.titre, lieu: j.lieu || vers, date }) }],
      })
    }
    for (const r of j.restaurants ?? []) {
      const cle = `resto|${r.nom}`
      if (!r.nom || vues.has(cle)) continue
      vues.add(cle)
      items.push({
        cle,
        cat: 'Restaurants',
        titre: r.nom,
        detail: `Jour ${j.numero ?? i + 1} · ${r.repas}${r.quartier ? ` · ${r.quartier}` : ''}`,
        liens: [{ nom: 'Réserver', url: lienTable({ nom: r.nom, quartier: r.quartier, lieu: j.lieu || vers }) }],
      })
    }
  }
  return items
}

function dateCourte(d) {
  return new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}
