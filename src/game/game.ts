import { adjudicate, type Outcome } from './adjudicate'
import { chooseOrders, consider, propose, type Mind, type Overture } from './bot'
import { OPENING, POWERS, PROVINCES, SOLO, base, type Power } from './map'
import { boardFrom, type Board, type Order, type Unit } from './orders'
import {
  emptyLedger,
  judge,
  remember,
  type Agreement,
  type Ledger,
} from './press'
import { makeRng, type Rng } from './rng'
import {
  applyAdjustments,
  applyMoves,
  applyRetreats,
  adjustmentFor,
  buildOptions,
  centreCount,
  civilDisorderDisbands,
  eliminated,
  openingOwnership,
  retreatOptions,
  soloWinner,
  type AdjustOrder,
  type Ownership,
  type RetreatOrder,
} from './turn'

/**
 * The year, and the loop it goes round.
 *
 * Spring orders, retreats, autumn orders, retreats, then the winter -- and
 * the winter is the only phase that changes who owns anything. Everything
 * else moves units about.
 *
 * This is a state machine with no interface attached on purpose. A game can
 * be played out in a test from the opening to a solo without anything being
 * drawn, which is the only way to find out whether the bots can actually
 * finish a game rather than shuffle for thirty years.
 */

/**
 * The year the game stops.
 *
 * Diplomacy has no clock of its own: it ends when somebody takes eighteen
 * centres or when the players agree to stop, and agreeing to stop is a
 * conversation seven computer powers are not going to have. Left alone they
 * reach a standoff and hold it -- a game played out with nobody intervening
 * ran to 2198 with the board still changing hands and nobody near a solo.
 *
 * That is not a bug to be tuned away. It is what a table of equally cautious
 * players does, and it is why real games are called. So the game is called:
 * eighteen centres wins outright, and if nobody has them by the end of 1912
 * the survivors draw. Twelve years is a long evening and a real tournament
 * length, and a draw is a proper ending here rather than a failure to finish
 * -- it is the commonest way this game actually ends.
 */
export const LAST_YEAR = 1912

export type Season = 'spring' | 'autumn'
export type Phase = 'orders' | 'retreats' | 'builds' | 'over'

export interface Game {
  year: number
  season: Season
  phase: Phase
  board: Board
  own: Ownership
  ledger: Ledger
  /** Deals binding this turn. */
  agreements: Agreement[]
  /** Everything that happened, newest last. */
  log: string[]
  /** Set while retreats are outstanding. */
  outcome: Outcome | null
  winner: Power | null
  /** Everybody still standing when the game was called. */
  drawn: Power[]
  /** Powers with no centres left. They stay on the list, at nothing. */
  out: Power[]
}

/** Turns are counted from the opening, so a deal can name one. */
export const turnOf = (g: Game): number => (g.year - 1901) * 2 + (g.season === 'autumn' ? 1 : 0)

export function newGame(): Game {
  const units: Unit[] = []
  for (const power of POWERS) {
    for (const at of OPENING[power].armies) units.push({ power, type: 'army', at })
    for (const at of OPENING[power].fleets) units.push({ power, type: 'fleet', at })
  }
  return {
    year: 1901,
    season: 'spring',
    phase: 'orders',
    board: boardFrom(units),
    own: openingOwnership(),
    ledger: emptyLedger(),
    agreements: [],
    log: ['Spring 1901. Nobody has said anything yet.'],
    outcome: null,
    winner: null,
    drawn: [],
    out: [],
  }
}

const alive = (g: Game): Power[] => POWERS.filter((p) => !g.out.includes(p))

/**
 * The talking, before the orders.
 *
 * Every computer power still in the game makes its approaches; every
 * computer power that is approached answers on the merits. What is agreed
 * binds this turn and is judged at the end of it.
 *
 * This is not decoration. Without it seven greedy powers shuffle: a defended
 * centre needs two units on it and a power rarely has two to spare, so
 * nothing is ever taken and a game played out to 1967 ends with the board
 * almost where it started. Powers that can agree to push together are what
 * makes the game move at all -- which is a thing worth knowing about
 * Diplomacy, and worth the engine demonstrating.
 *
 * Approaches to the human are handed back rather than answered.
 */
