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

export type Order =
  | { type: 'hold'; at: string }
  | { type: 'move'; at: string; to: string; viaConvoy?: boolean }
  /** `from === to` is a support to hold. */
  | { type: 'support'; at: string; from: string; to: string }
  | { type: 'convoy'; at: string; from: string; to: string }

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

  // Breadth first, so the route found is the shortest one available.
  const queue: string[][] = []
  for (const sea of convoyers) {
    if ((FLEET[start] ?? []).includes(sea)) queue.push([sea])
  }
  const seen = new Set<string>()

  while (queue.length > 0) {
    const path = queue.shift()!
    const last = path[path.length - 1]!
    if ((FLEET[last] ?? []).includes(end)) return path
    if (seen.has(last)) continue
    seen.add(last)
    for (const next of FLEET[last] ?? []) {
      if (convoyers.has(next) && !path.includes(next)) queue.push([...path, next])
    }
  }
  return null
}
