import { describe, expect, it } from 'vitest'
import type { Power } from './map'
import { boardFrom, type Unit } from './orders'
import { convoyable, convoyTargets, supportTargets, supportable } from './targets'

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
  it('offers armies on coasts, and nobody else', () => {
    const board = boardFrom([F('england', 'nth'), A('england', 'lon'), A('germany', 'mun')])
    const who = convoyable(board, board.get('nth')!)
    expect(who.has('lon')).toBe(true)
    expect(who.has('mun')).toBe(false)
  })

  it('lands them on a coast that is not the one they left', () => {
    const where = convoyTargets('lon')
    expect(where.has('nwy')).toBe(true)
    expect(where.has('lon')).toBe(false)
    expect(where.has('mun')).toBe(false)
    expect(where.has('nth')).toBe(false)
  })
})
