import { describe, expect, it } from 'vitest'
import type { Power } from './map'
import { boardFrom, validate, type Order, type Unit } from './orders'
import {
  convoyDestinations,
  convoyTargets,
  convoyable,
  supportTargets,
  supportable,
  unescorted,
} from './targets'

const A = (power: Power, at: string): Unit => ({ power, type: 'army', at })
const F = (power: Power, at: string): Unit => ({ power, type: 'fleet', at })

describe('who a unit may support', () => {
  it('offers a unit it does not border, going somewhere it does', () => {
    // The case the interface used to get wrong. Vienna cannot reach Venice
    // and can reach Tyrolia, and Venice can reach Tyrolia -- so Vienna may
    // support Venice into Tyrolia, and must be able to say so.
    const board = boardFrom([A('austria', 'vie'), A('italy', 'ven')])
    expect(supportable(board, board.get('vie')!).has('ven')).toBe(true)
    expect(supportTargets(board, board.get('vie')!, 'ven').has('tyr')).toBe(true)
  })

  it('offers a neighbour, to hold it where it stands', () => {
    const board = boardFrom([A('austria', 'vie'), A('austria', 'bud')])
    expect(supportable(board, board.get('vie')!).has('bud')).toBe(true)
    expect(supportTargets(board, board.get('vie')!, 'bud').has('bud')).toBe(true)
  })

  it('will not prop up a unit it could not have reached', () => {
    // Vienna may support Venice forward. It may not support Venice at home:
    // that is a support to hold, and holds need adjacency.
    const board = boardFrom([A('austria', 'vie'), A('italy', 'ven')])
    expect(supportTargets(board, board.get('vie')!, 'ven').has('ven')).toBe(false)
  })

  it('offers nowhere the supporting unit could not go', () => {
    const board = boardFrom([A('austria', 'vie'), A('italy', 'ven')])
    const where = supportTargets(board, board.get('vie')!, 'ven')
    // Piedmont is next to Venice and nowhere near Vienna.
    expect(where.has('pie')).toBe(false)
  })

  it('never offers the unit itself', () => {
    const board = boardFrom([A('austria', 'vie'), A('austria', 'bud')])
    expect(supportable(board, board.get('vie')!).has('vie')).toBe(false)
  })

  it('keeps a fleet to the water and the coast', () => {
    const board = boardFrom([F('italy', 'nap'), A('austria', 'ven')])
    const who = supportable(board, board.get('nap')!)
    // A fleet in Naples can reach Apulia and Rome and the seas around them,
    // so an army in Venice going to Apulia is supportable. Vienna is not.
    expect(who.has('ven')).toBe(true)
    expect(supportTargets(board, board.get('nap')!, 'ven').has('apu')).toBe(true)
    expect(supportTargets(board, board.get('nap')!, 'ven').has('tyr')).toBe(false)
  })
})

describe('who a fleet may carry', () => {
  it('offers armies on the coasts it touches, and nobody else', () => {
    const board = boardFrom([F('england', 'nth'), A('england', 'lon'), A('germany', 'mun')])
    const who = convoyable(board, board.get('nth')!)
    expect(who.has('lon')).toBe(true)
    expect(who.has('mun')).toBe(false)
  })

  it('does not offer an army its own chain cannot reach', () => {
    // The North Sea has no business being asked to carry Ankara. Offering it
    // wrote an order the adjudicator threw away without saying why.
    const board = boardFrom([F('england', 'nth'), A('turkey', 'ank')])
    expect(convoyable(board, board.get('nth')!).has('ank')).toBe(false)
  })

  it('reaches further when there are fleets to reach with', () => {
    const alone = boardFrom([F('england', 'nth'), A('france', 'spa')])
    expect(convoyable(alone, alone.get('nth')!).has('spa')).toBe(false)

    const chain = boardFrom([
      F('england', 'nth'),
      F('england', 'eng'),
      F('england', 'mao'),
      A('france', 'spa'),
    ])
    expect(convoyable(chain, chain.get('nth')!).has('spa')).toBe(true)
  })

  it('lands them on a coast that is not the one they left', () => {
    const board = boardFrom([F('england', 'nth'), A('england', 'lon')])
    const where = convoyTargets(board, board.get('nth')!, 'lon')
    expect(where.has('nwy')).toBe(true)
    expect(where.has('lon')).toBe(false)
    expect(where.has('mun')).toBe(false)
    expect(where.has('nth')).toBe(false)
  })
})