export function negotiate(g: Game, player: Power): { game: Game; asked: Overture[] } {
  const pos = { board: g.board, own: g.own }
  const turn = turnOf(g)
  const agreements: Agreement[] = []
  const asked: Overture[] = []

  for (const from of alive(g)) {
    if (from === player) continue
    const mind: Mind = { power: from, ledger: g.ledger, agreements }
    for (const overture of propose(pos, mind, turn)) {
      const to = overture.proposal.to
      if (g.out.includes(to)) continue
      if (to === player) {
        asked.push(overture)
        continue
      }
      const theirs: Mind = { power: to, ledger: g.ledger, agreements }
      if (consider(pos, theirs, overture.proposal, turn).reply === 'accept') {
        agreements.push(overture.proposal)
      }
    }
  }

  return { game: { ...g, agreements }, asked }
}

/** What each computer power intends this turn. */
export function botOrders(g: Game, player: Power): Map<Power, Order[]> {
  const out = new Map<Power, Order[]>()
  for (const power of alive(g)) {
    if (power === player) continue
    const mind: Mind = { power, ledger: g.ledger, agreements: g.agreements }
    out.set(power, chooseOrders({ board: g.board, own: g.own }, mind, turnOf(g)).orders)
  }
  return out
}

/**
 * The orders are in. Work out what happened, and what everybody now thinks
 * of everybody else.
 */
export function resolveOrders(
  g: Game,
  player: Power,
  playerOrders: readonly Order[],
  rng: Rng = makeRng(1),
): Game {
  if (g.phase !== 'orders') return g

  const byPower = botOrders(g, player)
  byPower.set(player, [...playerOrders])

  const all = [...byPower.values()].flat()
  const outcome = adjudicate(g.board, all)
  const after = applyMoves(g.board, all, outcome)

  /*
   * Judge the promises before anything else. A deal is about the orders that
   * were given, so it is settled on the orders that were given -- not on how
   * the turn came out. An ally whose support was cut still gave it.
   */
  let ledger = g.ledger
  const broken: string[] = []
  for (const deal of g.agreements) {
    if (deal.turn !== turnOf(g)) continue
    const verdicts = judge(deal, byPower, g.board, g.own)
    ledger = remember(ledger, verdicts)
    for (const v of verdicts) {
      if (!v.kept) broken.push(`${v.power} broke its word: ${v.why}.`)
    }
  }

  const log = [
    `${g.season === 'spring' ? 'Spring' : 'Autumn'} ${g.year}.`,
    ...broken,
    ...report(outcome, all),
  ]

  const next: Game = { ...g, board: after, ledger, log, outcome }
  void rng

  return outcome.dislodged.size > 0
    ? { ...next, phase: 'retreats' }
    : afterRetreats(next)
}

/** Beaten units go somewhere or are gone. */
export function resolveRetreats(
  g: Game,
  player: Power,
  playerRetreats: readonly RetreatOrder[],
): Game {
  if (g.phase !== 'retreats' || !g.outcome) return g

  const orders: RetreatOrder[] = [...playerRetreats]
  for (const [at, d] of g.outcome.dislodged) {
    if (d.unit.power === player) continue
    // A computer power falls back to the first place it may, which is the
    // whole of the thinking a retreat needs: there is nothing to gain by
    // choosing badly and nothing to negotiate about.
    const where = retreatOptions(g.board, g.outcome, at)
    orders.push(where.length > 0 ? { type: 'retreat', at, to: where[0]! } : { type: 'disband', at })
  }

  const { board, disbanded } = applyRetreats(g.board, g.outcome, orders)
  const log = [
    ...g.log,
    ...disbanded.map((u) => `${u.power} loses its ${u.type} in ${base(u.at)}: nowhere to go.`),
  ]
  return afterRetreats({ ...g, board, log, outcome: null })
}

