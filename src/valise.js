// Préparation d'un voyage : listes proposées d'après la destination, la saison, le trajet et les voyageurs.
// Chaque objet : { g: partie, cat: rubrique, t: texte, ok: coché }. Tout reste modifiable ensuite.

export const PARTIES = [
  { id: 'avant', titre: 'Avant de partir', icone: '📝' },
  { id: 'acheter', titre: 'À acheter avant', icone: '🛒' },
  { id: 'sac', titre: 'Sac à dos', icone: '🎒' },
  { id: 'valise', titre: 'Valise', icone: '🧳' },
  { id: 'bebe', titre: 'Avec un bébé', icone: '👶' },
]

const UE = new Set([
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU',
  'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK', 'CH', 'NO', 'IS', 'LI', 'MC', 'SM', 'VA', 'AD',
])
const HORS_UE = (cc) => !UE.has(cc)

// Autorisations d'entrée en ligne les plus courantes pour un passeport européen.
const AUTORISATION = {
  US: 'ESTA (États-Unis) : à demander en ligne au moins 72 h avant',
  CA: 'AVE (Canada) : à demander en ligne',
  GB: 'ETA (Royaume-Uni) : à demander en ligne',
  AU: 'ETA (Australie) : à demander dans l’application officielle',
  NZ: 'NZeTA (Nouvelle-Zélande) : à demander en ligne',
}

// Saison au point d'arrivée : l'hémisphère sud a les saisons inversées.
export function saison(mois, latitude) {
  if (!mois) return null
  if (Math.abs(latitude) < 23.5) return 'tropiques'
  const m = latitude < 0 ? ((mois + 5) % 12) + 1 : mois
  if (m === 12 || m <= 2) return 'hiver'
  if (m >= 6 && m <= 8) return 'ete'
  return 'mi-saison'
}

