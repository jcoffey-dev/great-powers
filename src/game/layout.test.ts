import { describe, expect, it } from 'vitest'
import { ARMY, FLEET, PROVINCES, base } from './map'
import { CENTRES, HEIGHT, WIDTH, borders, cell, radius, reachableFrom } from './layout'

/**
 * Coordinates typed by hand are wrong somewhere, and a map is the one thing
 * where wrong looks like a style choice. These are the checks that turn
 * "Bulgaria seems to be in the North Sea" into a failing test.
 */

const ids = Object.keys(PROVINCES)
const dist = (a: string, b: string) =>
  Math.hypot(CENTRES[a]!.x - CENTRES[b]!.x, CENTRES[a]!.y - CENTRES[b]!.y)

describe('the placings', () => {
  it('has a spot for every province and nothing else', () => {
    expect(Object.keys(CENTRES).sort()).toEqual(ids.sort())
  })

  it('keeps them all on the board', () => {
    for (const [id, p] of Object.entries(CENTRES)) {
      expect(p.x, id).toBeGreaterThan(0)
      expect(p.x, id).toBeLessThan(WIDTH)
      expect(p.y, id).toBeGreaterThan(0)
      expect(p.y, id).toBeLessThan(HEIGHT)
    }
  })

  it('keeps them far enough apart to be separate places', () => {
    const close: string[] = []
    for (const a of ids) {
      for (const b of ids) {
        if (a >= b) continue
        if (dist(a, b) < 24) close.push(`${a}/${b} at ${dist(a, b).toFixed(0)}`)
      }
    }
    expect(close).toEqual([])
  })
})

describe('the geography agrees with the rules', () => {
  const edges = borders()

  it('draws a line for every border in the rules, and no others', () => {
    const expected = new Set<string>()
    for (const id of ids) {
      for (const to of ARMY[id] ?? []) if (base(to) !== id) expected.add([id, base(to)].sort().join(':'))
      const keys = PROVINCES[id]!.coasts ? PROVINCES[id]!.coasts!.map((c) => `${id}/${c}`) : [id]
      for (const key of keys) {
        for (const to of FLEET[key] ?? []) if (base(to) !== id) expected.add([id, base(to)].sort().join(':'))
      }
    }
    expect(new Set(edges.map((e) => e.join(':')))).toEqual(expected)
  })

  it('never draws the same border twice', () => {
    expect(new Set(edges.map((e) => e.join(':'))).size).toBe(edges.length)
  })

  /**
   * A smoke test for a province placed in the wrong country, and nothing
   * more ambitious than that. The threshold is loose because provinces are
   * not the same size: Moscow borders five things and is enormous, Norway
   * reaches St Petersburg across the top of Finland, and North Africa runs
   * the length of the Mediterranean. Tightening this until those failed
   * would be measuring Europe rather than checking my typing.
   */
  it('does not place a province in the wrong part of the continent', () => {
    const far: string[] = []
    for (const [a, b] of edges) {
      if (PROVINCES[a]!.terrain === 'sea' || PROVINCES[b]!.terrain === 'sea') continue
      if (dist(a, b) > 250) far.push(`${a}-${b} at ${dist(a, b).toFixed(0)}`)
    }
    expect(far).toEqual([])
  })

  it('puts the seas where the water is', () => {
    // The Atlantic west of Portugal, the Black Sea east of Bulgaria, and
    // Norway north of Spain. Three facts that would survive any redrawing.
    expect(CENTRES.mao!.x).toBeLessThan(CENTRES.por!.x)
    expect(CENTRES.bla!.x).toBeGreaterThan(CENTRES.bul!.x)
    expect(CENTRES.nwy!.y).toBeLessThan(CENTRES.spa!.y)
  })
})

describe('the drawing', () => {
  it('never lets two provinces overlap on the board', () => {
    const overlapping: string[] = []
    for (const a of ids) {
      for (const b of ids) {
        if (a >= b) continue
        if (dist(a, b) < radius(a) + radius(b) - 12) overlapping.push(`${a}/${b}`)
      }
    }
    expect(overlapping).toEqual([])
  })
})

describe('the regions', () => {
  it('gives every province a shape with area in it', () => {
    for (const id of ids) {
      const poly = cell(id)
      expect(poly.length, id).toBeGreaterThan(2)
      // Shoelace: a region nobody can see is a region that is not there.
      let area = 0
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i]!
        const b = poly[(i + 1) % poly.length]!
        area += a.x * b.y - b.x * a.y
      }
      expect(Math.abs(area / 2), id).toBeGreaterThan(300)
    }
  })

  it('contains its own centre', () => {
    for (const id of ids) {
      const poly = cell(id, 0)
      const me = CENTRES[id]!
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i]!
        const b = poly[(i + 1) % poly.length]!
        const cross = (b.x - a.x) * (me.y - a.y) - (b.y - a.y) * (me.x - a.x)
        expect(cross, `${id} edge ${i}`).toBeGreaterThan(-0.01)
      }
    }
  })
})

describe('what a unit may reach', () => {
  /**
   * The point of this being separate from the drawing. The regions cannot
   * express every adjacency in the rules, so the map never claims to: this
   * is what lights up when a province is clicked, and it comes from the
   * graph rather than from which shapes happen to share an edge.
   */
  it('is the rules, not the picture', () => {
    expect(reachableFrom({ type: 'army', at: 'vie' }).sort()).toEqual(
      ['boh', 'bud', 'gal', 'tri', 'tyr'],
    )
    expect(reachableFrom({ type: 'fleet', at: 'stp/sc' }).sort()).toEqual(['bot', 'fin', 'lvn'])
  })

  it('knows a fleet on one coast cannot use the other', () => {
    expect(reachableFrom({ type: 'fleet', at: 'spa/nc' })).not.toContain('lyo')
    expect(reachableFrom({ type: 'fleet', at: 'spa/sc' })).toContain('lyo')
  })
})