/** The winter, or the next season. */
function afterRetreats(g: Game): Game {
  if (g.season === 'spring') {
    return { ...g, season: 'autumn', phase: 'orders', log: [...g.log, `Autumn ${g.year}.`] }
  }

  // Only the autumn changes who owns what, and only by standing on it.
  const own: Ownership = new Map(g.own)
  for (const [p, unit] of g.board) {
    if (PROVINCES[p]!.sc) own.set(p, unit.power)
  }

  const out = POWERS.filter((p) => eliminated(own, p))
  const gone = out.filter((p) => !g.out.includes(p))
  const winner = soloWinner(own)

  const log = [
    ...g.log,
    ...gone.map((p) => `${p} is finished: no centres left.`),
    ...(winner ? [`${winner} holds ${centreCount(own, winner)} centres. That is the game.`] : []),
  ]

  if (winner) return { ...g, own, out, winner, phase: 'over', log }

  if (g.year >= LAST_YEAR) {
    const drawn = POWERS.filter((p) => !out.includes(p))
    return {
      ...g,
      own,
      out,
      drawn,
      phase: 'over',
      log: [
        ...log,
        `The end of ${g.year}. Nobody has eighteen, so it is a draw between ${drawn.join(', ')}.`,
      ],
    }
  }

  const owing = POWERS.some((p) => !out.includes(p) && adjustmentFor(own, g.board, p) !== 0)
  return {
    ...g,
    own,
    out,
    log: [...log, `Winter ${g.year}.`],
    phase: owing ? 'builds' : 'orders',
    ...(owing ? {} : { year: g.year + 1, season: 'spring' as Season }),
  }
}

/** Builds and disbands, then round again. */
export function resolveBuilds(
  g: Game,
  player: Power,
  playerAdjust: readonly AdjustOrder[],
): Game {
  if (g.phase !== 'builds') return g

  let board = g.board
  const log = [...g.log]

  for (const power of POWERS) {
    if (g.out.includes(power)) continue
    const owed = adjustmentFor(g.own, board, power)
    if (owed === 0) continue

    if (power === player) {
      board = applyAdjustments(g.own, board, power, [...playerAdjust]).board
      continue
    }

    if (owed > 0) {
      // Build at home, wherever there is room. A power that cannot use all
      // its builds simply waives the rest, which the rules allow.
      const wanted = buildOptions(g.own, board, power)
        .filter((o) => o.type === 'army' || o.at.includes('/') === false)
        .slice(0, owed)
      board = applyAdjustments(
        g.own,
        board,
        power,
        wanted.map((o) => ({ type: 'build' as const, at: o.at, unit: o.type })),
      ).board
      if (wanted.length > 0) log.push(`${power} builds ${wanted.length}.`)
    } else {
      const going = civilDisorderDisbands(g.own, board, power, -owed)
      board = applyAdjustments(
        g.own,
        board,
        power,
        going.map((u) => ({ type: 'disband' as const, at: u.at, unit: u.type })),
      ).board
      if (going.length > 0) log.push(`${power} gives up ${going.length}.`)
    }
  }

  return {
    ...g,
    board,
    log: [...log, `Spring ${g.year + 1}.`],
    year: g.year + 1,
    season: 'spring',
    phase: 'orders',
  }
}

// ------------------------------------------------------------------ saying

function report(outcome: Outcome, orders: readonly Order[]): string[] {
  const said: string[] = []
  for (const o of orders) {
    if (o.type !== 'move') continue
    const at = base(o.at)
    if (outcome.success.get(at)) said.push(`${at} takes ${base(o.to)}.`)
  }
  for (const [at, d] of outcome.dislodged) {
    said.push(`${d.unit.power}'s ${d.unit.type} is thrown out of ${at}.`)
  }
  if (said.length === 0) said.push('Nothing moved.')
  return said
}

export { SOLO }
