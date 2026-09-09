import { describe, expect, it } from 'vitest'
import cases from './datc.json'
import { adjudicate } from './adjudicate'
import { boardFrom, type Order, type Unit } from './orders'
import type { Power } from './map'
import {
  applyAdjustments,
  civilDisorderDisbands,
  applyMoves,
  applyRetreats,
  type AdjustOrder,
  type Ownership,
  type RetreatOrder,
} from './turn'

/**
 * The published cases for the two phases that are not movement.
 *
 * They are shaped differently and so they need their own harness. A retreat
 * case plays a movement phase first and then a RETREATS section; a winter
 * case states the position with "Germany owns SC Kiel" lines instead of
 * ordering it into existence, then gives builds or disbands.
 */

interface Case {
  id: string
  title: string
  units: Unit[]
  orders: Order[]
  expect: Record<string, string[]>
  retreats: Order[]
  expectRetreat: Record<string, string[]>
  adjust: {
    type: 'build' | 'disband' | 'auto'
    at: string
    unit: 'army' | 'fleet'
    power: Power
  }[]
  expectAdjust: Record<string, string[]>
  own: Record<string, Power>
}

const all = cases as unknown as Case[]
const province = (id: string) => id.split('/')[0]!

// ------------------------------------------------------------------ 6.H

describe('DATC retreats', () => {
  const retreating = all.filter((c) => c.retreats.length > 0)

  it.each(retreating.map((c) => [c.id, c.title, c] as const))('%s %s', (_id, _t, c) => {
    const board = boardFrom(c.units)
    const outcome = adjudicate(board, c.orders)
    const after = applyMoves(board, c.orders, outcome)

    for (const [at, marks] of Object.entries(c.expect)) {
      if (marks.includes('dislodged')) {
        expect(outcome.dislodged.has(at), `${at} dislodged`).toBe(true)
      }
      if (marks.includes('stands')) {
        expect(outcome.dislodged.has(at), `${at} stands`).toBe(false)
      }
    }

    /*
     * There are no supports in the retreat phase, and nothing else either --
     * a beaten unit goes somewhere it may go, or it is gone. Anything that is
     * not a move is read here as a disband, which is what the rules do with
     * it.
     */
    const orders: RetreatOrder[] = c.retreats.map((o) =>
      o.type === 'move' ? { type: 'retreat', at: o.at, to: o.to } : { type: 'disband', at: o.at },
    )
    const { board: final } = applyRetreats(after, outcome, orders)

    for (const [at, marks] of Object.entries(c.expectRetreat)) {
      const order = c.retreats.find((o) => province(o.at) === at)
      const to = order && order.type === 'move' ? province(order.to) : null
      const beaten = outcome.dislodged.get(at)?.unit

      /*
       * Did the beaten unit end up where it was aimed? Both halves have to
       * exist to say yes. A unit that was never dislodged has no retreat to
       * make, and an empty destination holds nobody -- and comparing those
       * two nothings to each other says "arrived", which is how this harness
       * first read a unit ordered to move during the retreat phase as having
       * moved.
       */
      const arrived =
        beaten !== undefined &&
        to !== null &&
        final.get(to)?.power === beaten.power &&
        final.get(to)?.type === beaten.type

      if (marks.includes('succeeds')) {
        expect(arrived, `${at} retreat succeeds`).toBe(true)
      }
      if (marks.includes('fails') || marks.includes('illegal')) {
        expect(arrived, `${at} retreat ${marks.join(',')}`).toBe(false)
      }
    }
  })
})

// ------------------------------------------------------------- 6.I, 6.J

/**
 * Civil disorder: what goes when a power has stopped answering.
 *
 * The rule is furthest from the supply centres that power *owns* -- not the
 * ones it started with. A Russia driven out of Moscow and holding Sweden
 * measures from Sweden, and these cases are what say so; the first version
 * of this measured from home centres and was quietly wrong for every power
 * that had lost one.
 */
describe('DATC civil disorder', () => {
  const auto = all.filter((c) => c.adjust.some((a) => a.type === 'auto'))

  it.each(auto.map((c) => [c.id, c.title, c] as const))('%s %s', (_id, _t, c) => {
    const own: Ownership = new Map(Object.entries(c.own) as [string, Power][])
    const power = c.adjust[0]!.power
    const wanted = c.adjust.filter((a) => a.type === 'auto')

    /*
     * Anything the power actually said comes first. Civil disorder is only
     * for the shortfall -- a power that disbanded one of the two it owed has
     * not stopped answering, it has half answered, and the automatic rule
     * picks from what is left rather than from what it started with.
     */
    const said: AdjustOrder[] = c.adjust
      .filter((a) => a.type !== 'auto')
      .map((a) =>
        a.type === 'build'
          ? { type: 'build', at: a.at, unit: a.unit }
          : { type: 'disband', at: a.at, unit: a.unit },
      )
    const { board } = applyAdjustments(own, boardFrom(c.units), power, said)

    const removed = civilDisorderDisbands(own, board, power, wanted.length)
    expect(removed.map((u) => province(u.at)).sort()).toEqual(
      wanted.map((a) => province(a.at)).sort(),
    )
  })
})

describe('DATC builds and disbands', () => {
  const winter = all.filter((c) => c.adjust.some((a) => a.type !== 'auto'))

  it.each(winter.map((c) => [c.id, c.title, c] as const))('%s %s', (_id, _t, c) => {
    const own: Ownership = new Map(Object.entries(c.own) as [string, Power][])
    const board = boardFrom(c.units)
    const power = c.adjust[0]!.power

    const orders: AdjustOrder[] = c.adjust
      .filter((o) => o.type !== 'auto')
      .map((o) =>
        o.type === 'build'
          ? { type: 'build', at: o.at, unit: o.unit }
          : { type: 'disband', at: o.at, unit: o.unit },
      )
    const { board: after, illegal } = applyAdjustments(own, board, power, orders)

    for (const [at, marks] of Object.entries(c.expectAdjust)) {
      const order = c.adjust.find((o) => province(o.at) === at)!
      if (marks.includes('illegal')) {
        expect(illegal.has(at), `${at} illegal`).toBe(true)
      }
      if (marks.includes('succeeds')) {
        expect(illegal.has(at), `${at} succeeds`).toBe(false)
        expect(after.has(at), `${at} ${order.type}`).toBe(order.type === 'build')
      }
    }
  })
})
