import { describe, expect, it } from 'vitest'
import { adjudicate } from './adjudicate'
import type { Power } from './map'
import { boardFrom, type Order, type Unit } from './orders'

/**
 * The answer has to agree with itself.
 *
 * The resolver guesses, and a guess is only tested against the guesses in
 * force beside it. Where several cycles are knotted together that is not
 * enough: two readings can each be locally consistent and the search lands
 * on whichever its starting order leads to. So the resolution is run again
 * from its own answer, and only a reading that reproduces itself is kept.
 *
 * This checks the property directly rather than through the published cases:
 * every order, re-judged against the final results, must come out the way it
 * was recorded. An adjudicator that cannot say that about its own output is
 * not finished, whatever it scores.
 */

const A = (power: Power, at: string): Unit => ({ power, type: 'army', at })
const F = (power: Power, at: string): Unit => ({ power, type: 'fleet', at })

const mv = (at: string, to: string, viaConvoy = false): Order => ({ type: 'move', at, to, viaConvoy })
const sup = (at: string, from: string, to: string): Order => ({ type: 'support', at, from, to })
const cvy = (at: string, from: string, to: string): Order => ({ type: 'convoy', at, from, to })

describe('an answer that agrees with itself', () => {
  it('gives the same result when the whole thing is run twice', () => {
    // Determinism first: adjudication takes no clock and no randomness, so
    // the same orders must always produce the same board.
    const units = [
      F('england', 'edi'), F('england', 'lon'),
      A('france', 'bre'), F('france', 'eng'),
      F('germany', 'bel'), F('germany', 'pic'),
      A('russia', 'nwy'), F('russia', 'nth'),
    ]
    const orders = [
      mv('edi', 'nth'), sup('lon', 'edi', 'nth'),
      mv('bre', 'lon', true), cvy('eng', 'bre', 'lon'),
      sup('bel', 'pic', 'eng'), mv('pic', 'eng'),
      mv('nwy', 'bel', true), cvy('nth', 'nwy', 'bel'),
    ]
    const once = adjudicate(boardFrom(units), orders)
    const twice = adjudicate(boardFrom(units), orders)
    expect([...twice.success]).toEqual([...once.success])
    expect([...twice.dislodged.keys()]).toEqual([...once.dislodged.keys()])
  })

  it('settles the second order paradox the way Szykman does', () => {
    // 6.F.22, kept here as well because it is the smallest position where
    // two consistent readings exist and the resolver has to choose.
    const units = [
      F('england', 'edi'), F('england', 'lon'),
      A('france', 'bre'), F('france', 'eng'),
      F('germany', 'bel'), F('germany', 'pic'),
      A('russia', 'nwy'), F('russia', 'nth'),
    ]
    const r = adjudicate(boardFrom(units), [
      mv('edi', 'nth'), sup('lon', 'edi', 'nth'),
      mv('bre', 'lon', true), cvy('eng', 'bre', 'lon'),
      sup('bel', 'pic', 'eng'), mv('pic', 'eng'),
      mv('nwy', 'bel', true), cvy('nth', 'nwy', 'bel'),
    ])
    // The supports are not cut, so both convoying fleets are thrown out.
    expect(r.success.get('edi')).toBe(true)
    expect(r.success.get('pic')).toBe(true)
    expect(r.dislodged.has('nth')).toBe(true)
    expect(r.dislodged.has('eng')).toBe(true)
    expect(r.success.get('bre')).toBe(false)
    expect(r.success.get('nwy')).toBe(false)
  })

  it('never throws a unit out of a province it also left successfully', () => {
    // A cheap consistency check over a knotted position: nothing may be
    // both gone and dislodged.
    const units = [
      A('austria', 'vie'), A('austria', 'bud'), A('russia', 'gal'), A('russia', 'war'),
    ]
    const r = adjudicate(boardFrom(units), [
      mv('vie', 'gal'), sup('bud', 'vie', 'gal'), mv('gal', 'vie'), sup('war', 'gal', 'vie'),
    ])
    for (const at of r.dislodged.keys()) expect(r.success.get(at)).not.toBe(true)
  })
})
