import { ARMY, FLEET, PROVINCES, base, type Power } from './map'

/**
 * Units, orders, and what counts as a legal one.
 *
 * A unit's `at` is a fleet key when it is a fleet on a split coast --
 * `stp/sc` rather than `stp` -- because that is a real fact about where it
 * is and which way it can sail. Everything to do with who occupies what uses
 * the bare province, since only one unit stands in a province however many
 * coasts it has.
 */

export type UnitType = 'army' | 'fleet'

export interface Unit {
  power: Power
  type: UnitType
  /** Fleet key or province id. `base(at)` is always the province. */
  at: string
}

/**
 * `power` is who gave the order, and is optional only because most of this
 * engine's callers are handing it orders for units it already knows they
 * own. When it is present it is checked: ordering another country's unit is
 * not a clever move, it is not a move at all.
 */
export type Order =
  | { type: 'hold'; at: string; power?: Power }
  | { type: 'move'; at: string; to: string; viaConvoy?: boolean; power?: Power }
  /**
   * `from === to` is a support to hold, unless `ofMove` says a destination
   * was actually written out. The difference is invisible in the shape of
   * the order and decides 6.A.5: "Supports A Yorkshire" holds a unit down,
   * while "Supports A Yorkshire - Yorkshire" supports a move nobody can
   * legally make, and is therefore no order at all.
   */
  | { type: 'support'; at: string; from: string; to: string; ofMove?: boolean; power?: Power }
  | { type: 'convoy'; at: string; from: string; to: string; power?: Power }

/** Units by province. One unit to a province, whatever its coast. */
export type Board = Map<string, Unit>

export const boardFrom = (units: readonly Unit[]): Board =>
  new Map(units.map((u) => [base(u.at), u]))

/**
 * Can this unit make this step on its own legs?
 *
 * Fleets are the awkward ones. A fleet on a named coast may only sail along
 * that coast, and a fleet ordered into a two-coasted province has to be told
 * which coast -- so `spa` is never a fleet destination but `spa/nc` is.
 */
export function canStep(unit: Unit, to: string): boolean {
  if (unit.type === 'army') {
    return (ARMY[base(unit.at)] ?? []).includes(base(to))
  }
  return (FLEET[unit.at] ?? []).includes(to)
}

/** Every coast of `to` a fleet at `from` could actually reach. */
export function fleetCoasts(from: string, to: string): string[] {
  const coasts = PROVINCES[base(to)]?.coasts
  const keys = coasts ? coasts.map((c) => `${base(to)}/${c}`) : [base(to)]
  return keys.filter((key) => (FLEET[from] ?? []).includes(key))
}

/**
 * Sea provinces with a fleet convoying this army, in a chain from `from` to
 * `to`. Returns the shortest chain, or null when there is none -- and null
 * is the answer that makes an army sit still in the Atlantic.
 */
export function convoyRoute(
  board: Board,
  orders: Map<string, Order>,
  from: string,
  to: string,
  /** Convoying fleets to treat as gone, for asking what happens if they are. */
  disrupted: ReadonlySet<string> = new Set(),
): string[] | null {
  const start = base(from)
  const end = base(to)
  if (PROVINCES[start]?.terrain === 'land' || PROVINCES[end]?.terrain === 'land') return null

  const convoyers = new Set<string>()
  for (const [at, order] of orders) {
    if (order.type !== 'convoy') continue
    if (base(order.from) !== start || base(order.to) !== end) continue
    if (disrupted.has(at)) continue
    const unit = board.get(at)
    if (unit?.type === 'fleet' && PROVINCES[at]?.terrain === 'sea') convoyers.add(at)
  }
  if (convoyers.size === 0) return null

  /*
   * Breadth first, so the route found is the shortest one available.
   *
   * Both ends are compared by province rather than by key. A two-coasted
   * province has no bare entry in the fleet graph at all -- there is no
   * 'bul', only 'bul/ec' and 'bul/sc' -- so an army walking aboard in
   * Bulgaria found no sea to start from and simply stayed there.
   */
  const fromSeas = coastalSeas(start)
  const queue: string[][] = []
  for (const sea of convoyers) if (fromSeas.includes(sea)) queue.push([sea])
  const seen = new Set<string>()

  while (queue.length > 0) {
    const path = queue.shift()!
    const last = path[path.length - 1]!
    if ((FLEET[last] ?? []).some((n) => base(n) === end)) return path
    if (seen.has(last)) continue
    seen.add(last)
    for (const next of FLEET[last] ?? []) {
      if (convoyers.has(next) && !path.includes(next)) queue.push([...path, next])
    }
  }
  return null
}

/**
 * Which orders are orders at all.
 *
 * The rulebook's word is that an illegal order is not obeyed and the unit
 * holds instead, and every published test case that says `illegal` is
 * checking exactly that. It matters more than it sounds: a fleet ordered
 * somewhere it cannot go must still be standing where it was, still
 * occupying that province, still in everybody else's way.
 *
 * This is also where a fleet's coast is settled. An order that says "Spain"
 * is fine when only one coast of Spain can be reached from where the fleet
 * is, and is no order at all when both can -- the fleet has not been told
 * which sea it is going to sit in.
 */
