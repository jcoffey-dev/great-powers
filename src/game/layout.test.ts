import { describe, expect, it } from 'vitest'
import { FLEET, PROVINCES, base } from './map'
import { CENTRES, SHAPES, SOURCE, VIEW_BOX, WIDTH, HEIGHT, reachableFrom } from './layout'

/**
 * The geometry is not ours -- it comes from the standard map published with
 * the diplomacy engine, under the same licence as this project. So these do
 * not check that Europe is the right shape. They check that what was carried
 * across lines up with the rules this game plays by, which is the join where
 * a mistake would actually hide.
 */

const ids = Object.keys(PROVINCES)

describe('the board that was carried across', () => {
  it('says where it came from', () => {
    expect(SOURCE).toContain('github.com/diplomacy/diplomacy')
    expect(SOURCE).toContain('AGPL-3.0')
  })

  it('has an outline for every province this game knows and no others', () => {
    expect(Object.keys(SHAPES).sort()).toEqual(ids.sort())
  })

  it('has somewhere to stand a unit in every province', () => {
    for (const id of ids) {
      expect(CENTRES[id], id).toBeDefined()
      expect(CENTRES[id]!.x, id).toBeGreaterThan(0)
      expect(CENTRES[id]!.x, id).toBeLessThan(WIDTH)
      expect(CENTRES[id]!.y, id).toBeGreaterThan(0)
      expect(CENTRES[id]!.y, id).toBeLessThan(HEIGHT)
    }
  })

  it('knows where a fleet on each named coast belongs', () => {
    // The three split coasts get their own spot, or a fleet in Spain has
    // nowhere to be drawn that says which sea it is sitting in.
    for (const id of ['spa/nc', 'spa/sc', 'bul/ec', 'bul/sc', 'stp/nc', 'stp/sc']) {
      expect(CENTRES[id], id).toBeDefined()
    }
  })

  it('gives every outline something to draw', () => {
    for (const id of ids) {
      expect(SHAPES[id]!.length, id).toBeGreaterThan(20)
      expect(SHAPES[id]!.startsWith('M'), id).toBe(true)
    }
  })

  it('is one box the whole board fits in', () => {
    expect(VIEW_BOX.split(' ')).toHaveLength(4)
  })
})

describe('what a unit may reach', () => {
  /**
   * Kept apart from the drawing on purpose. Shapes cannot answer every
   * question this game asks -- a fleet in Spain can reach the Gulf of Lyon
   * from one coast and not the other, and both coasts are the same shape --
   * so this comes from the rules and lights up when a province is clicked.
   */
  it('is the rules, not the picture', () => {
    expect(reachableFrom({ type: 'army', at: 'vie' }).sort()).toEqual([
      'boh', 'bud', 'gal', 'tri', 'tyr',
    ])
    expect(reachableFrom({ type: 'fleet', at: 'stp/sc' }).sort()).toEqual(['bot', 'fin', 'lvn'])
  })

  it('knows a fleet on one coast cannot use the other', () => {
    expect(reachableFrom({ type: 'fleet', at: 'spa/nc' })).not.toContain('lyo')
    expect(reachableFrom({ type: 'fleet', at: 'spa/sc' })).toContain('lyo')
  })

  it('agrees with the fleet graph about every sea', () => {
    for (const id of ids.filter((i) => PROVINCES[i]!.terrain === 'sea')) {
      expect(reachableFrom({ type: 'fleet', at: id }).sort()).toEqual(
        [...new Set((FLEET[id] ?? []).map(base))].sort(),
      )
    }
  })
})
