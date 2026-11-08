// Liste de valise proposée d'après le voyage (durée, saison, envies), modifiable ensuite.

const HORS_UE = (cc) => !UE.has(cc)
const UE = new Set([
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU',
  'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK', 'CH', 'NO', 'IS', 'LI', 'MC', 'SM', 'VA', 'AD',
])

// Saison au point d'arrivée : l'hémisphère sud a les saisons inversées.
export function saison(mois, latitude) {
  if (!mois) return null
  if (Math.abs(latitude) < 23.5) return 'tropiques'
  const m = latitude < 0 ? ((mois + 5) % 12) + 1 : mois
  if (m === 12 || m <= 2) return 'hiver'
  if (m >= 6 && m <= 8) return 'ete'
  return 'mi-saison'
}

export function genererValise({ code, home, jours = 5, mois = null, envies = [], latitude = 45 }) {
  const items = []
  const add = (cat, t) => items.push({ cat, t, ok: false })
  const s = saison(mois, latitude)
  const loin = home ? HORS_UE(code) || HORS_UE(home) : HORS_UE(code)
  const tenues = Math.min(jours, 7)

  add('Papiers', loin ? 'Passeport (valide 6 mois après le retour)' : 'Carte d’identité ou passeport')
  if (loin) add('Papiers', 'Visa ou autorisation d’entrée si nécessaire')
  add('Papiers', 'Billets et réservations')
  add('Papiers', 'Carte bancaire (prévenir sa banque)')
  add('Papiers', loin ? 'Assurance voyage' : 'Carte européenne d’assurance maladie')
  if (envies.includes('aventure') || envies.includes('nature')) add('Papiers', 'Permis de conduire')

  add('Vêtements', `${tenues} tenues de jour`)
  add('Vêtements', `${tenues + 1} sous-vêtements et chaussettes`)
  add('Vêtements', 'Pyjama')
  add('Vêtements', 'Chaussures confortables pour marcher')
  if (s === 'hiver') {
    add('Vêtements', 'Manteau chaud, bonnet, gants')
    add('Vêtements', 'Pull ou polaire')
  } else if (s === 'ete' || s === 'tropiques') {
    add('Vêtements', 'Vêtements légers')
    add('Vêtements', 'Chapeau ou casquette')
  } else {
    add('Vêtements', 'Veste légère et pull')
    add('Vêtements', 'Imperméable')
  }
  if (envies.includes('plage') || s === 'tropiques') {
    add('Vêtements', 'Maillot de bain')
    add('Vêtements', 'Sandales')
  }
  if (envies.includes('nature') || envies.includes('aventure')) {
    add('Vêtements', 'Chaussures de randonnée')
    add('Vêtements', 'Sac à dos de journée')
  }
  if (envies.includes('nuit') || envies.includes('gastronomie')) add('Vêtements', 'Une tenue pour sortir le soir')

  add('Toilette', 'Brosse à dents et dentifrice')
  add('Toilette', 'Gel douche et shampoing (100 ml en cabine)')
  add('Toilette', 'Déodorant')
  if (s !== 'hiver' || envies.includes('plage')) add('Toilette', 'Crème solaire')
  add('Santé', 'Médicaments habituels (avec l’ordonnance)')
  add('Santé', 'Antidouleur, pansements')
  if (s === 'tropiques' || loin) add('Santé', 'Anti-moustiques')

  add('Électronique', 'Téléphone et chargeur')
  add('Électronique', 'Batterie externe')
  if (loin) add('Électronique', 'Adaptateur de prise')
  add('Électronique', 'Écouteurs')

  add('Divers', 'Gourde')
  if (jours >= 3) add('Divers', 'Petit sac pour le linge sale')
  if (envies.includes('famille')) add('Divers', 'Jeux et goûters pour les enfants')
  if (envies.includes('plage')) add('Divers', 'Serviette de plage')

  return items
}

export function progression(items) {
  const total = items.length
  const ok = items.filter((i) => i.ok).length
  return { total, ok, pct: total ? Math.round((ok / total) * 100) : 0 }
}
