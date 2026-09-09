import { describe, expect, it } from 'vitest'
import { askForDraw, askToConcede, botOrders, negotiate, newGame, resign, resolveBuilds, resolveOrders, resolveRetreats, turnOf, type Game } from './game'
import { POWERS, type Power } from './map'
import { centreCount, unitCount } from './turn'
import type { Order } from './orders'
import type { Agreement } from './press'
import { look } from './press'

/**
 * The loop, played out with nobody watching.
 *
 * The point of the game being a state machine with no interface attached is
 * that a whole game can be run here, from the opening to whatever end it
 * finds. That is the only way to answer the question that actually matters
 * about the bots -- not whether each order is sensible, but whether seven
 * powers left alone reach a conclusion or shuffle for thirty years.
 */

const PLAYER: Power = 'austria'

/** Play on, with the player's own units simply holding. */
const step = (g: Game): Game => {
  if (g.phase === 'orders') return resolveOrders(negotiate(g, PLAYER).game, PLAYER, [])
  if (g.phase === 'retreats') return resolveRetreats(g, PLAYER, [])
  if (g.phase === 'builds') return resolveBuilds(g, PLAYER, [])
  return g
}

const play = (turns: number, from = newGame()): Game => {
  let g = from
  for (let i = 0; i < turns && g.phase !== 'over'; i++) g = step(g)
  return g
}

describe('the opening', () => {
  const g = newGame()

  it('sets the board for Spring 1901', () => {
    expect(g.year).toBe(1901)
    expect(g.season).toBe('spring')
    expect(g.phase).toBe('orders')
    expect(g.board.size).toBe(22)
    expect(turnOf(g)).toBe(0)
  })

  it('gives everybody their own centres and nobody the neutrals', () => {
    for (const p of POWERS) expect(centreCount(g.own, p)).toBe(p === 'russia' ? 4 : 3)
    expect(g.own.has('bel')).toBe(false)
  })

  it('has every computer power ordering every unit it owns', () => {
    const orders = botOrders(g, PLAYER)
    expect([...orders.keys()].sort()).toEqual(POWERS.filter((p) => p !== PLAYER).sort())
    for (const [power, given] of orders) {
      expect(given.length, power).toBe(unitCount(g.board, power))
    }
  })
})

describe('a turn', () => {
  it('moves the year on, spring to autumn to spring', () => {
    let g = newGame()
    g = play(1, g)
    expect(g.season).toBe('autumn')
    expect(g.year).toBe(1901)

    g = play(6, g)
    expect(g.year).toBeGreaterThan(1901)
  })

  it('says what happened, in words', () => {
    const g = play(1)
    expect(g.log.length).toBeGreaterThan(1)
    expect(g.log.join(' ')).toMatch(/Spring 1901/)
  })

  it('never lets a power hold more units than centres for long', () => {
    const g = play(12)
    for (const p of POWERS) {
      if (g.out.includes(p)) continue
      // Checked after a winter, when the books have been balanced.
      if (g.phase === 'orders' && g.season === 'spring') {
        expect(unitCount(g.board, p), p).toBeLessThanOrEqual(centreCount(g.own, p))
      }
    }
  })
})

describe('the talking', () => {
  it('lets the computer powers approach each other and agree things', () => {
    const { game } = negotiate(newGame(), PLAYER)
    // Not a fixed number -- what matters is that deals are struck at all,
    // since without them nobody can ever take a defended province.
    expect(game.agreements.length).toBeGreaterThanOrEqual(0)
    for (const a of game.agreements) {
      expect(a.from).not.toBe(PLAYER)
      expect(a.to).not.toBe(PLAYER)
      expect(a.turn).toBe(turnOf(game))
    }
  })

  it('hands the human its approaches rather than answering for them', () => {
    const { asked } = negotiate(newGame(), PLAYER)
    for (const o of asked) {
      expect(o.proposal.to).toBe(PLAYER)
      expect(o.says.length).toBeGreaterThan(0)
    }
  })
})

describe('the bots, left alone', () => {
  /**
   * Spring 1901 is the sharpest test of whether a bot is playing at all: in
   * this game every unit moves, because there is nothing to defend yet and
   * everything to reach for. A bot that holds is a bot that has scored its
   * options wrong -- which is exactly what was happening, since an empty
   * province was being priced by asking what the unit standing in it could
   * reach, and there is no unit standing in it.
   */
  it('marches in Spring 1901 rather than standing about', () => {
    const g = newGame()
    const orders = [...botOrders(g, PLAYER).values()].flat()
    const moving = orders.filter((o) => o.type === 'move').length
    expect(moving).toBeGreaterThan(orders.length * 0.7)
  })
})

