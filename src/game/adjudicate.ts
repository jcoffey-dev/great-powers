import { ARMY, base } from './map'
import { canStep, convoyRoute, validate, type Board, type Order, type Unit } from './orders'

/**
 * The adjudicator.
 *
 * This is the part that has to be exactly right rather than approximately
 * right, because a subtly wrong adjudicator plays perfectly well and is
 * simply a different game. The method is Lucas Kruijswijk's: work out each
 * order's outcome from the others, and when that turns out to be circular --
 * which it genuinely can be, this game has real paradoxes in it -- guess,
 * see whether both guesses agree, and fall back to a stated rule when they
 * do not.
 *
 * Four strengths do all the work, and every one of them is a number:
 *
 *   - **attack**: how hard a move pushes, once supports are counted;
 *   - **hold**: how hard the destination resists;
 *   - **defend**: how hard a unit pushes back when the two are swapping;
 *   - **prevent**: how hard a move stops anybody *else* taking the province,
 *     even when it fails itself.
 *
 * A move succeeds when it beats the right one of those, strictly. Ties bounce,
 * which is the rule the whole game is balanced on.
 */

export interface Dislodgement {
  unit: Unit
  /** Where the attacker came from. A unit may not retreat back into it. */
  attackedFrom: string
  /**
   * The attacker came over water. That lifts the restriction above: a unit
   * put ashore by a convoy never passed through the ground between, so there
   * is nothing to say the loser cannot fall back that way.
   */
  byConvoy: boolean
}

export interface Outcome {
  /** Province -> did the order given there succeed. */
  success: Map<string, boolean>
  /** Province -> the unit thrown out of it. */
  dislodged: Map<string, Dislodgement>
  /** Provinces left empty by a bounce, which nobody may retreat into. */
  bounced: Set<string>
}

type State = 'unresolved' | 'guessing' | 'resolved'

/**
 * Thrown when a convoy paradox turns up, to start the whole resolution again
 * with that convoy's army held still. Restarting is not elegant and it is
 * provably finite, which matters more: every restart forces one more army to
 * stand, and there are only so many armies.
 */
class Paradox extends Error {
  stalled: readonly string[]
  constructor(stalled: readonly string[]) {
    super('convoy paradox')
    this.stalled = stalled
  }
}

export function adjudicate(board: Board, orderList: readonly Order[]): Outcome {
  const forced = new Set<string>()
  for (;;) {
    try {
      return resolveAll(board, orderList, forced)
    } catch (e) {
      if (!(e instanceof Paradox)) throw e
      const before = forced.size
      for (const p of e.stalled) forced.add(p)
      // No progress would mean looping forever; there is a bug if it happens.
      if (forced.size === before) throw new Error('paradox made no progress')
    }
  }
}

