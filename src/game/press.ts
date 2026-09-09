import { base, type Power } from './map'
import type { Board, Order } from './orders'
import type { Ownership } from './turn'

/**
 * The press: what powers say to each other, and what it costs to lie.
 *
 * Every offer here is concrete and about a named turn. That is deliberate and
 * it is the whole design. Free text would need a model to read it, could not
 * be checked, and could not be tested; and a game where the machine decides
 * by feel whether you kept your word is a game where being betrayed feels
 * arbitrary rather than infuriating. These deals can be checked against the
 * orders that were actually submitted, by arithmetic, every time.
 *
 * Three things a power can offer, because these are the three things that
 * actually change a turn:
 *
 *   - **support**, which wins a specific province on a specific turn;
 *   - **a demilitarised province**, which is how two powers agree to look
 *     somewhere else;
 *   - **peace**, which is the promise not to touch each other at all.
 *
 * And the important part: nothing here enforces anything. A deal is a
 * sentence, orders are orders, and the gap between them is the game.
 */

export type Deal =
  /** `helper` will support `mover`'s move from -> to. */
  | { kind: 'support'; mover: Power; helper: Power; from: string; to: string }
  /** Neither party enters this province. */
  | { kind: 'dmz'; province: string }
  /** Neither party moves against the other at all. */
  | { kind: 'peace' }

export interface Proposal {
  id: string
  from: Power
  to: Power
  /** The turn it binds. A deal is always about a particular turn. */
  turn: number
  deal: Deal
}

export type Reply = 'accept' | 'refuse'

/** An accepted proposal. Binding on both parties, and on neither. */
export type Agreement = Proposal

export const parties = (a: Agreement): [Power, Power] => [a.from, a.to]

// ------------------------------------------------------------ double deals

/**
 * Two agreements that cannot both be kept.
 *
 * This is the mechanic rather than a safeguard against one. Promising
 * Galicia to Austria and supporting Russia into it on the same turn is not a
 * mistake the interface should prevent -- it is a double deal, and somebody
 * is going to find out. What this does is make it a *deliberate* act: a
 * power can be shown, at the moment of agreeing, that it has now promised
 * two things it cannot both do.
 */
export function conflicts(a: Agreement, b: Agreement): boolean {
  if (a.turn !== b.turn) return false

  const enters = (x: Agreement): string | null =>
    x.deal.kind === 'support' ? base(x.deal.to) : null
  const closed = (x: Agreement): string | null =>
    x.deal.kind === 'dmz' ? base(x.deal.province) : null

  // Supporting somebody into a province you have agreed to keep empty.
  const one = enters(a)
  const two = closed(b)
  if (one !== null && two !== null && one === two) return true

  const three = enters(b)
  const four = closed(a)
  if (three !== null && four !== null && three === four) return true

  // Two different supports promised by the same power on the same turn are
  // fine -- a power may have several units -- but the same unit cannot
  // support two moves at once.
  if (a.deal.kind === 'support' && b.deal.kind === 'support') {
    if (a.deal.helper !== b.deal.helper) return false
    if (a.deal.from === b.deal.from && a.deal.to === b.deal.to) return false
    return true
  }

  return false
}

// -------------------------------------------------------------- keeping it

export interface Verdict {
  agreement: Agreement
  power: Power
  kept: boolean
  /** In the machine's own words, for the log and for the other power. */
  why: string
}

/**
 * Did each party do what it said it would?
 *
 * Judged on the **orders given**, never on how they turned out. A support
 * that was ordered and then cut was still given; a move that was ordered and
 * bounced was still attempted. Blaming a power for a bounce would make every
 * alliance a lottery, and worse, would make an honest ally look like a liar
 * for something the dice did.
 */
