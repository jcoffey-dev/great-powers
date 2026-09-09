import { desire, standing, threatened, type Position } from './evaluate'
import { PROVINCES, base, type Power } from './map'
import { canStep, validate, type Order, type Unit } from './orders'
import { trust, type Agreement, type Ledger, type Proposal, type Reply } from './press'

/**
 * A computer power: what it does, and why.
 *
 * Two rules shaped all of this. It has to play a recognisable game -- take
 * what is undefended, defend what is threatened, put two units on a province
 * worth two units -- and every decision it makes has to be one a person can
 * read afterwards. That is why nothing here is a weighted sum of forty
 * features: when a power turns on you, you are entitled to know what it
 * thought it was getting, and be furious about the price rather than confused
 * by it.
 */

/** What a working relationship is worth, in the same units as a centre. */
const FRIEND = 55

/** And what it is worth per centre of yours the partner is standing next to. */
const NEIGHBOUR = 25

export interface Mind {
  power: Power
  ledger: Ledger
  /** Deals binding this turn. */
  agreements: readonly Agreement[]
}

export interface Choice {
  orders: Order[]
  /** Deals this power decided to break, and what it thought it was worth. */
  broke: { agreement: Agreement; gain: number; cost: number }[]
  /** One line per decision, in the order they were taken. */
  reasoning: string[]
}

/** Everywhere a unit could legally go, itself included. */
function options(unit: Unit): string[] {
  const out: string[] = [base(unit.at)]
  for (const [id, p] of Object.entries(PROVINCES)) {
    if (canStep(unit, id)) out.push(id)
    if (p.coasts) for (const c of p.coasts) if (canStep(unit, `${id}/${c}`)) out.push(`${id}/${c}`)
  }
  return out
}

/**
 * What this power will actually order.
 *
 * A greedy plan, taken in order of what is worth most: claim the best
 * province some unit of mine can reach, then look for a second unit that can
 * reach it too and have that one push instead of wandering off. Two units on
 * one province is how anything defended is ever taken, and a bot that never
 * does it is not playing the game.
 *
 * Agreements are applied afterwards rather than as a constraint on the
 * search, on purpose: the plan has to know what it is giving up before it can
 * decide whether the promise is worth keeping.
 */
export function chooseOrders(pos: Position, mind: Mind, turn: number): Choice {
  const mine = [...pos.board.entries()].filter(([, u]) => u.power === mind.power)
  const reasoning: string[] = []

  const wants: { at: string; to: string; worth: number }[] = []
  for (const [at, unit] of mine) {
    for (const to of options(unit)) {
      if (base(to) === at) continue
      // Never shove at your own countryman. A move against a unit of your
      // own power has no strength at all, so it is not a move, it is two
      // units wasting a turn on each other.
      if (pos.board.get(base(to))?.power === mind.power) continue
      wants.push({ at, to, worth: desire(pos, mind.power, to) })
    }
  }
  wants.sort((a, b) => b.worth - a.worth || a.to.localeCompare(b.to))

  const orders = new Map<string, Order>()
  const claimed = new Set<string>()

  /*
   * Garrison first. A unit already standing on something worth having claims
   * it by staying there, before anybody goes looking for somewhere better.
   *
   * Without this the bot does something that looks deranged and is a direct
   * consequence of only ever scoring *moves*: with Munich and Berlin both
   * threatened and only one spare unit, it marched the Munich garrison to
   * Berlin -- defending one centre by abandoning another of exactly the same
   * value. A province you are standing in is already yours; the question is
   * only whether to leave.
   */
  for (const [at] of mine) {
    if (!threatened(pos, mind.power, at)) continue
    orders.set(at, { type: 'hold', at, power: mind.power })
    claimed.add(at)
    reasoning.push(`${at} stays where it is`)
  }

  for (const want of wants) {
    if (orders.has(want.at) || claimed.has(base(want.to))) continue
    if (want.worth <= 0) continue

    orders.set(want.at, { type: 'move', at: want.at, to: want.to, power: mind.power })
    claimed.add(base(want.to))
    reasoning.push(`${want.at} -> ${base(want.to)} (worth ${want.worth})`)

    // Somebody else of mine who could also reach it should push rather than
    // wander off. Only when it is worth more than a centre: a spare unit
    // shoving at an empty province is a unit not taking a different one.
    if (want.worth < 100) continue
    const second = mine.find(
      ([at, u]) => !orders.has(at) && at !== want.at && options(u).some((o) => base(o) === base(want.to)),
    )
    if (!second) continue
    orders.set(second[0], {
      type: 'support',
      at: second[0],
      from: want.at,
      to: want.to,
      power: mind.power,
    })
    reasoning.push(`${second[0]} supports it`)
  }

  // Anything still idle stands where it is.
  for (const [at] of mine) {
    if (!orders.has(at)) orders.set(at, { type: 'hold', at, power: mind.power })
  }

  const broke = settleUp(pos, mind, turn, orders, reasoning)
  const plan = validate(pos.board, [...orders.values()])
  return { orders: [...plan.orders.values()], broke, reasoning }
}

