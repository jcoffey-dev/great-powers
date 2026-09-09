import { ARMY, FLEET, PROVINCES, base } from './map'

/**
 * Where everything sits, and how the regions are drawn.
 *
 * The board this game is played on is somebody's artwork and is not here.
 * What is here is a set of coordinates I placed by hand -- roughly where each
 * province falls in Europe, in a thousand by eight hundred box -- and the map
 * is drawn from those and from the adjacency rules. It is a drawing of the
 * data rather than a tracing of a board, the same rule the cave game's
 * dodecahedron is drawn under.
 *
 * **It draws the graph, not regions, and that was not the first idea.**
 *
 * The first idea was Voronoi cells -- every point on the board belonging to
 * the nearest province -- which gives a handsome cut-paper board and is
 * wrong. Sixty-five pairs that border each other in the rules had regions
 * that did not touch, and no amount of nudging coordinates would fix it,
 * because the fault is structural: provinces here interleave. The Adriatic
 * borders Venice with Trieste sitting between their centres; the Atlantic
 * borders North Africa around the outside of Spain. Convex cells cannot say
 * that.
 *
 * A map that shows two regions meeting when the rules say they do not is
 * worse than an ugly map. It is a map that loses you the game. So the
 * adjacency is drawn as lines, which can say exactly what the rules say, and
 * the province is a shape sitting on top of it. Nobody can misread a line.
 */

export const WIDTH = 1000
export const HEIGHT = 800

export interface Point {
  x: number
  y: number
}

/**
 * The centres, west to east and north to south. Placed by eye against an
 * atlas: near enough that a player recognises Europe, and not a copy of
 * anybody's board.
 */
export const CENTRES: Record<string, Point> = {
  // --- the ocean and the northern seas ---
  nao: { x: 60, y: 120 },
  nwg: { x: 250, y: 80 },
  bar: { x: 520, y: 40 },
  iri: { x: 160, y: 300 },
  nth: { x: 315, y: 235 },
  ska: { x: 395, y: 195 },
  hel: { x: 352, y: 265 },
  bal: { x: 470, y: 235 },
  bot: { x: 505, y: 155 },
  eng: { x: 215, y: 375 },
  mao: { x: 75, y: 400 },

  // --- the British Isles ---
  cly: { x: 215, y: 215 },
  edi: { x: 250, y: 240 },
  lvp: { x: 210, y: 275 },
  yor: { x: 258, y: 288 },
  wal: { x: 200, y: 318 },
  lon: { x: 258, y: 332 },

  // --- Scandinavia and the north ---
  nwy: { x: 390, y: 130 },
  swe: { x: 445, y: 140 },
  fin: { x: 520, y: 100 },
  stp: { x: 625, y: 90 },
  den: { x: 398, y: 248 },

  // --- Russia ---
  lvn: { x: 560, y: 190 },
  mos: { x: 690, y: 200 },
  war: { x: 545, y: 278 },
  ukr: { x: 620, y: 320 },
  sev: { x: 700, y: 355 },

  // --- Germany and the Low Countries ---
  pru: { x: 483, y: 268 },
  ber: { x: 432, y: 292 },
  kie: { x: 390, y: 286 },
  ruh: { x: 363, y: 332 },
  mun: { x: 392, y: 368 },
  sil: { x: 468, y: 322 },
  hol: { x: 330, y: 300 },
  bel: { x: 300, y: 345 },

  // --- France and Iberia ---
  pic: { x: 280, y: 376 },
  par: { x: 275, y: 418 },
  bre: { x: 208, y: 418 },
  bur: { x: 328, y: 404 },
  gas: { x: 248, y: 462 },
  mar: { x: 312, y: 482 },
  spa: { x: 182, y: 512 },
  por: { x: 115, y: 522 },

  // --- Italy ---
  pie: { x: 372, y: 456 },
  ven: { x: 408, y: 448 },
  tus: { x: 396, y: 492 },
  rom: { x: 420, y: 524 },
  nap: { x: 458, y: 562 },
  apu: { x: 468, y: 522 },

  // --- Austria and the Balkans ---
  tyr: { x: 412, y: 402 },
  boh: { x: 442, y: 358 },
  vie: { x: 472, y: 392 },
  bud: { x: 518, y: 402 },
  gal: { x: 542, y: 342 },
  tri: { x: 452, y: 442 },
  ser: { x: 508, y: 446 },
  alb: { x: 500, y: 482 },
  gre: { x: 518, y: 532 },
  bul: { x: 566, y: 462 },
  rum: { x: 598, y: 406 },

  // --- Turkey and the Levant ---
  con: { x: 628, y: 506 },
  ank: { x: 702, y: 500 },
  smy: { x: 668, y: 556 },
  arm: { x: 765, y: 500 },
  syr: { x: 742, y: 572 },

  // --- the Mediterranean and Africa ---
  adr: { x: 458, y: 482 },
  ion: { x: 478, y: 610 },
  aeg: { x: 572, y: 548 },
  eas: { x: 655, y: 622 },
  bla: { x: 665, y: 432 },
  tys: { x: 412, y: 568 },
  lyo: { x: 330, y: 532 },
  wes: { x: 268, y: 572 },
  naf: { x: 230, y: 640 },
  tun: { x: 398, y: 640 },
}

