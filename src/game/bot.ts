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

export function chooseOrders(pos: Position, mind: Mind, turn: number): Choice {
  const mine = [...pos.board.entries()].filter(([, u]) => u.power === mind.power)
  const reasoning: string[] = []
  const orders = new Map<string, Order>()
  const spent = new Set<string>()

  /*
   * Garrison first. A unit already standing on something worth having claims
   * it by staying there, before anybody goes looking for somewhere better.
   *
   * Without this the bot does something that looks deranged and is a direct
   * consequence of only ever scoring *moves*: with Munich and Berlin both
   * threatened and one spare unit, it marched the Munich garrison to Berlin
   * -- defending one centre by abandoning another of the same value.
   */
  for (const [at] of mine) {
    if (!threatened(pos, mind.power, at)) continue
    orders.set(at, { type: 'hold', at, power: mind.power })
    spent.add(at)
    reasoning.push(`${at} stays where it is`)
  }

  /*
   * Then take objectives, not moves.
   *
   * This is the difference between a bot that plays and one that shuffles.
   * Picking each unit's best destination independently means a defended
   * province is attacked by one unit, bounces, and is attacked again next
   * year for ever -- which is exactly what seven of these did to each other
   * until 2149 without anybody taking a single centre off anybody.
   *
   * So work the other way round: list what is worth having, work out how many
   * units it takes, and commit that many or none at all. A province you
   * cannot take is not worth one unit, and the unit is worth more somewhere
   * it can actually arrive.
   */
  const targets = Object.keys(PROVINCES)
    .map((id) => ({ id, worth: desire(pos, mind.power, id) }))
    .filter((t) => t.worth > 0)
    .sort((a, b) => b.worth - a.worth || a.id.localeCompare(b.id))

  for (const target of targets) {
    if (pos.board.get(target.id)?.power === mind.power) continue

    const able = mine
      .filter(([at]) => !spent.has(at))
      .filter(([, u]) => canReach(u, target.id))
      .map(([at, u]) => ({ at, to: aim(u, target.id) }))
    if (able.length === 0) continue

    const needed = strengthNeeded(pos, mind.power, target.id)

    /*
     * Not enough for the job. Walking at an empty province anyway is still
     * worth doing -- the worst that happens is a bounce, and the province
     * might be free -- but throwing one unit at a garrison is a unit thrown
     * away, and that one waits for help instead.
     */
    if (able.length < needed) {
      if (pos.board.get(base(target.id))) continue
      const lone = able[0]!
      orders.set(lone.at, { type: 'move', at: lone.at, to: lone.to, power: mind.power })
      spent.add(lone.at)
      reasoning.push(`${lone.at} -> ${target.id} (worth ${target.worth}, and empty)`)
      continue
    }

    const [lead, ...rest] = able
    orders.set(lead!.at, { type: 'move', at: lead!.at, to: lead!.to, power: mind.power })
    spent.add(lead!.at)
    reasoning.push(`${lead!.at} -> ${target.id} (worth ${target.worth}, needs ${needed})`)

    for (const helper of rest.slice(0, needed - 1)) {
      orders.set(helper.at, {
        type: 'support',
        at: helper.at,
        from: lead!.at,
        to: lead!.to,
        power: mind.power,
      })
      spent.add(helper.at)
      reasoning.push(`${helper.at} supports it`)
    }
  }

  // Anything still idle stands where it is.
  for (const [at] of mine) {
    if (!orders.has(at)) orders.set(at, { type: 'hold', at, power: mind.power })
  }

  const broke = settleUp(pos, mind, turn, orders, reasoning)

  /*
   * Only this power's orders come back. The validator fills in a hold for
   * every unit on the board -- which is right for adjudication and wrong as
   * an answer to "what does Germany do this turn", since it hands back orders
   * for all twenty-two units including everybody else's.
   */
  const plan = validate(pos.board, [...orders.values()])
  const ours = [...plan.orders.entries()]
    .filter(([at]) => pos.board.get(at)?.power === mind.power)
    .map(([, order]) => order)

  return { orders: ours, broke, reasoning }
}