/**
 * Go through the promises and decide which ones to keep.
 *
 * The gain is what breaking it buys this turn, in the same units as
 * everything else. The cost is what the partner is worth, and that is **how
 * far I trust them**, not how far they trust me.
 *
 * That distinction took a test to see. Pricing it by their opinion of me
 * gives a power that has been lied to four times a *high* cost of retaliating
 * -- because it has been scrupulous itself and is still well thought of --
 * which is precisely backwards. An ally who has already betrayed you is worth
 * nothing to protect. The question is not what breaking my word costs my
 * reputation, it is what this particular partnership is still buying me.
 *
 * Multiplied by how much they matter, which is mostly how many of your
 * centres they are standing next to. A distant power's goodwill is cheap to
 * spend. The neighbour who could be in Munich next spring is not.
 */
function settleUp(
  pos: Position,
  mind: Mind,
  turn: number,
  orders: Map<string, Order>,
  reasoning: string[],
): Choice['broke'] {
  const broke: Choice['broke'] = []

  for (const agreement of mind.agreements) {
    if (agreement.turn !== turn) continue
    const them = agreement.from === mind.power ? agreement.to : agreement.from
    if (agreement.from !== mind.power && agreement.to !== mind.power) continue

    const offending = violation(pos, mind, agreement, orders)
    if (!offending) {
      // A promise of support has to be actively kept, not merely not broken.
      keepSupport(mind, agreement, orders, reasoning)
      continue
    }

    const gain = desire(pos, mind.power, offending.to)
    const cost = partnerValue(pos, mind, them, turn)

    if (gain > cost) {
      broke.push({ agreement, gain, cost })
      reasoning.push(
        `breaking with ${them}: ${base(offending.to)} is worth ${gain}, they are worth ${cost}`,
      )
      continue
    }

    orders.set(offending.at, { type: 'hold', at: offending.at, power: mind.power })
    reasoning.push(`keeping faith with ${them}: ${base(offending.to)} is not worth ${cost}`)
    keepSupport(mind, agreement, orders, reasoning)
  }

  return broke
}

/** The order in this plan that would break the deal, if there is one. */
function violation(
  pos: Position,
  mind: Mind,
  agreement: Agreement,
  orders: Map<string, Order>,
): { at: string; to: string } | null {
  const deal = agreement.deal
  const them = agreement.from === mind.power ? agreement.to : agreement.from

  for (const [at, order] of orders) {
    if (order.type !== 'move') continue

    if (deal.kind === 'dmz' && base(order.to) === base(deal.province)) return { at, to: order.to }

    if (deal.kind === 'peace') {
      const standing_ = pos.board.get(base(order.to))
      const owned = pos.own.get(base(order.to))
      if (standing_?.power === them || owned === them) return { at, to: order.to }
    }
  }

  // Failing to give a promised support is a break, but it is not a move --
  // it is priced by what the unit would rather be doing.
  if (deal.kind === 'support' && deal.helper === mind.power) {
    const helper = [...pos.board.entries()].find(
      ([at, u]) => u.power === mind.power && canStep(u, deal.to) && orders.get(at)?.type === 'move',
    )
    if (helper) return { at: helper[0], to: (orders.get(helper[0]) as { to: string }).to }
  }
  return null
}