/**
 * Every pair of provinces that border each other, once each.
 *
 * The union of both graphs at province level: an army's border and a fleet's
 * are different questions, but a line on the map means "these two touch", and
 * which unit can use it is what the panel beside the map is for.
 */
export function borders(): [string, string][] {
  const seen = new Set<string>()
  const out: [string, string][] = []

  const add = (a: string, b: string) => {
    const key = a < b ? `${a}:${b}` : `${b}:${a}`
    if (seen.has(key) || a === b) return
    seen.add(key)
    out.push(a < b ? [a, b] : [b, a])
  }

  for (const [id, tos] of Object.entries(ARMY)) for (const to of tos) add(id, base(to))
  for (const [key, tos] of Object.entries(FLEET)) {
    for (const to of tos) add(base(key), base(to))
  }
  return out
}

/** How big a province is drawn. Seas are wide and vague, land is compact. */
export const radius = (id: string): number =>
  PROVINCES[id]!.terrain === 'sea' ? 26 : PROVINCES[id]!.sc ? 21 : 17

/**
 * The box the board actually occupies, rather than the box the coordinates
 * were typed into. Europe is not rectangular and the placings do not fill a
 * thousand by eight hundred; drawing that box leaves a third of the frame as
 * empty ocean, which wastes the one thing this game was given more of than
 * the others -- room.
 */
export function bounds(pad = 34): { x: number; y: number; w: number; h: number } {
  const ids = Object.keys(CENTRES)
  const lo = (f: (id: string) => number) => Math.min(...ids.map(f))
  const hi = (f: (id: string) => number) => Math.max(...ids.map(f))

  const minX = lo((id) => CENTRES[id]!.x - radius(id))
  const maxX = hi((id) => CENTRES[id]!.x + radius(id))
  const minY = lo((id) => CENTRES[id]!.y - radius(id))
  const maxY = hi((id) => CENTRES[id]!.y + radius(id))

  return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 }
}

/**
 * The region belonging to one province: the whole board, cut back by the
 * halfway line between it and every other centre.
 *
 * This is a Voronoi diagram, and it is worth being straight about what it
 * can and cannot do. It divides the plane with no gaps and no overlaps, and
 * it looks like a board. It cannot reproduce every adjacency in the rules,
 * because provinces here interleave -- the Adriatic borders Venice with
 * Trieste between their centres -- and convex cells cannot say that.
 *
 * So the regions are what the map *looks* like, and they are not what the
 * rules are read from. Clicking a province lights up exactly where its unit
 * may legally go, taken from the adjacency graph. That is the honest split:
 * the picture is a picture, and the rules answer for themselves when asked.
 */
export function cell(id: string, margin = 5): Point[] {
  const me = CENTRES[id]
  if (!me) return []

  let poly: Point[] = [
    { x: -60, y: -60 },
    { x: WIDTH + 60, y: -60 },
    { x: WIDTH + 60, y: HEIGHT + 60 },
    { x: -60, y: HEIGHT + 60 },
  ]

  for (const [other, them] of Object.entries(CENTRES)) {
    if (other === id) continue
    const nx = them.x - me.x
    const ny = them.y - me.y
    const len = Math.hypot(nx, ny)
    if (len === 0) continue
    const on = {
      x: (me.x + them.x) / 2 - (nx / len) * (margin / 2),
      y: (me.y + them.y) / 2 - (ny / len) * (margin / 2),
    }
    poly = clip(poly, on, { x: nx / len, y: ny / len })
    if (poly.length === 0) break
  }
  return poly
}

/** Everything on the near side of a line through `on` facing `normal`. */
function clip(poly: Point[], on: Point, normal: Point): Point[] {
  const side = (p: Point) => (p.x - on.x) * normal.x + (p.y - on.y) * normal.y
  const out: Point[] = []
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!
    const b = poly[(i + 1) % poly.length]!
    const sa = side(a)
    const sb = side(b)
    if (sa <= 0) out.push(a)
    if ((sa < 0 && sb > 0) || (sa > 0 && sb < 0)) {
      const t = sa / (sa - sb)
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
    }
  }
  return out
}

export const path = (poly: readonly Point[]): string =>
  poly.length === 0 ? '' : `M${poly.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('L')}Z`

/** Where a unit standing here may legally go. The rules, not the picture. */
export function reachableFrom(unit: { type: 'army' | 'fleet'; at: string }): string[] {
  const out = new Set<string>()
  if (unit.type === 'army') {
    for (const to of ARMY[base(unit.at)] ?? []) out.add(base(to))
  } else {
    for (const to of FLEET[unit.at] ?? []) out.add(base(to))
  }
  return [...out]
}
