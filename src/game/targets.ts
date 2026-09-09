import { reachableFrom } from './layout'
import { FLEET, PROVINCES, base } from './map'
import { coastalSeas, type Board, type Unit } from './orders'

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

/**
 * The coasts a chain of crewed seas touches, starting from these.
 *
 * The model the whole convoy offering is built on: a sea counts if there is
 * a fleet standing in it, whoever owns it, and the chain runs as far as the
 * fleets do. A fleet that has not been ordered to convoy still counts -- it
 * is a thing that could be arranged, which is what the negotiation is for,
 * and the adjudicator will bounce the crossing if it is not.
 *
 * This is deliberately not the question the rules ask when they *judge* a
 * convoy order, which is whether water could ever get there. That one says
 * yes to most of Europe: it would offer thirty provinces because a chain of
 * fleets is conceivable, which is worse than offering none.
 */
function coastsReached(board: Board, from: readonly string[]): Set<string> {
  const crewed = (id: string) => board.get(base(id))?.type === 'fleet'
  const out = new Set<string>()
  const seen = new Set<string>()
  const queue = [...from]

  while (queue.length > 0) {
    const sea = queue.shift()!
    if (seen.has(sea)) continue
    seen.add(sea)
    for (const next of FLEET[sea] ?? []) {
      const p = base(next)
      if (PROVINCES[p]!.terrain === 'sea') {
        if (crewed(p)) queue.push(p)
      } else if (PROVINCES[p]!.terrain === 'coast') {
        out.add(p)
      }
    }
  }
  return out
}

/** The seas off this coast that have a fleet in them. */
const putToSea = (board: Board, coast: string): string[] =>
  coastalSeas(coast)
    .map(base)
    .filter((sea) => board.get(sea)?.type === 'fleet')

/** Where an army could be carried to, given the fleets actually on the board. */
export function convoyDestinations(board: Board, unit: Unit): Set<string> {
  const here = base(unit.at)
  if (unit.type !== 'army' || PROVINCES[here]?.terrain !== 'coast') return new Set()
  const out = coastsReached(board, putToSea(board, here))
  out.delete(here)
  return out
}

/**
 * The armies this fleet could carry.
 *
 * Only the ones its own chain can actually reach. Offering every army on
 * every coast wrote orders the adjudicator threw away: the North Sea has no
 * business being asked to carry an army out of Ankara.
 */
export function convoyable(board: Board, unit: Unit): Set<string> {
  const sea = base(unit.at)
  if (unit.type !== 'fleet' || PROVINCES[sea]?.terrain !== 'sea') return new Set()
  const ashore = coastsReached(board, [sea])
  const out = new Set<string>()
  for (const coast of ashore) {
    if (board.get(coast)?.type === 'army') out.add(coast)
  }
  return out
}

/** Where this fleet could put that army ashore: the same chain, less home. */
export function convoyTargets(board: Board, unit: Unit, from: string): Set<string> {
  const sea = base(unit.at)
  if (unit.type !== 'fleet' || PROVINCES[sea]?.terrain !== 'sea') return new Set()
  const out = coastsReached(board, [sea])
  out.delete(base(from))
  return out
}