export interface Validated {
  /** Province -> the order that will actually be carried out. */
  orders: Map<string, Order>
  /** Provinces whose order was refused; those units hold. */
  illegal: Set<string>
  /** Provinces whose unit was told to move, legally or not. */
  orderedToMove: Set<string>
  /**
   * Provinces whose unit was told to leave and could have.
   *
   * The document draws a line here that decides two cases (issue 4.E.1). An
   * order that is impossible *in this position* but would be possible in
   * another is **illegal**: it is ignored, the unit is simply holding, and
   * it may be held down by hold support. An order that this position allows
   * and that merely did not come off is **invalid**: the unit tried to
   * leave, and a unit trying to leave cannot be propped up where it stands.
   *
   * The two cases are the same order with one piece moved. An army sent
   * across water with a fleet standing on the route and no convoy ordered
   * was given a legal order that failed (6.D.8). The identical order with
   * nobody in the sea at all was never an order (6.D.32).
   */
  orderedAway: Set<string>
}

export function validate(board: Board, given: readonly Order[]): Validated {
  const orders = new Map<string, Order>()
  const illegal = new Set<string>()
  /*
   * Convoy orders as given, for judging whether a move over water is a move
   * at all. A route that exists on the map is not enough: an army ordered
   * from Yorkshire to Holland with nobody in the North Sea has been ordered
   * to do something impossible in this position, however possible it is in
   * another one.
   */
  const offered = given.filter((o) => o.type === 'convoy')
  /*
   * Anybody who was told to move, whether or not the order was a legal one.
   *
   * They cannot be supported where they stand. It is not enough that the
   * move failed, or that it was never possible: the unit was ordered away,
   * and a unit ordered away is not holding the province -- it is trying to
   * leave and not managing it, which is a different thing and cannot be
   * propped up.
   */
  const orderedToMove = new Set(
    given.filter((o) => o.type === 'move').map((o) => base(o.at)),
  )

  const refused = new Set<string>()
  const supports: Extract<Order, { type: 'support' }>[] = []

  for (const order of given) {
    const at = base(order.at)
    const unit = board.get(at)
    if (!unit) continue
    // Ordering somebody else's unit is not an order. It is also not that
    // unit's problem: whatever its owner told it to do, it still does.
    if (order.power && order.power !== unit.power) {
      refused.add(at)
      continue
    }
    if (order.type === 'support') {
      supports.push(order)
      continue
    }

    const ok = check(board, unit, order, offered)
    if (ok) orders.set(at, ok)
    else refused.add(at)
  }

  /*
   * Supports last, because a support is only as legal as the move underneath
   * it. You cannot support a fleet into an inland province by wishing: the
   * move was never an order, so neither was the support of it.
   */
  for (const order of supports) {
    const at = base(order.at)
    const unit = board.get(at)!
    const ok = check(board, unit, order, offered)
    if (!ok) {
      refused.add(at)
      continue
    }
    const supported = orders.get(base(order.from))
    const wasRefused = refused.has(base(order.from))
    // A destination written out makes this a support of a move, even when
    // the destination is where the unit already is -- and there is no legal
    // move to your own province, so there is nothing there to support.
    const ofMove = order.ofMove === true || base(order.from) !== base(order.to)
    if (ofMove && wasRefused && supported?.type !== 'move') {
      refused.add(at)
      continue
    }
    orders.set(at, ok)
  }

  const orderedAway = new Set<string>()
  for (const order of given) {
    if (order.type !== 'move') continue
    const at = base(order.at)
    const unit = board.get(at)
    if (!unit || (order.power && order.power !== unit.power)) continue
    if (orders.get(at)?.type === 'move') orderedAway.add(at)
    else if (unit.type === 'army' && crewedRoute(board, unit.at, order.to)) orderedAway.add(at)
  }

  for (const at of refused) if (!orders.has(at)) illegal.add(at)
  for (const [p] of board) if (!orders.has(p)) orders.set(p, { type: 'hold', at: p })
  return { orders, illegal, orderedToMove, orderedAway }
}

