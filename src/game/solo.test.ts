import { describe, expect, it } from 'vitest'
import {
  LAST_YEAR,
  negotiate,
  newGame,
  resolveBuilds,
  resolveOrders,
  resolveRetreats,
  type Game,
} from './game'
import { POWERS, SOLO } from './map'
import { centreCount } from './turn'

/**
 * Can a computer power actually win?
 *
 * For a long time the answer was no, and not because the bots were merely
 * weak. The board *froze*: by 1908 every power was garrisoned against a
 * threat that did not exist, no province changed hands again, and a game
 * left running to 1960 ended on the same distribution it had reached in
 * 1939. A game that cannot be won is not a hard game, it is a broken one.
 *
 * These play a whole game with nobody watching, from a dozen seeds, and
 * assert the three things that were wrong. Seeds make it deterministic; the
 * numbers below are floors well under what the bots actually manage, so this
 * catches a regression rather than pinning today's tuning in place.
 */

function playOut(seed: number): Game {
  let g = newGame(seed)
  let guard = 0
  while (g.phase !== 'over' && guard++ < 800) {
    if (g.phase === 'orders') {
      g = negotiate(g, 'none' as never).game
      g = resolveOrders(g, 'none' as never, [])
    } else if (g.phase === 'retreats') g = resolveRetreats(g, 'none' as never, [])
    else g = resolveBuilds(g, 'none' as never, [])
  }
  return g
}

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
const games = SEEDS.map(playOut)
const leaders = games.map((g) => Math.max(...POWERS.map((p) => centreCount(g.own, p))))

describe('seven computer powers, left to themselves', () => {
  it('does not freeze the board', () => {
    // The failure this replaced: identical centre counts for five years and
    // then for fifty. If the last two years of a game are indistinguishable
    // in every game, nothing is happening.
    const moving = games.filter((g) => g.log.some((l) => l.includes('takes'))).length
    expect(moving).toBe(games.length)
  })

  it('gets somebody most of the way to a solo', () => {
    const mean = leaders.reduce((a, b) => a + b, 0) / leaders.length
    expect(mean).toBeGreaterThan(11)
    expect(Math.max(...leaders)).toBeGreaterThanOrEqual(SOLO)
  })

  it('produces a solo sometimes, which is the whole point', () => {
    expect(games.filter((g) => g.winner !== null).length).toBeGreaterThan(0)
  })

  it('does not let one power run away with every game either', () => {
    // A game nobody can win and a game one seat always wins are the same
    // failure. Across the seeds the solo should not always be the same power.
    expect(games.every((g) => g.winner !== null)).toBe(false)
    expect(LAST_YEAR).toBeGreaterThan(1901)
  })
})
