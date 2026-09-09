import type { Outcome } from './adjudicate'
import { ARMY, FLEET, PROVINCES, POWERS, base, type Power } from './map'
import type { Board, Order, Unit, UnitType } from './orders'

/**
 * The rest of the year.
 *
 * Movement is the part everybody thinks about and it is not the part that
 * decides the game. Retreats decide whether a beaten unit survives to be a
 * nuisance, and the winter decides whether you get another one at all --
 * this is where a good spring turns into a bigger army, or does not.
 */

// ------------------------------------------------------------------ moving

/** The board after the movement phase, with the beaten set aside. */
export function applyMoves(board: Board, orders: readonly Order[], outcome: Outcome): Board {
  const next: Board = new Map()
  const ordered = new Map<string, Order>()
  for (const o of orders) ordered.set(base(o.at), o)

  for (const [p, unit] of board) {
    if (outcome.dislodged.has(p)) continue
    const o = ordered.get(p)
    if (o?.type === 'move' && outcome.success.get(p)) {
      // A fleet keeps the coast it was ordered to; an army has none to keep.
      next.set(base(o.to), { ...unit, at: unit.type === 'fleet' ? o.to : base(o.to) })
    } else {
      next.set(p, unit)
    }
  }
  return next
}

// --------------------------------------------------------------- retreating

export type RetreatOrder = { type: 'retreat'; at: string; to: string } | { type: 'disband'; at: string }

/**
 * Where a beaten unit may go.
 *
 * Four things are closed to it: anywhere it could not reach anyway, anywhere
 * still occupied, the province its attacker came from, and any province left
 * empty by a bounce. That last one is the rule people forget -- two armies
 * that knocked each other out of a province have not left it open, they have
 * left it closed to everybody.
 */
export function retreatOptions(after: Board, outcome: Outcome, at: string): string[] {
  const d = outcome.dislodged.get(at)
  if (!d) return []

  const reachable =
    d.unit.type === 'army' ? [...(ARMY[at] ?? [])] : [...(FLEET[d.unit.at] ?? [])]

  return reachable.filter((to) => {
    if (PROVINCES[base(to)]!.terrain === 'sea' && d.unit.type === 'army') return false
    if (after.has(base(to))) return false
    if (outcome.bounced.has(base(to))) return false
    if (!d.byConvoy && base(to) === d.attackedFrom) return false
    return true
  })
}

export interface RetreatResult {
  board: Board
  /** Units that had nowhere to go, or were ordered to go nowhere. */
  disbanded: Unit[]
}

/**
 * Two units retreating to the same province destroy each other. There is no
 * support in this phase and nothing to break a tie with, so the province
 * stays empty and both are gone.
 */
export function applyRetreats(
  after: Board,
  outcome: Outcome,
  retreats: readonly RetreatOrder[],
): RetreatResult {
  const board: Board = new Map(after)
  const disbanded: Unit[] = []
  const wanted = new Map<string, { at: string; to: string }[]>()

  for (const [at, d] of outcome.dislodged) {
    const order = retreats.find((r) => base(r.at) === at)
    if (!order || order.type === 'disband') {
      disbanded.push(d.unit)
      continue
    }
    if (!retreatOptions(after, outcome, at).includes(order.to)) {
      disbanded.push(d.unit)
      continue
    }
    const key = base(order.to)
    wanted.set(key, [...(wanted.get(key) ?? []), { at, to: order.to }])
  }

  for (const [dest, claims] of wanted) {
    if (claims.length > 1) {
      for (const c of claims) disbanded.push(outcome.dislodged.get(c.at)!.unit)
      continue
    }
    const claim = claims[0]!
    const unit = outcome.dislodged.get(claim.at)!.unit
    board.set(dest, { ...unit, at: unit.type === 'fleet' ? claim.to : dest })
  }

  return { board, disbanded }
}

// ------------------------------------------------------------- the winter

export type Ownership = Map<string, Power>

/** Who starts owning what: everybody their own, the neutrals nobody's. */
export function openingOwnership(): Ownership {
  const own: Ownership = new Map()
  for (const [id, p] of Object.entries(PROVINCES)) if (p.home) own.set(id, p.home)
  return own
}

/**
 * Ownership only changes in the autumn, and only by standing there. A centre
 * you walked through in the spring is not yours, and a centre you left is
 * still yours until somebody else stands on it -- which is why a power with
 * no units at all can still be holding centres, and why the last thing a
 * dying power does is usually spite.
 */
export function updateOwnership(prev: Ownership, board: Board): Ownership {
  const own: Ownership = new Map(prev)
  for (const [p, unit] of board) if (PROVINCES[p]!.sc) own.set(p, unit.power)
  return own
}

export const centreCount = (own: Ownership, power: Power): number =>
  [...own.values()].filter((p) => p === power).length

export const unitCount = (board: Board, power: Power): number =>
  [...board.values()].filter((u) => u.power === power).length

/** Positive means build that many, negative means remove that many. */
export const adjustmentFor = (own: Ownership, board: Board, power: Power): number =>
  centreCount(own, power) - unitCount(board, power)

export interface BuildOption {
  at: string
  type: UnitType
}

/**
 * Where a power may build.
 *
 * Only in its own home centres, only while it still owns them, and only when
 * nothing is standing there. A fleet needs a coast, which is why St
 * Petersburg offers two of them and Moscow offers none.
 */