function resolveAll(
  board: Board,
  orderList: readonly Order[],
  /** Convoyed armies a paradox has already forced to stand still. */
  forced: ReadonlySet<string>,
): Outcome {
  // A unit with no order holds, and so does a unit whose order was refused.
  const { orders, illegal, orderedAway } = validate(board, orderList)

  const state = new Map<string, State>()
  const result = new Map<string, boolean>()
  const dep: string[] = []
  for (const p of orders.keys()) state.set(p, 'unresolved')

  const orderAt = (p: string) => orders.get(p)
  const unitAt = (p: string) => board.get(p)

  /** Every move order aimed at this province. */
  const movesInto = (dest: string): string[] => {
    const out: string[] = []
    for (const [p, o] of orders) {
      if (o.type === 'move' && base(o.to) === dest) out.push(p)
    }
    return out
  }

  /**
   * Two units swapping places without a convoy under either of them. It is
   * its own case because neither can simply walk through the other: they are
   * measured against each other rather than against the ground.
   */
  const headToHead = (p: string): string | null => {
    const o = orderAt(p)
    if (o?.type !== 'move') return null
    const dest = base(o.to)
    const other = orderAt(dest)
    if (other?.type !== 'move' || base(other.to) !== p) return null
    if (isConvoyed(p) || isConvoyed(dest)) return null
    return dest
  }

  /**
   * Is this move going over water rather than across a border?
   *
   * Only interesting when both are possible, and then it is a question about
   * intent rather than about the map -- and intent decides whether two units
   * swapping places bounce off each other or sail past each other.
   *
   * The rule the published cases settle on: an army goes by convoy if it was
   * ordered to, or if its **own power** gave at least one convoy order for
   * that move that was a legal order. Somebody else's fleets offering to
   * carry you is not intent, however good the route -- and your own fleet
   * offering from a sea it could never do it from is not intent either,
   * because that was not an order. Once intent exists, any ordered route may
   * do the carrying, including a foreign one.
   */
  function isConvoyed(p: string): boolean {
    const o = orderAt(p)
    const unit = unitAt(p)
    if (o?.type !== 'move' || unit?.type !== 'army') return false

    const overland = (ARMY[base(unit.at)] ?? []).includes(base(o.to))
    if (!overland) return true
    if (o.viaConvoy) return true

    for (const [q, c] of orders) {
      if (c.type !== 'convoy') continue
      if (base(c.from) !== p || base(c.to) !== base(o.to)) continue
      if (unitAt(q)?.power === unit.power) return true
    }
    return false
  }

  /** Fleets convoying that are being thrown out of their sea as we speak. */
  const brokenConvoys = (): Set<string> => {
    const gone = new Set<string>()
    for (const [p, o] of orders) {
      if (o.type === 'convoy' && !resolve(p)) gone.add(p)
    }
    return gone
  }

  /** Can this move physically happen at all? Zero attack strength if not. */
  function hasPath(p: string): boolean {
    // An army Szykman's rule has told to stand has no route anywhere, and
    // therefore no weight: it cuts nothing and prevents nothing. Leaving it
    // with a path is what let the paradox re-form on the next pass.
    if (forced.has(p)) return false
    const o = orderAt(p)
    const unit = unitAt(p)
    if (o?.type !== 'move' || !unit) return false
    if (unit.type === 'fleet') return canStep(unit, o.to)
    if (!isConvoyed(p)) return canStep(unit, o.to)
    return convoyRoute(board, orders, unit.at, o.to, brokenConvoys()) !== null
  }

  /**
   * Supports for this move that actually count.
   *
   * `notFrom` drops supports belonging to the power being dislodged: you may
   * not help a foreigner throw your own unit out of a province.
   */
  function supportsFor(p: string, notFrom: string | null): number {
    const o = orderAt(p)
    if (o?.type !== 'move') return 0
    let n = 0
    for (const [q, s] of orders) {
      if (s.type !== 'support') continue
      if (base(s.from) !== p || base(s.to) !== base(o.to)) continue
      // Naming a coast is allowed and then it has to be the right coast.
      if (s.to.includes('/') && o.to.includes('/') && s.to !== o.to) continue
      if (notFrom !== null && unitAt(q)?.power === notFrom) continue
      if (resolve(q)) n++
    }
    return n
  }

  function supportsToHold(dest: string): number {
    let n = 0
    for (const [q, s] of orders) {
      if (s.type !== 'support') continue
      if (base(s.from) !== dest || base(s.to) !== dest) continue
      if (resolve(q)) n++
    }
    return n
  }

  function attackStrength(p: string): number {
    const o = orderAt(p)
    if (o?.type !== 'move' || !hasPath(p)) return 0
    const dest = base(o.to)
    const mover = unitAt(p)!
    const occupier = unitAt(dest)
    if (!occupier) return 1 + supportsFor(p, null)

    const theirOrder = orderAt(dest)
    const swapping = headToHead(p) !== null
    if (theirOrder?.type === 'move' && !swapping && resolve(dest)) {
      // They left. Nobody is being dislodged, so nationality does not matter.
      return 1 + supportsFor(p, null)
    }

    /*
     * You cannot drive out your own piece -- Calhamer's rule, so that nobody
     * can secure a retreat for themselves by force. Worth noticing what else
     * falls out of it: a unit moving against a countryman has attack strength
     * zero, and a move with no strength cuts no support. That is why a power
     * cannot cut its own support, and it is a consequence of this line rather
     * than a separate rule anybody has to remember.
     */
    if (occupier.power === mover.power) return 0
    return 1 + supportsFor(p, occupier.power)
  }

  function holdStrength(dest: string): number {
    if (!unitAt(dest)) return 0
    const o = orderAt(dest)
    if (o?.type === 'move') return resolve(dest) ? 0 : 1
    /*
     * A unit told to move cannot be supported where it stands, and the first
     * branch above covers the ones whose orders survived. This covers the
     * rest: an order this position allowed and that merely did not come off
     * still means the unit tried to leave. An order the position never
     * allowed is ignored, and that unit is holding like any other and may be
     * held down. See `orderedAway` for which is which.
     */
    if (orderedAway.has(dest)) return 1
    return 1 + supportsToHold(dest)
  }

  const defendStrength = (p: string): number => 1 + supportsFor(p, null)

  function preventStrength(p: string): number {
    if (!hasPath(p)) return 0
    const other = headToHead(p)
    if (other !== null && resolve(other)) return 0
    return 1 + supportsFor(p, null)
  }

  // ------------------------------------------------------------- one order

  function adjudicateOne(p: string): boolean {
    const o = orderAt(p)!

    // Szykman's rule, already applied: this army was carried into a paradox
    // on an earlier pass and has been told to stand.
    if (forced.has(p)) return false

    if (o.type === 'hold') return true

    if (o.type === 'convoy') {
      // A convoy carries on unless the fleet is thrown out of the sea.
      return !isDislodged(p)
    }

    if (o.type === 'support') {
      if (isDislodged(p)) return false
      for (const q of movesInto(p)) {
        // An attack coming from the very province the support is aimed at
        // does not cut it. Everything else does, if it has any weight.
        if (q === base(o.to)) continue
        if (attackStrength(q) >= 1) return false
      }
      return true
    }

    // A move.
    if (!hasPath(p)) return false
    const dest = base(o.to)
    const attack = attackStrength(p)

    for (const rival of movesInto(dest)) {
      if (rival === p) continue
      if (attack <= preventStrength(rival)) return false
    }

    const swap = headToHead(p)
    if (swap !== null) return attack > defendStrength(swap)
    return attack > holdStrength(dest)
  }

  /** Is the unit standing here thrown out of it? */
  function isDislodged(p: string): boolean {
    if (!unitAt(p)) return false
    const own = orderAt(p)
    if (own?.type === 'move' && resolve(p)) return false
    return movesInto(p).some((q) => resolve(q))
  }

  // --------------------------------------------------------- the resolver

  /**
   * Kruijswijk's resolver.
   *
   * Guess that an order fails and work out what follows. If nothing depended
   * on the guess, that is the answer. If something did, guess the other way:
   * agreeing answers are the answer, and disagreeing ones mean a genuine
   * cycle, which the backup rule below settles.
   */
  const stack: string[] = []

  function resolve(p: string): boolean {
    const s = state.get(p)
    if (s === 'resolved') return result.get(p)!
    if (s === 'guessing') {
      if (!dep.includes(p)) dep.push(p)
      return result.get(p)!
    }

    const mark = dep.length
    /*
     * Who is already guessing further down the stack.
     *
     * This is the difference between settling a cycle and appearing to. Only
     * the *outermost* order in a cycle may take the two guesses, because its
     * answer is the one everything else was computed against. An inner order
     * that finds itself first in the dependency list will otherwise declare
     * the cycle its own, take both guesses with its callers' provisional
     * answers held fixed, get the same result twice for that reason, and
     * record it as settled. The cycle is then invisible: the backup rule
     * never runs, and the position quietly resolves to whichever of its two
     * consistent readings the search happened to walk into first.
     *
     * 6.F.22 is the case that found this. The English Channel put itself
     * forward as the head while Edinburgh and London -- both in the same
     * paradox -- were still on the stack below it.
     */
    const below = new Set(stack)
    stack.push(p)
    state.set(p, 'guessing')
    result.set(p, false)
    const first = adjudicateOne(p)

    if (dep.length === mark) {
      /*
       * Nothing depended on the guess, so the answer stands -- unless the
       * order resolved itself while we were away. A nested call can reach
       * the backup rule, settle this very province, and return; writing the
       * guess over that answer loses it, and the cycle it was settling
       * quietly re-forms as a fixed point nobody detects.
       */
      stack.pop()
      if (state.get(p) !== 'resolved') {
        state.set(p, 'resolved')
        result.set(p, first)
      }
      return result.get(p)!
    }

    /*
     * Am I the outermost order of this cycle?
     *
     * Only if the cycle came back round to me at all, and only if none of
     * its other members is still waiting further down the stack. Anything
     * else reports what it has and lets the one below ask.
     */
    const cycle = dep.slice(mark)
    if (!cycle.includes(p) || cycle.some((q) => below.has(q))) {
      stack.pop()
      dep.push(p)
      result.set(p, first)
      return first
    }

    while (dep.length > mark) state.set(dep.pop()!, 'unresolved')

    state.set(p, 'guessing')
    result.set(p, true)
    const second = adjudicateOne(p)

    if (first === second) {
      while (dep.length > mark) state.set(dep.pop()!, 'unresolved')
      stack.pop()
      state.set(p, 'resolved')
      result.set(p, first)
      return first
    }

    stack.pop()
    backup(mark)
    return resolve(p)
  }

  /**
   * A cycle that does not settle. There are exactly two kinds in this game
   * and they are settled differently:
   *
   *   - **a ring of units all moving into each other's provinces.** Nobody is
   *     dislodging anybody; they all shuffle round, so they all succeed.
   *   - **a convoy paradox**, where whether a convoy survives depends on the
   *     move the convoy is carrying. Szykman's rule: the convoyed move fails
   *     and everything else is worked out from there. It is a convention
   *     rather than a deduction, which is why it is written down here rather
   *     than buried in the arithmetic.
   */
  function backup(mark: number) {
    const cycle = dep.slice(mark)
    dep.length = mark

    const convoys = cycle.filter((p) => orderAt(p)?.type === 'convoy')

    if (convoys.length > 0) {
      /*
       * A convoy paradox: whether the convoy survives depends on the move the
       * convoy is carrying. Szykman's rule settles it -- the convoyed move
       * fails -- and it is a convention rather than a deduction, which is why
       * it is written down here rather than buried in the arithmetic.
       *
       * The armies stalled are the ones those convoy orders name, not merely
       * the ones that happen to be in the cycle, which in a real paradox is
       * often none of them. Settling it by restarting rather than by patching
       * the half-resolved state is what makes it terminate.
       */
      const stalled: string[] = []
      for (const c of convoys) {
        const o = orderAt(c)
        if (o?.type === 'convoy') stalled.push(base(o.from))
      }
      throw new Paradox(stalled)
    }

    {
      // A ring of units all moving into each other. Nobody dislodges
      // anybody; they all shuffle round, so they all go.
      // A ring of units all moving into each other. Nobody dislodges
      // anybody; they all shuffle round, so they all go.
      for (const p of cycle) {
        state.set(p, 'resolved')
        result.set(p, true)
      }
    }
  }

  // ------------------------------------------------------------------ run

  const success = new Map<string, boolean>()
  for (const p of orders.keys()) success.set(p, resolve(p))
  // An order that was never a legal order did not succeed at anything.
  for (const p of illegal) success.set(p, false)

  const dislodged = new Map<string, Dislodgement>()
  for (const p of board.keys()) {
    if (!isDislodged(p)) continue
    const attacker = movesInto(p).find((q) => success.get(q))!
    dislodged.set(p, {
      unit: unitAt(p)!,
      attackedFrom: attacker,
      byConvoy: isConvoyed(attacker),
    })
  }

  /*
   * A province where two moves bounced is closed to retreats. It is the one
   * piece of this that the retreat phase needs and the movement phase is the
   * only thing that knows it.
   */
  const bounced = new Set<string>()
  for (const [p] of orders) {
    const o = orderAt(p)
    if (o?.type !== 'move' || success.get(p)) continue
    const dest = base(o.to)
    if (!unitAt(dest) && movesInto(dest).filter((q) => hasPath(q)).length > 1) bounced.add(dest)
  }

  return { success, dislodged, bounced }
}