export function genererValise({
  code,
  home,
  jours = 5,
  mois = null,
  envies = [],
  latitude = 45,
  volHeures = 0,
  autreMonnaie = false,
  bebe = false,
  enfants = false,
}) {
  const items = []
  const add = (g, cat, t) => items.push({ g, cat, t, ok: false })
  const s = saison(mois, latitude)
  const loin = home ? HORS_UE(code) || HORS_UE(home) : HORS_UE(code)
  const chaud = s === 'ete' || s === 'tropiques'
  const tenues = Math.min(jours, 7)
  const nature = envies.includes('nature') || envies.includes('aventure')
  const plage = envies.includes('plage')
  const longVol = volHeures >= 5

  // Avant de partir : démarches, dans l'ordre où il faut les faire.
  add('avant', 'Papiers', loin ? 'Vérifier le passeport (valide 6 mois après le retour)' : 'Vérifier la carte d’identité ou le passeport')
  if (AUTORISATION[code]) add('avant', 'Papiers', AUTORISATION[code])
  else if (loin) add('avant', 'Papiers', 'Vérifier s’il faut un visa')
  if (bebe || enfants) add('avant', 'Papiers', 'Papiers d’identité des enfants (et autorisation de sortie si un seul parent)')
  add('avant', 'Papiers', 'Copie des papiers sur le téléphone et dans le cloud')
  if (loin || s === 'tropiques') add('avant', 'Santé', 'Voir le médecin un mois avant (vaccins, traitements)')
  add('avant', 'Santé', loin ? 'Souscrire une assurance voyage' : 'Commander la carte européenne d’assurance maladie')
  add('avant', 'Argent', 'Prévenir sa banque et vérifier le plafond de la carte')
  if (autreMonnaie) add('avant', 'Argent', 'Prévoir un peu d’argent liquide sur place')
  add('avant', 'Téléphone', loin ? 'Prendre une eSIM ou une option internet à l’étranger' : 'Vérifier son forfait à l’étranger')
  add('avant', 'Téléphone', 'Télécharger les cartes hors ligne et les billets')
  if (loin && home === 'FR') add('avant', 'Sécurité', 'S’inscrire sur Ariane (France Diplomatie)')
  add('avant', 'Maison', 'Faire garder les animaux et arroser les plantes')
  add('avant', 'Maison', 'Vider le frigo, sortir les poubelles, couper l’eau')
  add('avant', 'Départ', 'Enregistrement en ligne 24 à 48 h avant le vol')
  add('avant', 'Départ', 'Peser la valise')

  // À acheter avant.
  if (loin) add('acheter', 'Pratique', 'Adaptateur de prise')
  add('acheter', 'Pratique', 'Flacons de voyage (100 ml maximum en cabine)')
  add('acheter', 'Pratique', 'Cadenas pour la valise')
  if (longVol) add('acheter', 'Pratique', 'Coussin de voyage, masque et bouchons d’oreilles')
  if (s !== 'hiver' || plage) add('acheter', 'Soleil', 'Crème solaire')
  if (chaud || plage) add('acheter', 'Soleil', 'Lunettes de soleil')
  if (s === 'tropiques' || loin) add('acheter', 'Santé', 'Anti-moustiques')
  if (s === 'tropiques') add('acheter', 'Santé', 'Médicament contre la diarrhée, pastilles pour l’eau')
  add('acheter', 'Santé', 'Pansements, antidouleur, désinfectant')
  if (nature) add('acheter', 'Nature', 'Lampe frontale')
  if (plage) add('acheter', 'Plage', 'Sac étanche pour le téléphone')

  // Sac à dos : ce qui reste avec soi pendant le trajet.
  add('sac', 'Papiers', loin ? 'Passeport' : 'Carte d’identité ou passeport')
  add('sac', 'Papiers', 'Billets et réservations')
  add('sac', 'Papiers', 'Carte bancaire et un peu de liquide')
  add('sac', 'Papiers', 'Stylo (formulaires d’arrivée)')
  add('sac', 'Électronique', 'Téléphone et chargeur')
  add('sac', 'Électronique', 'Batterie externe (interdite en soute)')
  add('sac', 'Électronique', 'Écouteurs')
  add('sac', 'Confort', 'Médicaments habituels (avec l’ordonnance)')
  add('sac', 'Confort', 'Liquides dans un sac transparent')
  add('sac', 'Confort', 'Gourde vide (à remplir après la sécurité)')
  add('sac', 'Confort', 'En-cas')
  add('sac', 'Confort', 'Pull ou veste pour le trajet')
  if (longVol) add('sac', 'Confort', 'Une tenue de rechange')
  if (enfants) add('sac', 'Enfants', 'Jeux, livres et goûters pour le trajet')

  // Valise.
  add('valise', 'Vêtements', `${tenues} tenues de jour`)
  add('valise', 'Vêtements', `${tenues + 1} sous-vêtements et chaussettes`)
  add('valise', 'Vêtements', 'Pyjama')
  add('valise', 'Vêtements', 'Chaussures confortables pour marcher')
  if (s === 'hiver') {
    add('valise', 'Vêtements', 'Manteau chaud, bonnet, gants')
    add('valise', 'Vêtements', 'Pull ou polaire')
  } else if (chaud) {
    add('valise', 'Vêtements', 'Vêtements légers')
    add('valise', 'Vêtements', 'Chapeau ou casquette')
  } else {
    add('valise', 'Vêtements', 'Veste légère et pull')
    add('valise', 'Vêtements', 'Imperméable')
  }
  if (plage || s === 'tropiques') {
    add('valise', 'Vêtements', 'Maillot de bain')
    add('valise', 'Vêtements', 'Sandales')
  }
  if (nature) {
    add('valise', 'Vêtements', 'Chaussures de randonnée')
    add('valise', 'Vêtements', 'Sac à dos de journée')
  }
  if (envies.includes('nuit') || envies.includes('gastronomie')) add('valise', 'Vêtements', 'Une tenue pour sortir le soir')
  add('valise', 'Toilette', 'Brosse à dents et dentifrice')
  add('valise', 'Toilette', 'Gel douche et shampoing')
  add('valise', 'Toilette', 'Déodorant')
  add('valise', 'Toilette', 'Trousse de secours')
  if (envies.includes('aventure') || nature) add('valise', 'Divers', 'Permis de conduire')
  if (jours >= 3) add('valise', 'Divers', 'Petit sac pour le linge sale')
  if (plage) add('valise', 'Divers', 'Serviette de plage')
  if (enfants) add('valise', 'Divers', 'Jeux et doudous des enfants')

  if (bebe) {
    const couches = Math.max(6, jours * 6)
    add('bebe', 'Papiers', 'Carnet de santé')
    add('bebe', 'Trajet', 'Biberon ou tétine au décollage et à l’atterrissage')
    add('bebe', 'Trajet', 'Sac à langer : couches, lingettes, change complet')
    add('bebe', 'Trajet', 'Lait et eau (autorisés en cabine pour bébé)')
    add('bebe', 'Repas', 'Biberons, lait en poudre ou petits pots')
    add('bebe', 'Repas', 'Bavoirs et cuillère')
    add('bebe', 'Change', `Couches (environ ${couches})`)
    add('bebe', 'Change', 'Lingettes et liniment')
    add('bebe', 'Change', 'Matelas à langer pliable')
    add('bebe', 'Santé', 'Sérum physiologique, thermomètre, paracétamol pour bébé')
    if (s !== 'hiver') add('bebe', 'Santé', 'Crème solaire bébé et chapeau')
    add('bebe', 'Vêtements', `${Math.min(jours, 7) * 2} bodies et pyjamas`)
    add('bebe', 'Sommeil', 'Doudou, tétines, gigoteuse')
    add('bebe', 'Sommeil', 'Lit parapluie (ou le demander à l’hébergement)')
    add('bebe', 'Balade', 'Poussette canne ou porte-bébé')
    add('bebe', 'Balade', 'Siège auto (ou le réserver avec la voiture)')
  }
  return items
}

// Garde ce qui était coché et les ajouts de l'utilisateur quand la liste est refaite.
export function fusionnerValise(ancienne = [], nouvelle = []) {
  const coches = new Set(ancienne.filter((i) => i.ok).map((i) => i.t))
  const textes = new Set(nouvelle.map((i) => i.t))
  const ajouts = ancienne.filter((i) => i.cat === 'Mes ajouts' && !textes.has(i.t)).map((i) => ({ g: 'valise', ...i }))
  return [...nouvelle.map((i) => ({ ...i, ok: coches.has(i.t) })), ...ajouts]
}

export function progression(items) {
  const total = items.length
  const ok = items.filter((i) => i.ok).length
  return { total, ok, pct: total ? Math.round((ok / total) * 100) : 0 }
}
