// Dessine l'icône de l'application (PNG) sans dépendance : globe crème, pays orange.
import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type), data])
  const sum = Buffer.alloc(4)
  sum.writeUInt32BE(crc(body))
  return Buffer.concat([len, body, sum])
}

const BG = [16, 26, 32]
const GLOBE = [243, 239, 231]
const LINE = [214, 206, 192]
const ORANGE = [228, 104, 58]

// Couleur d'un point (u, v entre 0 et 1).
function color(u, v, padded) {
  const s = padded ? 0.8 : 1
  const x = (u - 0.5) / s
  const y = (v - 0.5) / s
  const r = Math.hypot(x, y)
  const R = 0.34
  if (r > R) return BG
  const lat = Math.asin(Math.max(-1, Math.min(1, -y / R)))
  const lon = Math.asin(Math.max(-1, Math.min(1, x / (R * Math.cos(lat) || 1))))
  // Taches de « continents », dont une orange (visitée).
  const blob = (cx, cy, rx, ry) => ((lon - cx) / rx) ** 2 + ((lat - cy) / ry) ** 2 < 1
  if (blob(0.25, 0.45, 0.42, 0.33) || blob(0.55, 0.05, 0.3, 0.42)) return ORANGE
  if (blob(-0.75, 0.35, 0.38, 0.35) || blob(-0.45, -0.45, 0.28, 0.4) || blob(0.9, -0.5, 0.3, 0.2)) return LINE
  return GLOBE
}

function png(size, padded = false) {
  const SS = 4
  const rows = []
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3)
    for (let x = 0; x < size; x++) {
      let acc = [0, 0, 0]
      for (let i = 0; i < SS; i++)
        for (let j = 0; j < SS; j++) {
          const c = color((x + (i + 0.5) / SS) / size, (y + (j + 0.5) / SS) / size, padded)
          acc = acc.map((a, k) => a + c[k])
        }
      acc.forEach((a, k) => (row[1 + x * 3 + k] = Math.round(a / (SS * SS))))
    }
    rows.push(row)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

writeFileSync('public/icons/apple-touch-icon.png', png(180))
writeFileSync('public/icons/icon-192.png', png(192))
writeFileSync('public/icons/icon-512.png', png(512))
writeFileSync('public/icons/icon-maskable-512.png', png(512, true))
console.log('Icônes créées')