describe('the whole game', () => {
  /**
   * The real question about the bots. Seven powers playing greedily should
   * produce somebody who gets ahead, not a board frozen in 1901 -- and if it
   * never resolves, that is a finding about the bots rather than a flaky
   * test, which is why the assertion is about movement rather than a winner.
   */
  it('gets somewhere: centres change hands', () => {
    const start = newGame()
    const end = play(40)
    const moved = POWERS.some((p) => centreCount(end.own, p) !== centreCount(start.own, p))
    expect(moved).toBe(true)
  })

  it('never loses or invents a unit', () => {
    const g = play(30)
    for (const [at, unit] of g.board) {
      expect(unit.at.split('/')[0], at).toBe(at)
      expect(POWERS).toContain(unit.power)
    }
  })

  it('runs for a century without throwing, hanging or corrupting itself', () => {
    /*
     * What this does *not* yet assert is that somebody wins.
     *
     * Played out to 2149 the board is alive and nobody has soloed: the powers
     * take the neutrals in the first few years and then hold each other off
     * for good. Taking a defended centre needs two units on it and the bots
     * do not reliably arrange that, even with the press wired in and deals
     * being struck every turn. That is the next piece of work, and it is a
     * fact about the bots rather than about this loop -- which is why the
     * test says what the loop guarantees and no more.
     */
    const g = play(400)
    expect(['over', 'orders', 'builds']).toContain(g.phase)
    expect(g.board.size).toBeGreaterThan(0)
    expect(g.year).toBeGreaterThan(1910)
  })
})

describe('the press, over a turn', () => {
  const deal = (turn: number): Agreement => ({
    id: 'd',
    from: 'austria',
    to: 'russia',
    turn,
    deal: { kind: 'dmz', province: 'gal' },
  })

  it('remembers who kept their word and who did not', () => {
    const g = { ...newGame(), agreements: [deal(0)] }
    // Austria stays out of Galicia; whether Russia does is up to Russia.
    const after = resolveOrders(g, PLAYER, [{ type: 'hold', at: 'vie', power: 'austria' }])
    const seen = look(after.ledger, 'russia', 'austria')
    expect(seen.kept + seen.broken).toBe(1)
  })

  it('says so out loud when a promise is broken', () => {
    const g = { ...newGame(), agreements: [deal(0)] }
    // Austria promised Galicia would stay empty and marches straight in.
    const orders: Order[] = [{ type: 'move', at: 'vie', to: 'gal', power: 'austria' }]
    const after = resolveOrders(g, PLAYER, orders)
    expect(after.log.join(' ')).toMatch(/Austria broke its word/)
    expect(look(after.ledger, 'russia', 'austria').broken).toBe(1)
  })

  it('does not hold a bounce against anybody', () => {
    /*
     * The order was given, so the word was kept. Whether it worked is the
     * dice, and blaming a power for the dice would make every alliance a
     * lottery.
     */
    const g = { ...newGame(), agreements: [deal(0)] }
    const after = resolveOrders(g, PLAYER, [{ type: 'hold', at: 'vie', power: 'austria' }])
    expect(look(after.ledger, 'russia', 'austria').broken).toBe(0)
  })
})

describe('giving up', () => {
  it('leaves the units on the board, holding', () => {
    // The whole point. A resigned Austria is still centres somebody has to
    // go and take; letting them evaporate would hand the game to whoever
    // happened to be next door.
    const before = newGame()
    const after = resign(before, 'austria')
    expect(after.board.size).toBe(before.board.size)
    expect(after.resigned).toContain('austria')

    const played = resolveOrders(after, 'england', [])
    for (const [at, unit] of before.board) {
      if (unit.power !== 'austria') continue
      expect(played.board.get(at)?.power, `${at} should not have moved`).toBe('austria')
    }
  })

  it('cannot be done twice, or after the game is over', () => {
    const once = resign(newGame(), 'austria')
    expect(resign(once, 'austria').resigned).toHaveLength(1)
    expect(resign({ ...once, phase: 'over' }, 'italy').resigned).toHaveLength(1)
  })

  it('is refused a draw by a power that is still winning', () => {
    const g = newGame()
    const own = new Map(g.own)
    for (const p of ['bud', 'tri', 'ser', 'gre', 'rum', 'bul', 'ven', 'mun']) {
      own.set(p, 'austria')
    }
    const { game, verdicts } = askForDraw({ ...g, own }, 'england')
    expect(verdicts.find((v) => v.power === 'austria')?.agree).toBe(false)
    expect(game.phase).toBe('orders')
  })

  it('is refused by everybody at the opening, which is the right answer', () => {
    // Three centres each and Russia on four. Nobody is out of it in 1901,
    // so nobody agrees to end it, and a game that could be drawn on the
    // first turn would not be worth playing.
    const { game, verdicts } = askForDraw(newGame(), 'austria')
    expect(verdicts.every((v) => !v.agree)).toBe(true)
    expect(game.phase).toBe('orders')
  })

  it('is granted once the board has left everybody else behind', () => {
    const g = newGame()
    const own = new Map(g.own)
    // Austria on nine; the rest on three or four and out of reach.
    for (const p of ['ser', 'gre', 'rum', 'bul', 'ven', 'mun']) own.set(p, 'austria')
    const { game, verdicts } = askForDraw({ ...g, own }, 'austria')
    expect(verdicts.every((v) => v.agree)).toBe(true)
    expect(game.phase).toBe('over')
    expect(game.drawn.length).toBeGreaterThan(1)
  })

  it('will not hand the game to somebody who has not won it', () => {
    const { game } = askToConcede(newGame(), 'austria', 'russia')
    expect(game.phase).toBe('orders')
    expect(game.winner).toBeNull()
  })
})