export function judge(
  agreement: Agreement,
  orders: ReadonlyMap<Power, readonly Order[]>,
  board: Board,
  /** Who owns which centre, so peace can cover the empty ones too. */
  own?: Ownership,
): Verdict[] {
  const deal = agreement.deal
  const given = (p: Power) => orders.get(p) ?? []

  if (deal.kind === 'support') {
    const promised = given(deal.helper).some(
      (o) =>
        o.type === 'support' && base(o.from) === base(deal.from) && base(o.to) === base(deal.to),
    )
    const attempted = given(deal.mover).some(
      (o) => o.type === 'move' && base(o.at) === base(deal.from) && base(o.to) === base(deal.to),
    )
    return [
      {
        agreement,
        power: deal.helper,
        kept: promised,
        why: promised ? 'gave the support' : 'did not order the support',
      },
      {
        agreement,
        power: deal.mover,
        kept: attempted,
        why: attempted ? 'made the move' : 'did not make the move it asked help for',
      },
    ]
  }

  if (deal.kind === 'dmz') {
    const province = base(deal.province)
    return parties(agreement).map((power) => {
      const went = given(power).some((o) => o.type === 'move' && base(o.to) === province)
      return {
        agreement,
        power,
        kept: !went,
        why: went ? `moved into ${province}` : `stayed out of ${province}`,
      }
    })
  }

  /*
   * Peace. Touching anything of theirs breaks it: the provinces their units
   * are standing in, and the centres they own even when nobody is standing
   * there. Walking into an undefended centre and calling it peace because
   * nobody was home is exactly the move this has to catch.
   */
  return parties(agreement).map((power) => {
    const them = power === agreement.from ? agreement.to : agreement.from
    const theirs = new Set(
      [...board.entries()].filter(([, u]) => u.power === them).map(([p]) => p),
    )
    if (own) for (const [p, who] of own) if (who === them) theirs.add(p)
    const against = given(power).find((o) => o.type === 'move' && theirs.has(base(o.to)))
    return {
      agreement,
      power,
      kept: against === undefined,
      why:
        against && against.type === 'move'
          ? `moved on ${base(against.to)}`
          : 'kept off them entirely',
    }
  })
}

// ------------------------------------------------------------------ memory

export interface Record_ {
  kept: number
  broken: number
  /** The turns it went wrong, so a power can say when rather than how often. */
  betrayals: number[]
}

/** What each power thinks of each other power. Directional, and it matters. */
export type Ledger = Map<string, Record_>

const key = (observer: Power, subject: Power) => `${observer}:${subject}`

export const emptyLedger = (): Ledger => new Map()

export function look(ledger: Ledger, observer: Power, subject: Power): Record_ {
  return ledger.get(key(observer, subject)) ?? { kept: 0, broken: 0, betrayals: [] }
}

/**
 * Write the turn into everybody's memory.
 *
 * Only the other party to a deal learns from it directly, which is the point
 * of a game played in private. What the rest of the board knows is what it
 * can see -- and that is handled elsewhere, by looking at the map, not here.
 */
export function remember(ledger: Ledger, verdicts: readonly Verdict[]): Ledger {
  const next: Ledger = new Map(ledger)
  for (const v of verdicts) {
    const other = v.power === v.agreement.from ? v.agreement.to : v.agreement.from
    const at = key(other, v.power)
    const was = next.get(at) ?? { kept: 0, broken: 0, betrayals: [] }
    next.set(at, {
      kept: was.kept + (v.kept ? 1 : 0),
      broken: was.broken + (v.kept ? 0 : 1),
      betrayals: v.kept ? was.betrayals : [...was.betrayals, v.agreement.turn],
    })
  }
  return next
}

/**
 * How far one power will trust another, from nothing to complete.
 *
 * A power nobody has dealt with sits at 0.6 rather than 0.5: somebody you
 * have never dealt with is a better bet than somebody who has already lied
 * to you once, and a game where every stranger is treated as a proven liar
 * never gets started at all.
 *
 * Betrayals also fade. Not to nothing -- the count never leaves the ledger --
 * but a stab in 1901 should not still be the loudest fact about a power in
 * 1910, or no alliance could ever re-form, and re-forming a broken alliance
 * out of pure need is one of the best things this game does.
 */
export function trust(ledger: Ledger, observer: Power, subject: Power, turn: number): number {
  const r = look(ledger, observer, subject)
  if (r.kept === 0 && r.broken === 0) return 0.6

  const weigh = (t: number) => 1 / (1 + Math.max(0, turn - t) / 8)
  const hurt = r.betrayals.reduce((n, t) => n + weigh(t), 0)
  const score = (r.kept - 2 * hurt) / (r.kept + r.broken)
  return Math.max(0, Math.min(1, (score + 1) / 2))
}
