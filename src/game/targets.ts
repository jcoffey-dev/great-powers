import { reachableFrom } from './layout'
import { PROVINCES, base } from './map'
import {
  coastalSeas,
  coastsThroughFleets,
  convoyRoute,
  validate,
  type Board,
  type Order,
  type Unit,
} from './orders'

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

/** The seas off this coast that have a fleet in them. */
const putToSea = (board: Board, coast: string): string[] =>
  coastalSeas(coast)
    .map(base)
    .filter((sea) => board.get(sea)?.type === 'fleet')

/** Where an army could be carried to, given the fleets actually on the board. */
export function convoyDestinations(board: Board, unit: Unit): Set<string> {
  const here = base(unit.at)
  if (unit.type !== 'army' || PROVINCES[here]?.terrain !== 'coast') return new Set()
  const out = coastsThroughFleets(board, putToSea(board, here))
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
  const ashore = coastsThroughFleets(board, [sea])
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
  const out = coastsThroughFleets(board, [sea])
  out.delete(base(from))
  return out
}

/**
 * Crossings nobody has been asked to escort.
 *
 * A convoy takes as many orders as there are seas to cross, and the player
 * writing them needs one answer where the rules give two. Order an army
 * across with no fleet told to carry it and the order is *illegal* -- the
 * panel already reddens it. Order it with one fleet of a two-fleet chain and
 * the order is perfectly legal, because legality is decided on the board
 * alone; it simply fails, silently, a turn later.
 *
 * From the writer's chair those are the same complaint: nobody is carrying
 * this. Worse, the board offers crossings that run through *other people's*
 * fleets -- deliberately, since that is what the talking is for -- and those
 * cannot be ordered at all, only asked for. So this asks the one question
 * that matters: given every order on the table, is there a chain that
 * actually gets this army there?
 */
export function unescorted(board: Board, given: readonly Order[]): Set<string> {
  const { orders } = validate(board, given)
  const out = new Set<string>()
  for (const order of given) {
    if (order.type !== 'move') continue
    const at = base(order.at)
    const unit = board.get(at)
    if (unit?.type !== 'army') continue
    // Only a crossing can want an escort; a march is its own arrangement.
    if (reachableFrom(unit).map(base).includes(base(order.to))) continue
    if (convoyRoute(board, orders, unit.at, order.to) === null) out.add(at)
  }
  return out
}