/**
 * How many units it takes to arrive somewhere.
 *
 * One for an empty province nobody else wants. Two if somebody is standing
 * there, since a unit must be beaten rather than matched. One more again if
 * a friend of theirs is close enough to prop them up, or if a rival could
 * reach the same empty province and bounce us out of it.
 *
 * It is an estimate and it is meant to be. Being exactly right would mean
 * knowing everybody's orders, which is the one thing this game never lets
 * anybody know.
 */
function strengthNeeded(pos: Position, power: Power, target: string): number {
  const holding = pos.board.get(base(target))
  const rivals = [...pos.board.entries()].filter(
    ([at, u]) => u.power !== power && base(at) !== base(target) && canReach(u, target),
  )

  if (!holding) return rivals.length > 0 ? 2 : 1

  /*
   * Two to beat a unit, and a third only when they have two friends close
   * enough to prop it up. Assuming one nearby friend means a third unit
   * needed was the difference between a bot that presses an advantage and one
   * that never quite attacks: a neighbour almost always has *a* unit
   * somewhere near, so almost every attack was priced at three, and three
   * spare units next to the same province is a luxury nobody has.
   */
  const friendsOfTheirs = rivals.filter(([, u]) => u.power === holding.power).length
  return friendsOfTheirs >= 2 ? 3 : 2
}

/** Can this unit reach that province, by any coast of it? */
function canReach(unit: Unit, province: string): boolean {
  if (canStep(unit, base(province))) return true
  const coasts = PROVINCES[base(province)]?.coasts
  return coasts !== undefined && coasts.some((c) => canStep(unit, `${base(province)}/${c}`))
}