describe('where an army may be carried', () => {
  it('offers a coast across one sea with a fleet in it', () => {
    const board = boardFrom([A('england', 'lon'), F('england', 'nth')])
    const where = convoyDestinations(board, board.get('lon')!)
    expect(where.has('nwy')).toBe(true)
    expect(where.has('bel')).toBe(true)
  })

  it('offers nothing when there is no fleet to carry it', () => {
    const board = boardFrom([A('england', 'lon')])
    expect(convoyDestinations(board, board.get('lon')!).size).toBe(0)
  })

  it('counts a fleet of any power, because that is what talking is for', () => {
    const board = boardFrom([A('england', 'lon'), F('germany', 'nth')])
    expect(convoyDestinations(board, board.get('lon')!).has('nwy')).toBe(true)
  })

  it('walks a chain, and stops where the chain does', () => {
    // London to Spain wants the Channel and the Mid-Atlantic. With only the
    // Channel crewed it reaches Brest and no further.
    const one = boardFrom([A('england', 'lon'), F('england', 'eng')])
    expect(convoyDestinations(one, one.get('lon')!).has('bre')).toBe(true)
    expect(convoyDestinations(one, one.get('lon')!).has('spa')).toBe(false)

    const two = boardFrom([A('england', 'lon'), F('england', 'eng'), F('england', 'mao')])
    expect(convoyDestinations(two, two.get('lon')!).has('spa')).toBe(true)
  })

  it('never offers the army its own province, or anywhere inland', () => {
    const board = boardFrom([A('england', 'lon'), F('england', 'nth')])
    const where = convoyDestinations(board, board.get('lon')!)
    expect(where.has('lon')).toBe(false)
    expect(where.has('mun')).toBe(false)
    expect(where.has('nth')).toBe(false)
  })

  it('has nothing to say about a fleet, or an army inland', () => {
    const board = boardFrom([F('england', 'lon'), A('germany', 'mun'), F('england', 'nth')])
    expect(convoyDestinations(board, board.get('lon')!).size).toBe(0)
    expect(convoyDestinations(board, board.get('mun')!).size).toBe(0)
  })
})

describe('a crossing nobody was asked to escort', () => {
  const chain = () => boardFrom([A('england', 'lon'), F('england', 'eng'), F('england', 'mao')])
  const cross: Order = { type: 'move', at: 'lon', to: 'spa', viaConvoy: true }
  const carry = (at: string): Order => ({ type: 'convoy', at, from: 'lon', to: 'spa' })

  it('is named when only half the chain has been ordered', () => {
    // The rules are content with this: legality is decided on the board
    // alone, so the move is legal and merely fails. The player cannot tell
    // that from being blocked, which is the whole reason this exists.
    const board = chain()
    expect(validate(board, [cross, carry('eng')]).illegal.size).toBe(0)
    expect(unescorted(board, [cross, carry('eng')])).toEqual(new Set(['lon']))
  })

  it('is not named once the whole chain is ordered', () => {
    const board = chain()
    expect(unescorted(board, [cross, carry('eng'), carry('mao')]).size).toBe(0)
  })

  it('says nothing about an army walking', () => {
    const board = boardFrom([A('germany', 'mun'), F('england', 'nth')])
    expect(unescorted(board, [{ type: 'move', at: 'mun', to: 'ruh' }]).size).toBe(0)
  })

  it('names a crossing with no convoy at all, which the rules only redden', () => {
    // The rules call this illegal and the panel reddens it, but red alone
    // does not say what is missing -- and the board offers crossings that
    // run through other powers' fleets, which cannot be ordered at all.
    const board = boardFrom([A('england', 'lon'), F('france', 'nth')])
    const cross: Order = { type: 'move', at: 'lon', to: 'nwy', viaConvoy: true }
    expect(validate(board, [cross]).illegal).toEqual(new Set(['lon']))
    expect(unescorted(board, [cross])).toEqual(new Set(['lon']))
  })
})