/** Actually write the support this power promised to give. */
function keepSupport(
  mind: Mind,
  agreement: Agreement,
  orders: Map<string, Order>,
  reasoning: string[],
): void {
  const deal = agreement.deal
  if (deal.kind !== 'support' || deal.helper !== mind.power) return
  for (const [at, order] of orders) {
    if (order.type !== 'hold') continue
    orders.set(at, { type: 'support', at, from: deal.from, to: deal.to, power: mind.power })
    reasoning.push(`${at} gives ${agreement.from} the support it was promised`)
    return
  }
}

/** What this power's goodwill is worth to us, right now. */
function partnerValue(pos: Position, mind: Mind, them: Power, turn: number): number {
  const worthKeeping = trust(mind.ledger, mind.power, them, turn)
  let closeness = 0
  for (const [at, unit] of pos.board) {
    if (unit.power !== them) continue
    for (const [id, p] of Object.entries(PROVINCES)) {
      if (!p.sc || pos.own.get(id) !== mind.power) continue
      if (canStep(unit, id)) closeness++
    }
    void at
  }
  return worthKeeping * (FRIEND + closeness * NEIGHBOUR)
}

// ------------------------------------------------------------- being asked

export interface Answer {
  reply: Reply
  why: string
}

/**
 * Whether to accept an offer.
 *
 * Worth what it gets me, discounted by how far I believe the power offering
 * it. A promise from somebody who has already broken one is worth about half
 * of the same promise from a stranger, which is the whole reason a betrayal
 * costs anything at all.
 */
export function consider(pos: Position, mind: Mind, proposal: Proposal, turn: number): Answer {
  const them = proposal.from
  const believe = trust(mind.ledger, mind.power, them, turn)
  const deal = proposal.deal

  if (deal.kind === 'support') {
    if (deal.mover === mind.power) {
      const worth = desire(pos, mind.power, deal.to) * believe
      return worth > FRIEND
        ? { reply: 'accept', why: `${base(deal.to)} is worth having and ${them} may mean it` }
        : { reply: 'refuse', why: `${base(deal.to)} is not worth owing ${them} for` }
    }
    // They want my support. It costs me a unit's turn, and buys goodwill.
    const cost = desire(pos, mind.power, deal.to)
    const worth = believe * (FRIEND + NEIGHBOUR)
    return worth > cost
      ? { reply: 'accept', why: `${them} is worth more to me than ${base(deal.to)}` }
      : { reply: 'refuse', why: `I want ${base(deal.to)} myself` }
  }

  if (deal.kind === 'dmz') {
    const mine = desire(pos, mind.power, deal.province)
    const relief = threatFrom(pos, them, mind.power) * NEIGHBOUR
    return relief * believe > mine
      ? { reply: 'accept', why: `keeping ${base(deal.province)} empty suits me` }
      : { reply: 'refuse', why: `I have plans for ${base(deal.province)}` }
    }

  const relief = threatFrom(pos, them, mind.power) * NEIGHBOUR * believe
  const behind = standing(pos, them) - standing(pos, mind.power)
  return relief > 0 && behind < 3 * 100
    ? { reply: 'accept', why: `a quiet border with ${them} is worth more than the fight` }
    : { reply: 'refuse', why: `${them} is either no threat or too far ahead to be trusted` }
}

/** How many of our centres this power is standing next to. */
function threatFrom(pos: Position, them: Power, us: Power): number {
  let n = 0
  for (const [, unit] of pos.board) {
    if (unit.power !== them) continue
    for (const [id, p] of Object.entries(PROVINCES)) {
      if (p.sc && pos.own.get(id) === us && canStep(unit, id)) n++
    }
  }
  return n
}