/** The destination as the order must name it, coast and all. */
function aim(unit: Unit, province: string): string {
  const coasts = PROVINCES[base(province)]?.coasts
  if (unit.type === 'army' || !coasts) return base(province)
  const open = coasts
    .map((c) => `${base(province)}/${c}`)
    .filter((key) => canStep(unit, key))
  return open.length === 1 ? open[0]! : base(province)
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

// -------------------------------------------------------------- speaking up

export interface Overture {
  proposal: Proposal
  /** What the power says when it asks. Shown to whoever is being asked. */
  says: string
}

/** At most this many approaches a turn, so six powers are not a mailstorm. */
const MOUTHFUL = 3

/**
 * What this power goes and asks for, unprompted.
 *
 * A bot that only ever answers is not negotiating, it is a form to fill in.
 * These come out of the plan it has already made: it works out what it wants
 * to do this turn, notices where that is not going to work on its own, and
 * goes looking for somebody who could make it work.
 *
 * In order of how much a deal is worth having:
 *
 *   - **help taking something defended.** The commonest ask in the game and
 *     the one that decides most provinces.
 *   - **a quiet border**, where a province sits between us that neither of us
 *     can hold and both of us would rather not garrison.
 *   - **peace outright**, when a neighbour is over my centres and my own
 *     ambitions are somewhere else entirely.
 *
 * Nothing here promises the power will keep any of it. It is asking because
 * it wants something now; whether it still wants it when the orders are due
 * is settled separately, in `settleUp`, and the answer is sometimes no.
 */
export function propose(pos: Position, mind: Mind, turn: number): Overture[] {
  const out: Overture[] = []
  const plan = chooseOrders(pos, { ...mind, agreements: [] }, turn)
  const believe = (them: Power) => trust(mind.ledger, mind.power, them, turn)

  const id = (to: Power, what: string) => `${mind.power}-${to}-${turn}-${what}`

  /*
   * Ask about what you wanted and could not have.
   *
   * This used to work from the moves already planned, which had it exactly
   * backwards once the planner learned not to attack what it cannot take:
   * a province worth wanting and beyond reach alone is no longer in the plan
   * at all, so the bot stopped asking for help precisely when it needed
   * help. What is worth an approach is the target that was skipped.
   */
  for (const target of wantedAndUnaffordable(pos, mind)) {
    const holding = pos.board.get(base(target.id))
    if (!holding || holding.power === mind.power) continue
    if (plan.orders.some((o) => o.type === 'support' && base(o.to) === target.id)) continue

    const helpers = [...pos.board.entries()]
      .filter(([, u]) => u.power !== mind.power && u.power !== holding.power)
      .filter(([, u]) => canReach(u, target.id))
      .sort((a, b) => believe(b[1].power) - believe(a[1].power))

    const helper = helpers[0]
    if (!helper) continue

    out.push({
      proposal: {
        id: id(helper[1].power, `sup-${target.id}`),
        from: mind.power,
        to: helper[1].power,
        turn,
        deal: {
          kind: 'support',
          mover: mind.power,
          helper: helper[1].power,
          from: target.from,
          to: target.to,
        },
      },
      says: `Support my ${base(target.from)} into ${target.id} and it is mine this turn.`,
    })
  }

  // --- let us both stay out of it ---------------------------------------
  for (const them of neighbours(pos, mind.power)) {
    if (out.some((o) => o.proposal.to === them)) continue
    const between = borderland(pos, mind.power, them).find(
      (p) => !plan.orders.some((o) => o.type === 'move' && base(o.to) === p),
    )
    if (!between) continue

    out.push({
      proposal: {
        id: id(them, `dmz-${between}`),
        from: mind.power,
        to: them,
        turn,
        deal: { kind: 'dmz', province: between },
      },
      says: `Neither of us needs ${between}. Leave it empty and we both look elsewhere.`,
    })
  }

  // --- peace, then ------------------------------------------------------
  for (const them of neighbours(pos, mind.power)) {
    if (out.some((o) => o.proposal.to === them)) continue
    if (threatFrom(pos, them, mind.power) < 2) continue
    // Not while I am the one moving on them.
    const attacking = plan.orders.some(
      (o) => o.type === 'move' && pos.board.get(base(o.to))?.power === them,
    )
    if (attacking) continue

    out.push({
      proposal: {
        id: id(them, 'peace'),
        from: mind.power,
        to: them,
        turn,
        deal: { kind: 'peace' },
      },
      says: `You are on my border in force and I have business elsewhere. Peace this turn?`,
    })
  }

  return out.slice(0, MOUTHFUL)
}

/**
 * Provinces this power wants and has not got the units for on its own: the
 * whole reason to go and talk to somebody.
 */
function wantedAndUnaffordable(
  pos: Position,
  mind: Mind,
): { id: string; from: string; to: string; worth: number }[] {
  const mine = [...pos.board.entries()].filter(([, u]) => u.power === mind.power)
  const out: { id: string; from: string; to: string; worth: number }[] = []

  for (const id of Object.keys(PROVINCES)) {
    const worth = desire(pos, mind.power, id)
    if (worth < 100) continue
    if (pos.board.get(id)?.power === mind.power) continue

    const able = mine.filter(([, u]) => canReach(u, id))
    if (able.length === 0) continue
    if (able.length >= strengthNeeded(pos, mind.power, id)) continue

    out.push({ id, from: able[0]![0], to: aim(able[0]![1], id), worth })
  }
  return out.sort((a, b) => b.worth - a.worth)
}

/** Powers whose units are within reach of anything of ours. */
function neighbours(pos: Position, us: Power): Power[] {
  const near = new Set<Power>()
  for (const [, unit] of pos.board) {
    if (unit.power === us) continue
    for (const [at, mine] of pos.board) {
      if (mine.power !== us) continue
      if (canStep(unit, at)) near.add(unit.power)
    }
    for (const [id, p] of Object.entries(PROVINCES)) {
      if (p.sc && pos.own.get(id) === us && canStep(unit, id)) near.add(unit.power)
    }
  }
  return [...near]
}

/**
 * Provinces both of us can reach and neither of us owns: the ground a border
 * war starts over, and the ground worth agreeing to leave alone.
 */
function borderland(pos: Position, us: Power, them: Power): string[] {
  const reach = (who: Power) => {
    const out = new Set<string>()
    for (const [, unit] of pos.board) {
      if (unit.power !== who) continue
      for (const [id, p] of Object.entries(PROVINCES)) {
        if (canStep(unit, id)) out.add(id)
        else if (p.coasts?.some((c) => canStep(unit, `${id}/${c}`))) out.add(id)
      }
    }
    return out
  }
  const ours = reach(us)
  const theirs = reach(them)
  return [...ours]
    .filter((p) => theirs.has(p))
    .filter((p) => pos.own.get(p) !== us && pos.own.get(p) !== them)
    .sort()
}
