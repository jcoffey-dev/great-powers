import { ARMY, FLEET, PROVINCES, SOLO, base, type Power } from './map'
import { canStep, type Board } from './orders'
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
    // Yours already. Worth holding exactly as much as it is under threat.
    return pressured(pos, base(province), power) ? CENTRE + THREAT : REACH
  }
  // Somebody else's is worth slightly more than nobody's: it moves two
  // counts at once, theirs down and yours up.
  return owner === undefined ? CENTRE : CENTRE + REACH
}

/**
 * A centre of ours with somebody else's unit next to it: the one thing worth
 * standing still for. Not a neutral centre we happen to be sitting on -- that
 * is worth taking, not worth freezing a unit over in the spring.
 */
export const threatened = (pos: Position, power: Power, province: string): boolean =>
  PROVINCES[base(province)]!.sc &&
  pos.own.get(base(province)) === power &&
  pressured(pos, base(province), power)

/** Is somebody else's unit standing next door to this centre of ours? */
function pressured(pos: Position, province: string, power: Power): boolean {
  for (const [, unit] of pos.board) {
    if (unit.power === power) continue
    if (canStep(unit, province)) return true
    const coasts = PROVINCES[province]?.coasts
    if (coasts && coasts.some((c) => canStep(unit, `${province}/${c}`))) return true
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
