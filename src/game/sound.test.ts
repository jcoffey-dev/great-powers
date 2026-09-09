import { describe, expect, it } from 'vitest'
import { adjudicate } from './adjudicate'
import type { Power } from './map'
import { boardFrom, type Order, type Unit } from './orders'
import { buildsSounded, endingSounded, movesSounded, retreatsSounded } from './sound'

/**
 * What a turn sounds like, which is a question with a right answer.
 *
 * The interesting cases are the quiet ones. A turn in which everybody walks
 * into empty country should make no sound at all, and getting that wrong is
 * the failure that matters -- guns on every turn are the same as no guns.
 */

const A = (power: Power, at: string): Unit => ({ power, type: 'army', at })
const F = (power: Power, at: string): Unit => ({ power, type: 'fleet', at })

const mv = (at: string, to: string, viaConvoy = false): Order => ({
  type: 'move',
  at,
  to,
  viaConvoy,
})
const sup = (at: string, from: string, to: string): Order => ({ type: 'support', at, from, to })
const hold = (at: string): Order => ({ type: 'hold', at })
const cvy = (at: string, from: string, to: string): Order => ({ type: 'convoy', at, from, to })

const sounds = (units: Unit[], orders: Order[]) => {
  const board = boardFrom(units)
  return movesSounded(board, orders, adjudicate(board, orders))
}

describe('the movement phase', () => {
  it('is silent when nobody meets anybody', () => {
    expect(sounds([A('austria', 'vie'), A('italy', 'rom')], [mv('vie', 'tyr'), mv('rom', 'ven')]))
      .toEqual([])
  })

  it('fires the guns when two armies want the same province', () => {
    expect(sounds([A('austria', 'vie'), A('italy', 'ven')], [mv('vie', 'tyr'), mv('ven', 'tyr')]))
      .toEqual(['ground'])
  })

  it('fires them when an attack fails against somebody standing there', () => {
    expect(sounds([A('germany', 'ruh'), A('france', 'bur')], [mv('ruh', 'bur'), hold('bur')]))
      .toEqual(['ground'])
  })

  it('fires them when somebody is thrown out', () => {
    const units = [A('germany', 'ruh'), A('germany', 'mun'), A('france', 'bur')]
    const orders = [mv('ruh', 'bur'), sup('mun', 'ruh', 'bur'), hold('bur')]
    expect(sounds(units, orders)).toEqual(['ground'])
  })

  it('calls it naval when the fight is at sea', () => {
    const units = [F('england', 'lon'), F('france', 'bel')]
    expect(sounds(units, [mv('lon', 'nth'), mv('bel', 'nth')])).toEqual(['naval'])
  })

  it('calls it naval when two fleets contest a coast', () => {
    const units = [F('england', 'nth'), F('germany', 'hol')]
    expect(sounds(units, [mv('nth', 'bel'), mv('hol', 'bel')])).toEqual(['naval'])
  })

  it('calls a landing ground, however it arrived', () => {
    // A fleet against an army ashore is a landing, and a landing is ground.
    const units = [F('england', 'nth'), A('france', 'bel')]
    expect(sounds(units, [mv('nth', 'bel'), hold('bel')])).toEqual(['ground'])
  })

  it('sounds the escort when a convoy carries somebody', () => {
    const units = [A('england', 'lon'), F('england', 'nth')]
    expect(sounds(units, [mv('lon', 'nwy', true), cvy('nth', 'lon', 'nwy')])).toEqual(['escort'])
  })

  it('does not sound one for a fleet that carried nobody', () => {
    const units = [A('england', 'lon'), F('england', 'nth')]
    expect(sounds(units, [hold('lon'), cvy('nth', 'lon', 'nwy')])).toEqual([])
  })

  it('reports both when a convoy lands into a fight', () => {
    const units = [A('england', 'lon'), F('england', 'nth'), F('england', 'nwg'), A('russia', 'nwy')]
    const orders = [
      mv('lon', 'nwy', true),
      cvy('nth', 'lon', 'nwy'),
      sup('nwg', 'lon', 'nwy'),
      hold('nwy'),
    ]
    expect(sounds(units, orders)).toEqual(['escort', 'ground'])
  })

  it('does not sound the escort for a landing that was thrown back', () => {
    // The ships sailed, and the army is still in London. The game's account
    // of the turn is that nothing crossed, so nothing crossed.
    const units = [A('england', 'lon'), F('england', 'nth'), A('russia', 'nwy')]
    const orders = [mv('lon', 'nwy', true), cvy('nth', 'lon', 'nwy'), hold('nwy')]
    expect(sounds(units, orders)).toEqual(['ground'])
  })

  it('says each kind once, however many battles there were', () => {
    const units = [
      A('austria', 'vie'),
      A('italy', 'ven'),
      A('germany', 'ruh'),
      A('france', 'bur'),
    ]
    const orders = [mv('vie', 'tyr'), mv('ven', 'tyr'), mv('ruh', 'bur'), hold('bur')]
    expect(sounds(units, orders)).toEqual(['ground'])
  })
})

describe('the other phases', () => {
  it('tells falling back from being finished', () => {
    expect(retreatsSounded([{ type: 'retreat', at: 'bur', to: 'par' }])).toEqual(['retreat'])
    expect(retreatsSounded([{ type: 'disband', at: 'bur' }])).toEqual(['disband'])
    expect(
      retreatsSounded([
        { type: 'retreat', at: 'bur', to: 'par' },
        { type: 'disband', at: 'mun' },
      ]),
    ).toEqual(['retreat', 'disband'])
  })

  it('tells a yard from a paying-off', () => {
    expect(buildsSounded([{ type: 'build', at: 'vie', unit: 'army' }])).toEqual(['build'])
    expect(buildsSounded([{ type: 'disband', at: 'vie' }])).toEqual(['disband'])
  })

  it('is silent over a winter where nothing was ordered', () => {
    expect(buildsSounded([])).toEqual([])
    expect(retreatsSounded([])).toEqual([])
  })
})

describe('the endings', () => {
  it('separates your solo from somebody else’s', () => {
    expect(endingSounded('austria', [], 'austria')).toBe('victory')
    expect(endingSounded('russia', [], 'austria')).toBe('defeat')
  })

  it('puts your own elimination ahead of who eventually won', () => {
    // You were out in 1904. Russia's eighteenth centre in 1911 is news you
    // read, not an ending you had.
    expect(endingSounded('russia', ['austria'], 'austria')).toBe('eliminated')
  })

  it('calls a game nobody won an armistice', () => {
    expect(endingSounded(null, [], 'austria')).toBe('armistice')
  })
})
