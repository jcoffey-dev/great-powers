import type { Outcome } from './adjudicate'
import { PROVINCES, base } from './map'
import type { Board, Order } from './orders'
import type { AdjustOrder, RetreatOrder } from './turn'

/**
 * What a turn sounded like.
 *
 * The sounds are chosen from the orders and the outcome rather than fired
 * from inside the interface, for the same reason the orders are validated in
 * the rules rather than in the panel: this is a question with a right answer,
 * and a right answer can be tested. Nothing here touches an AudioContext.
 *
 * Each kind plays at most once. A turn with four land battles in it is not
 * four times as loud as a turn with one -- it is mud, and the player learns
 * nothing from it. So the report says *what kinds of thing happened*, and the
 * player looks at the board to find out where.
 */
export type Cue = 'escort' | 'naval' | 'ground' | 'retreat' | 'disband' | 'build'

/** Fixed, so a turn always plays its sounds in the same order. */
const ORDER: Cue[] = ['escort', 'naval', 'ground', 'retreat', 'disband', 'build']

const sorted = (cues: Set<Cue>): Cue[] => ORDER.filter((c) => cues.has(c))

/**
 * The movement phase.
 *
 * A province was fought over when somebody was thrown out of it, when two
 * units were sent to it, or when one unit was sent against another and did
 * not get in. A unit walking into empty country is not a battle, and a turn
 * where every power does that should be silent -- which happens, and is
 * worth hearing, because it means nobody committed to anything.
 */
export function movesSounded(
  board: Board,
  orders: readonly Order[],
  outcome: Outcome,
): Cue[] {
  const cues = new Set<Cue>()

  const arrivals = new Map<string, Order[]>()
  for (const order of orders) {
    if (order.type !== 'move') continue
    const dest = base(order.to)
    const list = arrivals.get(dest)
    if (list) list.push(order)
    else arrivals.set(dest, [order])
  }

  for (const [dest, movers] of arrivals) {
    const held = board.get(dest)
    const contested =
      outcome.dislodged.has(dest) ||
      movers.length > 1 ||
      (held !== undefined && !outcome.success.get(base(movers[0]!.at)))
    if (!contested) continue

    /*
     * Naval when it happened at sea, or when everybody involved was a fleet
     * -- two fleets contesting a coast is a fight between ships wherever the
     * pin is. A fleet against an army on a coast is a landing, and a landing
     * is ground.
     */
    const involved = [...movers.map((m) => board.get(base(m.at))), held].filter(
      (u) => u !== undefined,
    )
    const atSea = PROVINCES[dest]?.terrain === 'sea'
    cues.add(atSea || involved.every((u) => u.type === 'fleet') ? 'naval' : 'ground')
  }

  /*
   * An escort is a convoy that actually carried somebody across.
   *
   * Three things have to be true, and the two easy ones are not enough. A
   * fleet ordered to convoy an army that stayed at home did not escort
   * anything -- and a held order *succeeds*, so asking whether the army's
   * order worked is the wrong question. Ask whether it was ordered to make
   * this crossing, and whether it arrived.
   */
  const crossings = new Map<string, string>()
  for (const order of orders) {
    if (order.type === 'move') crossings.set(base(order.at), base(order.to))
  }
  for (const order of orders) {
    if (order.type !== 'convoy') continue
    if (!outcome.success.get(base(order.at))) continue
    if (crossings.get(base(order.from)) !== base(order.to)) continue
    if (!outcome.success.get(base(order.from))) continue
    cues.add('escort')
  }

  return sorted(cues)
}

/** The retreat phase: somebody fell back, or somebody did not. */
export function retreatsSounded(chosen: readonly RetreatOrder[]): Cue[] {
  const cues = new Set<Cue>()
  for (const order of chosen) cues.add(order.type === 'retreat' ? 'retreat' : 'disband')
  return sorted(cues)
}

/** The winter. */
export function buildsSounded(chosen: readonly AdjustOrder[]): Cue[] {
  const cues = new Set<Cue>()
  for (const order of chosen) cues.add(order.type === 'build' ? 'build' : 'disband')
  return sorted(cues)
}

/**
 * The four endings.
 *
 * They are four rather than two because losing has more than one shape. Being
 * eliminated in 1904 and watching Russia take an eighteenth centre in 1911
 * are both defeats, and they do not feel remotely alike -- one is your own
 * ending and the other is somebody else's, which you merely attended.
 */
export type Ending = 'victory' | 'defeat' | 'eliminated' | 'armistice'

export function endingSounded(
  winner: string | null,
  out: readonly string[],
  player: string,
): Ending {
  if (winner === player) return 'victory'
  if (out.includes(player)) return 'eliminated'
  if (winner) return 'defeat'
  return 'armistice'
}

/**
 * Two reports, run together.
 *
 * A submitted turn can pass through the movement, the retreats and the winter
 * before it stops anywhere the player has a say, and each of those has
 * something to say about how it sounded. Merging keeps the fixed order rather
 * than the order they were collected in, so a winter's guns still come before
 * its shipyards.
 */
export const mergeCues = (a: readonly Cue[], b: readonly Cue[]): Cue[] =>
  sorted(new Set([...a, ...b]))
