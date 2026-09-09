import { ARMY, FLEET, PROVINCES, SOLO, base, type Power } from './map'
import { canStep, type Board, type Unit } from './orders'
import { centreCount, type Ownership } from './turn'

/**
 * What a position is worth, and what a province is worth taking.
 *
 * Everything a bot does comes out of these two numbers, so they are worth
 * being explicit about rather than burying in the code that uses them.
 *
 * The first thing to say is that centres are the only thing that actually
 * counts. Units are how you get them and are worth nothing in themselves --
 * a power with eight units and four centres is losing, and will be down to
 * four units by the winter. Every other term here is a smaller correction on
 * top of that one fact.
 */

/** A centre is worth this much; everything else is priced against it. */
const CENTRE = 100

/** Being next to a centre you do not own is worth a fraction of taking it. */
const REACH = 12

/** A centre of yours with somebody standing next to it is worth defending. */
const THREAT = 40

/** And what each centre a power is *missing* adds to the price of its own. */
const WEAK = 40

export interface Position {
  board: Board
  own: Ownership
}

/**
 * How well a power is doing, in one number.
 *
 * Centres, plus a little for units that are actually near something worth
 * having, minus what is being threatened. Eighteen centres is the game, so
 * the scale is set by that: the difference between winning and not is always
 * larger than any positional consideration.
 */
export function standing(pos: Position, power: Power): number {
  const centres = centreCount(pos.own, power)
  if (centres >= SOLO) return Number.MAX_SAFE_INTEGER

  let score = centres * CENTRE

  for (const [at, unit] of pos.board) {
    if (unit.power !== power) continue
    for (const target of nextTo(base(unit.at))) {
      if (pos.own.get(target) !== power) score += REACH
    }
    if (PROVINCES[at]!.sc && pos.own.get(at) === power && pressured(pos, at, power)) {
      score -= THREAT
    }
  }
  return score
}

/**
 * What this power would give to have a unit standing here at the end of the
 * autumn. The number a bot sorts its options by.
 */
export function desire(pos: Position, power: Power, province: string): number {
  const p = PROVINCES[base(province)]!
  if (!p.sc) {
    // Not a centre, so worth only what it opens up next year.
    return nextTo(base(province)).filter((c) => pos.own.get(c) !== power).length * REACH
  }

  const owner = pos.own.get(base(province))
  if (owner === power) {
    /*
     * Yours already -- and since a unit standing on something is never sent
     * to take it, this price is only ever asked about one of yours that is
     * *empty*. An empty centre with somebody next to it is worth a whole
     * centre, because one unit of theirs walking in takes it and there is
     * nothing there to stop them. One with nobody next to it is worth
     * nothing at all: a quiet centre behind your own lines is not an
     * objective, and pricing it at a little was enough to have a ten-centre
     * Germany spend two of its eight units walking Warsaw to Moscow and
     * Munich to Berlin while the front stood still.
     */
    return pressured(pos, base(province), power) ? CENTRE : 0
  }
  // Somebody else's is worth slightly more than nobody's: it moves two
  // counts at once, theirs down and yours up.
  if (owner === undefined) return CENTRE
  /*
   * And a losing power's is worth more again.
   *
   * This is how a solo actually happens. Taking a centre off the power in
   * front of you costs the same as taking one off the power who is nearly
   * gone, and buys much less: the strong one takes it back, and the weak one
   * cannot. Piling on is unsporting, correct, and the only thing on this
   * board that compounds -- the fewer centres a power has, the fewer units,
   * and the less it can hold what is left.
   */
  return CENTRE + REACH + Math.max(0, 6 - centreCount(pos.own, owner)) * WEAK
}

/**
 * A centre of ours somebody could actually take: the one thing worth standing
 * still for.
 *
 * Two neighbours, not one. A single unit cannot dislodge another -- it needs
 * a supporter -- so garrisoning against one is a unit thrown away. That
 * sounds like a detail and it decided whole games: with one neighbour
 * counting as a threat, almost every centre on a crowded board is threatened,
 * almost every unit garrisons, and seven powers stare at each other for two
 * centuries without a province changing hands.
 */
export function threatened(pos: Position, power: Power, province: string): boolean {
  return pressure(pos, power, province) >= 2
}

/**
 * The largest force one power could bring against this centre.
 *
 * Two units, not two neighbours -- and belonging to the *same* power, which
 * is the part that took a frozen game to notice. Support comes from your own
 * units or from a deal; two enemies who have not agreed anything cannot
 * combine, so a centre with one German and one English unit beside it is not
 * under threat from either of them.
 *
 * Counting any two neighbours instead put half of every army on garrison
 * duty in a crowded position -- and the garrison was drawn from exactly the
 * units that would otherwise have attacked. Seven powers each defending
 * against a threat that did not exist is what a stalemate looks like from
 * the inside.
 */
export function pressure(pos: Position, power: Power, province: string): number {
  const id = base(province)
  if (!PROVINCES[id]!.sc || pos.own.get(id) !== power) return 0
  const byPower = new Map<Power, number>()
  for (const [, unit] of pos.board) {
    if (unit.power === power) continue
    if (!canArrive(unit, id)) continue
    byPower.set(unit.power, (byPower.get(unit.power) ?? 0) + 1)
  }
  return Math.max(0, ...byPower.values())
}

/** Could this unit step into that province, by whichever coast? */
function canArrive(unit: Unit, province: string): boolean {
  if (canStep(unit, province)) return true
  const coasts = PROVINCES[province]?.coasts
  return coasts !== undefined && coasts.some((c) => canStep(unit, `${province}/${c}`))
}

/** Is somebody else's unit standing next door to this centre of ours? */
function pressured(pos: Position, province: string, power: Power): boolean {
  for (const [, unit] of pos.board) {
    if (unit.power !== power && canArrive(unit, province)) return true
  }
  return false
}

/**
 * Supply centres next door to a province.
 *
 * Asked of the *province*, not of a unit standing in it, and that is the
 * whole point. The first version looked up the unit at the destination to
 * find out what it could reach -- and an empty province has no unit, so every
 * empty non-centre scored zero, every such move was skipped as worthless, and
 * fifteen of nineteen units held in Spring 1901. A game played out to 1967
 * ended with the board almost where it started, which is what sent me looking.
 */
const near: Record<string, string[]> = {}

function nextTo(province: string): string[] {
  if (near[province]) return near[province]!

  const out = new Set<string>()
  const add = (id: string) => {
    if (PROVINCES[base(id)]?.sc) out.add(base(id))
  }
  for (const to of ARMY[province] ?? []) add(to)
  const coasts = PROVINCES[province]?.coasts
  const keys = coasts ? coasts.map((c) => `${province}/${c}`) : [province]
  for (const key of keys) for (const to of FLEET[key] ?? []) add(to)

  out.delete(province)
  near[province] = [...out]
  return near[province]!
}