export function buildOptions(own: Ownership, board: Board, power: Power): BuildOption[] {
  const out: BuildOption[] = []
  for (const [id, province] of Object.entries(PROVINCES)) {
    if (province.home !== power) continue
    if (own.get(id) !== power) continue
    if (board.has(id)) continue
    out.push({ at: id, type: 'army' })
    if (province.terrain !== 'coast') continue
    for (const key of province.coasts ? province.coasts.map((c) => `${id}/${c}`) : [id]) {
      out.push({ at: key, type: 'fleet' })
    }
  }
  return out
}

/**
 * Which units go when a power will not say.
 *
 * The published rule for a player who has stopped answering: remove whatever
 * is furthest from home, fleets before armies at the same distance, and
 * alphabetically after that. It is arbitrary in the last step on purpose --
 * what matters is that it is the same arbitrary everywhere, so two
 * adjudicators never disagree about a game nobody was playing.
 */
export function civilDisorderDisbands(
  own: Ownership,
  board: Board,
  power: Power,
  howMany: number,
): Unit[] {
  /*
   * Distance is measured to the centres this power *owns*, not to the ones
   * it was born with. A Russia driven out of Moscow and holding Sweden
   * measures from Sweden -- home is where the supply is, and a unit far from
   * any of it is the one that is no longer doing anything.
   */
  const homes = [...own.entries()].filter(([, p]) => p === power).map(([id]) => id)

  /*
   * Distance is measured over the whole map, not over the graph the unit
   * itself moves on.
   *
   * That looks wrong for about a minute. An army counts sea provinces it
   * would need convoying across -- Albania is two steps from Naples over the
   * Adriatic, not unreachable -- and a fleet counts inland provinces it could
   * never enter, so the Baltic is two steps from Warsaw. Both are what the
   * published cases require, and both make sense once you see what is being
   * measured: not how the unit would get home, but how far out of the way it
   * is. A fleet in the Baltic is still in the middle of Russia's business. A
   * fleet in the North Atlantic is not.
   */
  const seen = new Set<string>()
  let edge = homes.map(base)
  const away = new Map<string, number>()
  for (let step = 0; edge.length > 0; step++) {
    const next: string[] = []
    for (const id of edge) {
      if (seen.has(id)) continue
      seen.add(id)
      away.set(id, step)
      for (const to of neighbours(id)) if (!seen.has(to)) next.push(to)
    }
    edge = next
  }

  const distance = (unit: Unit): number => away.get(base(unit.at)) ?? Number.MAX_SAFE_INTEGER

  return [...board.values()]
    .filter((u) => u.power === power)
    .map((u) => ({ u, d: distance(u) }))
    .sort(
      (a, b) =>
        b.d - a.d ||
        (a.u.type === b.u.type ? 0 : a.u.type === 'fleet' ? -1 : 1) ||
        a.u.at.localeCompare(b.u.at),
    )
    .slice(0, howMany)
    .map((x) => x.u)
}

/** Eliminated: no centres left. The units go with them. */
export const eliminated = (own: Ownership, power: Power): boolean => centreCount(own, power) === 0

/** Who, if anybody, has taken eighteen. */
export function soloWinner(own: Ownership): Power | null {
  for (const power of POWERS) if (centreCount(own, power) >= 18) return power
  return null
}

export type AdjustOrder =
  | { type: 'build'; at: string; unit: UnitType }
  | { type: 'disband'; at: string; unit?: UnitType }

export interface AdjustResult {
  board: Board
  /** Orders that were refused, by province. */
  illegal: Set<string>
}

/**
 * Builds and disbands, taken one at a time in the order they were given.
 *
 * One at a time matters. A power owed one unit that orders three builds has
 * not made three mistakes, it has made two -- the first order is carried out
 * and the rest are refused. Working out the whole set and rejecting it
 * wholesale would be tidier and would punish a slip far harder than the
 * rules do.
 */
export function applyAdjustments(
  own: Ownership,
  board: Board,
  power: Power,
  given: readonly AdjustOrder[],
): AdjustResult {
  const next: Board = new Map(board)
  const illegal = new Set<string>()
  const owed = adjustmentFor(own, next, power)
  let done = 0

  for (const order of given) {
    const at = base(order.at)

    if (order.type === 'build') {
      const allowed = buildOptions(own, next, power).some(
        (o) => o.at === order.at && o.type === order.unit,
      )
      if (!allowed || done >= owed) {
        illegal.add(at)
        continue
      }
      next.set(at, { power, type: order.unit, at: order.at })
      done++
      continue
    }

    const unit = next.get(at)
    const removable =
      unit !== undefined &&
      unit.power === power &&
      (order.unit === undefined || unit.type === order.unit)
    if (!removable || done >= -owed) {
      illegal.add(at)
      continue
    }
    next.delete(at)
    done++
  }

  return { board: next, illegal }
}

/** Everywhere touching a province, by land or by water, whoever could go. */
function neighbours(id: string): string[] {
  const out = new Set<string>(ARMY[id] ?? [])
  const coasts = PROVINCES[id]?.coasts
  const keys = coasts ? coasts.map((c) => `${id}/${c}`) : [id]
  for (const key of keys) for (const to of FLEET[key] ?? []) out.add(base(to))
  return [...out]
}