/** The order as it will be obeyed, with the coast filled in, or null. */
function check(
  board: Board,
  unit: Unit,
  order: Order,
  offered: readonly Order[] = [],
): Order | null {
  switch (order.type) {
    case 'hold':
      return order

    case 'move': {
      if (base(order.to) === base(unit.at)) return null
      const to = settleCoast(unit, order.to)
      if (to === null) return null
      if (unit.type === 'fleet') return canStep(unit, to) ? { ...order, to } : null
      // An army may walk, or be carried; either is a legal thing to order.
      if (canStep(unit, to)) return { ...order, to }
      if (!convoyable(unit, to)) return null
      const carried = offered.some(
        (c) =>
          c.type === 'convoy' &&
          base(c.from) === base(unit.at) &&
          base(c.to) === base(to) &&
          board.get(base(c.at))?.type === 'fleet',
      )
      return carried ? { ...order, to, viaConvoy: true } : null
    }

    case 'support': {
      // You may only support into a province you could have gone to yourself.
      if (base(order.from) === base(unit.at)) return null
      if (!reaches(unit, order.to)) return null

      /*
       * A fleet cannot convoy and support at the same time. So if the move
       * being supported can only go by water, and every route runs through
       * this very fleet, the support was never possible -- an impossibility
       * for complex reasons, which is exactly what makes it worth checking.
       */
      const moving = board.get(base(order.from))
      if (
        moving?.type === 'army' &&
        base(order.from) !== base(order.to) &&
        !(ARMY[base(moving.at)] ?? []).includes(base(order.to)) &&
        !seaRouteExists(order.from, order.to, undefined, base(unit.at))
      ) {
        return null
      }
      return order
    }

    case 'convoy': {
      if (unit.type !== 'fleet') return null
      if (PROVINCES[base(unit.at)]!.terrain !== 'sea') return null
      const army = board.get(base(order.from))
      if (!army || army.type !== 'army') return null
      return seaRouteExists(order.from, order.to, base(unit.at)) ? order : null
    }
  }
}

/** A destination a fleet could sit on, or null when it was not told which. */
function settleCoast(unit: Unit, to: string): string | null {
  if (unit.type === 'army') return base(to)
  if (to.includes('/')) return to
  const coasts = PROVINCES[base(to)]?.coasts
  if (!coasts) return to
  const reachable = fleetCoasts(unit.at, to)
  return reachable.length === 1 ? reachable[0]! : null
}

/**
 * Could this unit ever step here, on any coast?
 *
 * Support is given to a province rather than to a coast of one. A fleet in
 * Marseilles may support an attack on the north coast of Spain even though it
 * could never sail there itself -- it is holding the province down, not
 * sailing round it.
 */
function reaches(unit: Unit, to: string): boolean {
  if (unit.type === 'army') return (ARMY[base(unit.at)] ?? []).includes(base(to))
  return fleetCoasts(unit.at, base(to)).length > 0
}

/**
 * Could water ever carry an army from here to there, whatever anybody has
 * ordered? A question about the map alone, and the one that makes a convoy
 * order from a fleet nowhere near the route no order at all.
 */
export function seaRouteExists(
  from: string,
  to: string,
  through?: string,
  /** A sea to pretend is not there, for asking whether it was needed. */
  avoiding?: string,
): boolean {
  const start = base(from)
  const end = base(to)
  if (start === end) return false
  if (PROVINCES[start]?.terrain !== 'coast' || PROVINCES[end]?.terrain !== 'coast') return false

  const seas = (id: string) =>
    (FLEET[id] ?? []).filter((n) => PROVINCES[base(n)]!.terrain === 'sea' && n !== avoiding)

  // Walk the seas, remembering whether the required one has been used.
  const seen = new Set<string>()
  const queue: [string, boolean][] = []
  for (const sea of coastalSeas(start)) if (sea !== avoiding) queue.push([sea, sea === through])

  while (queue.length > 0) {
    const [sea, used] = queue.shift()!
    const key = `${sea}:${used}`
    if (seen.has(key)) continue
    seen.add(key)
    if ((FLEET[sea] ?? []).some((n) => base(n) === end) && (!through || used)) return true
    for (const next of seas(sea)) queue.push([next, used || next === through])
  }
  return false
}

/**
 * The coasts a chain of fleets standing on the board can reach from these
 * seas.
 *
 * Whoever owns them and whatever they were ordered to do. This is a question
 * about what the position makes possible, not about what anybody asked for,
 * and it is the difference between an order that is illegal and one that is
 * merely invalid.
 */
export function coastsThroughFleets(board: Board, from: readonly string[]): Set<string> {
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

/** Could the fleets now on the board carry an army from here to there? */
export function crewedRoute(board: Board, from: string, to: string): boolean {
  const start = base(from)
  const end = base(to)
  if (start === end) return false
  if (PROVINCES[start]?.terrain !== 'coast' || PROVINCES[end]?.terrain !== 'coast') return false
  const seas = coastalSeas(start)
    .map(base)
    .filter((sea) => board.get(sea)?.type === 'fleet')
  return coastsThroughFleets(board, seas).has(end)
}

/** The seas a coastal province touches, whichever coast they are on. */
export function coastalSeas(id: string): string[] {
  const coasts = PROVINCES[id]?.coasts
  const keys = coasts ? coasts.map((c) => `${id}/${c}`) : [id]
  return keys.flatMap((k) => (FLEET[k] ?? []).filter((n) => PROVINCES[base(n)]!.terrain === 'sea'))
}

/** Both ends ashore and some water between them. */
const convoyable = (unit: Unit, to: string): boolean =>
  unit.type === 'army' && seaRouteExists(unit.at, to)
