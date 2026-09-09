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
      return settle(board, orderList, forced)
    } catch (e) {
      if (!(e instanceof Paradox)) throw e
      const before = forced.size
      for (const p of e.stalled) forced.add(p)
      // No progress would mean looping forever; there is a bug if it happens.
      if (forced.size === before) throw new Error('paradox made no progress')
    }
  }
}

/**
 * Resolve, then ask the answer to justify itself.
 *
 * The resolver guesses, and a guess is only ever tested against the guesses
 * in force beside it. In a position with several cycles knotted together
 * that is not always enough: two readings can each be locally consistent,
 * and the one the search lands on depends on which order it happened to
 * start from. The document is explicit that there is no straightforward way
 * to fix this inside the recursion.
 *
 * So it is fixed outside it. Run the resolution again, but starting each
 * order from the answer the last run gave it rather than from `false`. A
 * reading that is genuinely settled reproduces itself and we stop; one that
 * was an artefact of where the search began does not, and the next run is
 * started from somewhere better. Four passes, because a position that has
 * not agreed with itself by then is oscillating rather than converging, and
 * the first answer is as good as any.
 */
function settle(
  board: Board,
  orderList: readonly Order[],
  forced: ReadonlySet<string>,
): Outcome {
  const first = resolveAll(board, orderList, forced)
  let out = first
  for (let pass = 0; pass < 4; pass++) {
    const again = resolveAll(board, orderList, forced, out.success)
    let agrees = true
    for (const [p, v] of again.success) if (out.success.get(p) !== v) agrees = false
    if (agrees) return again
    out = again
  }
  // Still arguing with itself after four passes: oscillating rather than
  // converging, and the first answer is as good as any of them.
  return first
}

function resolveAll(
  board: Board,
  orderList: readonly Order[],
  /** Convoyed armies a paradox has already forced to stand still. */
  forced: ReadonlySet<string>,
  /** Where to start each order's guess, from a previous run. */
  seed?: ReadonlyMap<string, boolean>,
): Outcome {
  // A unit with no order holds, and so does a unit whose order was refused.
  const { orders, illegal, orderedAway } = validate(board, orderList)

  const result = new Map<string, boolean>()

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
      /*
       * A convoy carries on unless the fleet is thrown out of the sea -- and
       * the attackers are adjudicated directly rather than asked through the
       * resolver, which is the document's own advice (section 5.D).
       *
       * Routing this one question through `resolve` makes a convoy's
       * survival a recorded dependency of every unit attacking it, and the
       * dependency graph stops being a collection of clean single cycles.
       * Pandin's paradox is the small example: the English Channel comes to
       * depend on Wales and Belgium, neither of which is a decision the
       * paradox turns on, and a guessing algorithm cannot tell which of the
       * four orders is the one worth guessing about. Skipping the memo here
       * costs a little recomputation and keeps every cycle simple enough to
       * settle.
       */
      return !movesInto(p).some((q) => adjudicateOne(q))
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
   * Kruijswijk's resolver, in the corrected form the document publishes for
   * positions with more than one cycle in them.
   *
   * The idea is small: guess that an order fails and work out what follows.
   * If nothing along the way depended on the guess, that is the answer. If
   * something did, guess the other way -- agreeing answers are the answer,
   * and disagreeing ones mean a real cycle, which the backup rule settles.
   *
   * The corrections are where all the difficulty lives, and both are about
   * asking the right question:
   *
   *   - **`guessBased`** answers "did this order's answer rest on a guess?"
   *     The obvious substitute -- did the dependency list grow while we were
   *     away -- is not the same question once several cycles are in play,
   *     because the list may have grown for somebody else entirely. It is
   *     saved and restored around every frame so it only ever describes the
   *     subtree below that frame.
   *
   *   - **`hits`** answers "am I the order the whole cycle hangs from?" It
   *     counts how many times the recursion came back to an order already on
   *     the stack. Discounting the times it came back to *me*, if the count
   *     is unchanged then nothing below me is waiting on anything above me,
   *     and the cycle is mine to settle. Otherwise it belongs to a caller
   *     and I hand up what I have.
   *
   * Getting the second one wrong is what 6.F.28 catches: six convoy
   * paradoxes arranged in a ring, each a tidy four-order cycle in its own
   * right. Every one of them settled itself against a caller's provisional
   * answer and recorded it as final, and the ring they were links in was
   * never seen at all.
   */
  const cycle: string[] = []
  const visited = new Set<string>()
  const resolved = new Set<string>()
  let guessBased = false
  let hits = 0

  function resolve(p: string): boolean {
    if (resolved.has(p)) return result.get(p)!

    // Already named as part of a cycle: its value is a guess, not an answer.
    if (cycle.includes(p)) {
      guessBased = true
      return result.get(p)!
    }

    // Back round to an order still on the stack. That is a cycle, and this
    // is the moment it becomes visible.
    if (visited.has(p)) {
      cycle.push(p)
      guessBased = true
      hits++
      return result.get(p)!
    }

    visited.add(p)
    const wasCycle = cycle.length
    const wasGuessBased = guessBased
    const wasHits = hits
    guessBased = false

    const start = seed?.get(p) ?? false
    result.set(p, start)
    const first = adjudicateOne(p)

    if (!guessBased) {
      // Nothing under here leaned on a guess, so this is simply the answer.
      guessBased = wasGuessBased
      result.set(p, first)
      resolved.add(p)
      return first
    }

    // One of the hits was the recursion coming back round to me, which does
    // not count against being the order the cycle hangs from.
    if (cycle.includes(p)) hits--

    /*
     * `hits` says the recursion came back only to me. That is the
     * document's test and it is not quite enough on its own: an order named
     * in the cycle that is *still on the stack* is one of my own callers,
     * and while one of those is waiting the answer is theirs to settle, not
     * mine. Descendants are removed from `visited` as they return, so
     * anything left is above me.
     */
    const callerWaiting = cycle.some((q) => q !== p && visited.has(q))

    if (hits === wasHits && !callerWaiting) {
      cycle.length = wasCycle
      result.set(p, !start)
      const second = adjudicateOne(p)

      if (first === second) {
        // A cycle, but only one answer in it.
        cycle.length = wasCycle
        guessBased = wasGuessBased
        result.set(p, first)
        resolved.add(p)
        return first
      }

      backup(cycle.slice(wasCycle))
      cycle.length = wasCycle
      guessBased = wasGuessBased
      visited.delete(p)
      // The backup rule may or may not have settled this one.
      return resolve(p)
    }

    // In a cycle, but not the order it hangs from. Hand up what we have and
    // remember it, in case somebody asks again before it is settled.
    if (!cycle.includes(p)) cycle.push(p)
    result.set(p, first)
    visited.delete(p)
    return first
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
  function backup(members: readonly string[]) {
    const convoys = members.filter((p) => orderAt(p)?.type === 'convoy')

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
      for (const p of members) {
        resolved.add(p)
        result.set(p, true)
      }
    }
  }

  // ------------------------------------------------------------------ run

  const success = new Map<string, boolean>()
  for (const p of orders.keys()) {
    /*
     * Each order is asked from a clean slate. The bookkeeping above is
     * scoped to one descent -- an order left named in `cycle` by a frame
     * that handed its answer upward is meaningless once that descent is
     * over, and reading it later makes an unrelated order look as though it
     * rested on a guess when it did not.
     */
    cycle.length = 0
    hits = 0
    guessBased = false
    success.set(p, resolve(p))
  }
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
