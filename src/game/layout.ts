import board from './board.json'
import { ARMY, FLEET, base } from './map'

/**
 * The board's geometry.
 *
 * Three attempts at drawing this by hand came to nothing worth looking at.
 * Voronoi cells divide a plane tidily and look nothing like Europe; a graph
 * of circles and lines is unimpeachable about adjacency and is not a map;
 * and fifty-six polygons placed by eye were fifty-six separate islands.
 *
 * The geometry here comes from the standard map published with the diplomacy
 * engine at https://github.com/diplomacy/diplomacy, which is AGPL-3.0 -- the
 * same licence this project uses -- so it can be carried across whole, with
 * attribution. `tools/map.py` pulls it out and NOTICE.md says where it came
 * from. What comes across is outlines and coordinates; every colour, every
 * mark and every decision about what to draw on top of it is ours.
 *
 * The lesson is worth keeping. Drawing Europe accurately is a real piece of
 * work by somebody who did it properly, and three days of my approximating
 * it would have produced something worse than the thing that already exists
 * under a licence that invites this exactly.
 */

export interface Point {
  x: number
  y: number
}

const data = board as unknown as {
  source: string
  shift: number[]
  viewBox: number[]
  shapes: Record<string, string>
  units: Record<string, [number, number]>
  labels: Record<string, [number, number]>
}

export const SOURCE = data.source
export const VIEW_BOX = data.viewBox.join(' ')
export const WIDTH = data.viewBox[2]!
export const HEIGHT = data.viewBox[3]!

/** The outline of each province, as an SVG path. */
export const SHAPES: Record<string, string> = data.shapes

/**
 * The outlines are drawn in a layer that is shifted; the unit coordinates
 * are not. Applying it to the shapes rather than to the paths themselves is
 * what keeps the extracted data a faithful copy of what was published.
 */
export const SHIFT = `translate(${data.shift[0]} ${data.shift[1]})`

/** Where a unit stands, and where the province's name goes above it. */
export const CENTRES: Record<string, Point> = Object.fromEntries(
  Object.entries(data.units).map(([id, [x, y]]) => [id, { x, y }]),
)

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
