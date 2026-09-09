import { describe, expect, it } from 'vitest'
import { boardFrom, canStep, convoyRoute, fleetCoasts, type Order, type Unit } from './orders'

/**
 * Stepping and convoying: the two questions that come before adjudication.
 * Neither depends on who wins a fight, so both can be settled on their own.
 */

const A = (power: Unit['power'], at: string): Unit => ({ power, type: 'army', at })
const F = (power: Unit['power'], at: string): Unit => ({ power, type: 'fleet', at })

const orders = (...list: Order[]): Map<string, Order> =>
  new Map(list.map((o) => [o.at.split('/')[0]!, o]))

describe('stepping', () => {
  it('lets an army cross a land border and refuses it the sea', () => {
    expect(canStep(A('france', 'par'), 'bur')).toBe(true)
    expect(canStep(A('france', 'bre'), 'eng')).toBe(false)
  })

  it('lets a fleet round a coast but not walk inland', () => {
    expect(canStep(F('england', 'lon'), 'eng')).toBe(true)
    expect(canStep(F('france', 'bre'), 'gas')).toBe(true)
    expect(canStep(F('germany', 'kie'), 'mun')).toBe(false)
  })

  it('holds a fleet to the coast it is actually on', () => {
    // A fleet on the south coast of Spain cannot sail into the Atlantic
    // the way one on the north coast can, and vice versa for the Gulf.
    expect(canStep(F('france', 'spa/sc'), 'lyo')).toBe(true)
    expect(canStep(F('france', 'spa/nc'), 'lyo')).toBe(false)
    expect(canStep(F('france', 'spa/nc'), 'gas')).toBe(true)
    expect(canStep(F('france', 'spa/sc'), 'gas')).toBe(false)
  })

  it('says which coast an order into a split province must mean', () => {
    // From the Gulf of Lyon there is only one coast of Spain to arrive on,
    // so the order is unambiguous even when it does not say.
    expect(fleetCoasts('lyo', 'spa')).toEqual(['spa/sc'])
    expect(fleetCoasts('mao', 'spa').sort()).toEqual(['spa/nc', 'spa/sc'])
  })
})

describe('convoying', () => {
  const board = boardFrom([
    A('england', 'lon'),
    F('england', 'nth'),
    F('england', 'eng'),
    F('england', 'mao'),
  ])

  it('finds the water under an army', () => {
    const route = convoyRoute(
      board,
      orders(
        { type: 'move', at: 'lon', to: 'bel' },
        { type: 'convoy', at: 'nth', from: 'lon', to: 'bel' },
      ),
      'lon',
      'bel',
    )
    expect(route).toEqual(['nth'])
  })

  it('chains fleets, and takes the shortest chain there is', () => {
    const route = convoyRoute(
      board,
      orders(
        { type: 'move', at: 'lon', to: 'bre' },
        { type: 'convoy', at: 'nth', from: 'lon', to: 'bre' },
        { type: 'convoy', at: 'eng', from: 'lon', to: 'bre' },
        { type: 'convoy', at: 'mao', from: 'lon', to: 'bre' },
      ),
      'lon',
      'bre',
    )
    expect(route).toEqual(['eng'])
  })

  it('refuses when a fleet in the chain is not convoying', () => {
    // The North Sea alone cannot reach Brest.
    expect(
      convoyRoute(
        board,
        orders(
          { type: 'move', at: 'lon', to: 'bre' },
          { type: 'convoy', at: 'nth', from: 'lon', to: 'bre' },
        ),
        'lon',
        'bre',
      ),
    ).toBeNull()
  })

  it('refuses when the fleet convoying the wrong army is asked', () => {
    expect(
      convoyRoute(
        board,
        orders({ type: 'convoy', at: 'nth', from: 'yor', to: 'bel' }),
        'lon',
        'bel',
      ),
    ).toBeNull()
  })

  it('breaks when a fleet in the chain is taken out', () => {
    const all = orders(
      { type: 'move', at: 'lon', to: 'bre' },
      { type: 'convoy', at: 'nth', from: 'lon', to: 'bre' },
      { type: 'convoy', at: 'eng', from: 'lon', to: 'bre' },
      { type: 'convoy', at: 'mao', from: 'lon', to: 'bre' },
    )
    /*
     * Take the Channel out and there is no way round at all, which is worth
     * saying because it looks as though there ought to be one. The North Sea
     * does not touch the Mid-Atlantic on this board -- getting between them
     * means going the long way over the top, through the Norwegian Sea and
     * the North Atlantic, and there are no fleets there to do it. The
     * Channel is the whole western sea route, which is most of why England
     * and France cannot both be comfortable.
     */
    expect(convoyRoute(board, all, 'lon', 'bre', new Set(['eng']))).toBeNull()
  })

  it('will not convoy to or from an inland province', () => {
    expect(
      convoyRoute(
        board,
        orders({ type: 'convoy', at: 'nth', from: 'lon', to: 'par' }),
        'lon',
        'par',
      ),
    ).toBeNull()
  })
})
