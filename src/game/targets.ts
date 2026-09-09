import { reachableFrom } from './layout'
import { PROVINCES, base } from './map'
import type { Board, Unit } from './orders'

/**
 * What each half of an order may be clicked on.
 *
 * This is here rather than in the panel because it is a question about the
 * rules, and the last time it lived in the interface it got the rule wrong in
 * a way nothing could catch: support was offered only for units standing next
 * door, when the rule is that the *destination* must be next door. Vienna may
 * support Venice into Tyrolia -- Vienna and Tyrolia touch, Vienna and Venice
 * do not -- and that order simply could not be written.
 *
 * Everything here answers with base province names, because that is what the
 * board is clicked on. A fleet's choice of coast is settled afterwards.
 */

const within = (unit: Unit): Set<string> => new Set(reachableFrom(unit).map(base))

/**
 * The units this one may support.
 *
 * Either it is standing somewhere I could go, which is a support to hold, or
 * it could go somewhere I could go, which is a support to move.
 */
export function supportable(board: Board, unit: Unit): Set<string> {
  const mine = within(unit)
  const here = base(unit.at)
  const out = new Set<string>()
  for (const [at, other] of board) {
    if (at === here) continue
    if (mine.has(at) || reachableFrom(other).some((d) => mine.has(base(d)))) out.add(at)
  }
  return out
}

/**
 * Where a supported unit may be supported to.
 *
 * Its own province is on the list only when this unit could have gone there
 * itself: you cannot prop somebody up across Europe, and offering it would
 * write an order the adjudicator throws away without saying so.
 */
export function supportTargets(board: Board, unit: Unit, from: string): Set<string> {
  const helped = board.get(base(from))
  if (!helped) return new Set()
  const mine = within(unit)
  const out = new Set(reachableFrom(helped).map(base).filter((p) => mine.has(p)))
  if (mine.has(base(from))) out.add(base(from))
  return out
}

/** The armies a fleet at sea may carry: any army on a coast but its own. */
export function convoyable(board: Board, unit: Unit): Set<string> {
  const out = new Set<string>()
  for (const [at, other] of board) {
    if (other.type !== 'army') continue
    if (PROVINCES[at]!.terrain !== 'coast') continue
    if (at === base(unit.at)) continue
    out.add(at)
  }
  return out
}

/** Where it may be put ashore: any other coast. Whether a chain of fleets
 * actually exists is the adjudicator's business, not the map's. */
export function convoyTargets(from: string): Set<string> {
  return new Set(
    Object.keys(PROVINCES).filter(
      (p) => PROVINCES[p]!.terrain === 'coast' && p !== base(from),
    ),
  )
}
