import { describe, expect, it } from 'vitest'
import { adjudicate } from './adjudicate'
import { boardFrom, type Order, type Unit } from './orders'
import type { Power } from './map'

/**
 * The adjudicator, against the cases that actually catch people out.
 *
 * These are the classic situations the published test cases are built from:
 * ties bounce, support is cut by anything with weight behind it, a country
 * cannot throw out its own units, and a convoy is only as good as the fleets
 * under it. Each one is written out in full rather than generated, because
 * the point of a case like this is that a reader can check it by hand.
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

const run = (units: Unit[], orders: Order[]) => adjudicate(boardFrom(units), orders)

// --------------------------------------------------------------- the basics

describe('what a unit may even attempt', () => {
  it('refuses a move to a province it does not border', () => {
    const r = run([A('france', 'par')], [mv('par', 'mun')])
    expect(r.success.get('par')).toBe(false)
  })

  it('will not march an army into the sea, or sail a fleet inland', () => {
    const r = run([A('france', 'bre'), F('germany', 'kie')], [mv('bre', 'eng'), mv('kie', 'mun')])
    expect(r.success.get('bre')).toBe(false)
    expect(r.success.get('kie')).toBe(false)
  })

  it('moves a unit into an empty province', () => {
    const r = run([A('france', 'par')], [mv('par', 'bur')])
    expect(r.success.get('par')).toBe(true)
    expect(r.dislodged.size).toBe(0)
  })
})

// -------------------------------------------------------------- the balance

describe('strength', () => {
  it('bounces two equal attacks and leaves the province empty', () => {
    const r = run([A('france', 'par'), A('germany', 'mun')], [mv('par', 'bur'), mv('mun', 'bur')])
    expect(r.success.get('par')).toBe(false)
    expect(r.success.get('mun')).toBe(false)
    expect(r.bounced.has('bur')).toBe(true)
  })

  it('does not let an unsupported attack beat a supported defence', () => {
    const r = run(
      [A('france', 'bur'), A('germany', 'mun'), A('germany', 'ruh')],
      [mv('bur', 'mun'), hold('mun'), sup('ruh', 'mun', 'mun')],
    )
    expect(r.success.get('bur')).toBe(false)
    expect(r.dislodged.size).toBe(0)
  })

  it('dislodges when the attack is supported and the defence is not', () => {
    // Ruhr, not Paris. A unit may only support into a province it could have
    // gone to itself, and Paris does not border Munich.
    const r = run(
      [A('france', 'bur'), A('france', 'ruh'), A('germany', 'mun')],
      [mv('bur', 'mun'), sup('ruh', 'bur', 'mun'), hold('mun')],
    )
    expect(r.success.get('bur')).toBe(true)
    expect(r.dislodged.get('mun')?.attackedFrom).toBe('bur')
  })

  it('needs more than equal support, because a tie is a bounce', () => {
    const r = run(
      [A('france', 'bur'), A('france', 'tyr'), A('germany', 'mun'), A('germany', 'kie')],
      [mv('bur', 'mun'), sup('tyr', 'bur', 'mun'), hold('mun'), sup('kie', 'mun', 'mun')],
    )
    expect(r.success.get('bur')).toBe(false)
    expect(r.dislodged.size).toBe(0)
  })
})

// ------------------------------------------------------------- your own men

describe('your own units', () => {
  it('cannot be driven out by you, however much you push', () => {
    const r = run(
      [A('germany', 'ber'), A('germany', 'mun'), A('germany', 'sil')],
      [mv('ber', 'mun'), hold('mun'), sup('sil', 'ber', 'mun')],
    )
    expect(r.success.get('ber')).toBe(false)
    expect(r.dislodged.size).toBe(0)
  })

  it('cannot be driven out by a foreigner you are helping either', () => {
    // Germany supports France into Munich, where a German army stands.
    const r = run(
      [A('france', 'bur'), A('germany', 'ruh'), A('germany', 'mun')],
      [mv('bur', 'mun'), sup('ruh', 'bur', 'mun'), hold('mun')],
    )
    expect(r.success.get('bur')).toBe(false)
    expect(r.dislodged.size).toBe(0)
  })

  it('do not cut your own support, since they were never a threat', () => {
    /*
     * Germany supports France's attack on Munich and pushes a second German
     * army at the supporting unit. That push has no weight -- it cannot
     * dislodge a countryman -- so it cuts nothing, and the support stands.
     */
    const r = run(
      [A('france', 'bur'), A('germany', 'ruh'), A('germany', 'kie'), A('italy', 'mun')],
      [mv('bur', 'mun'), sup('ruh', 'bur', 'mun'), mv('kie', 'ruh'), hold('mun')],
    )
    expect(r.success.get('ruh')).toBe(true)
    expect(r.success.get('bur')).toBe(true)
    expect(r.dislodged.get('mun')).toBeDefined()
  })
})

// ------------------------------------------------------------------ support

describe('cutting support', () => {
  it('is cut by an attack from anywhere else', () => {
    // Picardy, not Ruhr: Ruhr does not border Paris, and an attack that
    // cannot arrive cuts nothing.
    const r = run(
      [A('france', 'bur'), A('france', 'ruh'), A('germany', 'mun'), A('germany', 'kie')],
      [mv('bur', 'mun'), sup('ruh', 'bur', 'mun'), hold('mun'), mv('kie', 'ruh')],
    )
    expect(r.success.get('ruh')).toBe(false)
    expect(r.success.get('bur')).toBe(false)
  })

  it('is not cut by an attack that could never arrive', () => {
    // Paris does not border Ruhr, so that order is no order at all.
    const r = run(
      [A('france', 'bur'), A('france', 'ruh'), A('germany', 'mun'), A('germany', 'par')],
      [mv('bur', 'mun'), sup('ruh', 'bur', 'mun'), hold('mun'), mv('par', 'ruh')],
    )
    expect(r.success.get('ruh')).toBe(true)
    expect(r.dislodged.get('mun')).toBeDefined()
  })

  it('is not cut by an attack from the province being supported into', () => {
    // Munich attacks the supporter; Munich is what the support is aimed at,
    // so the support holds and Munich is thrown out by it.
    const r = run(
      [A('france', 'bur'), A('france', 'ruh'), A('germany', 'mun')],
      [mv('bur', 'mun'), sup('ruh', 'bur', 'mun'), mv('mun', 'ruh')],
    )
    expect(r.success.get('ruh')).toBe(true)
    expect(r.success.get('bur')).toBe(true)
    expect(r.dislodged.get('mun')).toBeDefined()
  })

  it('is cut by being thrown out, however the support was going', () => {
    const r = run(
      [A('france', 'bur'), A('france', 'ruh'), A('germany', 'mun'), A('germany', 'kie'), A('germany', 'hol')],
      [mv('bur', 'mun'), sup('ruh', 'bur', 'mun'), hold('mun'), mv('kie', 'ruh'), sup('hol', 'kie', 'ruh')],
    )
    expect(r.dislodged.get('ruh')).toBeDefined()
    expect(r.success.get('bur')).toBe(false)
  })
})

// --------------------------------------------------------------- swaps, rings

describe('units changing places', () => {
  it('bounces two units trying to swap', () => {
    const r = run([A('france', 'par'), A('germany', 'bur')], [mv('par', 'bur'), mv('bur', 'par')])
    expect(r.success.get('par')).toBe(false)
    expect(r.success.get('bur')).toBe(false)
    expect(r.dislodged.size).toBe(0)
  })

  it('lets a supported unit win a swap outright', () => {
    const r = run(
      [A('france', 'par'), A('france', 'pic'), A('germany', 'bur')],
      [mv('par', 'bur'), sup('pic', 'par', 'bur'), mv('bur', 'par')],
    )
    expect(r.success.get('par')).toBe(true)
    expect(r.dislodged.get('bur')).toBeDefined()
  })

  it('turns a whole ring at once', () => {
    // Nobody dislodges anybody; they all shuffle round.
    const r = run(
      [A('austria', 'vie'), A('austria', 'bud'), A('austria', 'gal')],
      [mv('vie', 'bud'), mv('bud', 'gal'), mv('gal', 'vie')],
    )
    expect(r.success.get('vie')).toBe(true)
    expect(r.success.get('bud')).toBe(true)
    expect(r.success.get('gal')).toBe(true)
    expect(r.dislodged.size).toBe(0)
  })
})

// ----------------------------------------------------------------- convoys

describe('convoys', () => {
  it('carries an army across water', () => {
    const r = run(
      [A('england', 'lon'), F('england', 'nth')],
      [mv('lon', 'bel'), cvy('nth', 'lon', 'bel')],
    )
    expect(r.success.get('lon')).toBe(true)
  })

  it('drops the army where it started when the escort is sunk', () => {
    const r = run(
      [A('england', 'lon'), F('england', 'nth'), F('germany', 'hel'), F('germany', 'den')],
      [mv('lon', 'bel'), cvy('nth', 'lon', 'bel'), mv('hel', 'nth'), sup('den', 'hel', 'nth')],
    )
    expect(r.dislodged.get('nth')).toBeDefined()
    expect(r.success.get('lon')).toBe(false)
  })

  it('takes the long way round when one sea of two is lost', () => {
    const r = run(
      [
        A('england', 'lon'),
        F('england', 'nth'),
        F('england', 'eng'),
        F('france', 'iri'),
        F('france', 'wal'),
      ],
      [
        mv('lon', 'bel'),
        cvy('nth', 'lon', 'bel'),
        cvy('eng', 'lon', 'bel'),
        mv('iri', 'eng'),
        sup('wal', 'iri', 'eng'),
      ],
    )
    // The Channel goes, but the North Sea alone still reaches Belgium.
    expect(r.dislodged.get('eng')).toBeDefined()
    expect(r.success.get('lon')).toBe(true)
  })

  it('lets an army walk instead when the water is not the only way', () => {
    // London to Yorkshire needs no convoy, so sinking the fleet changes nothing.
    const r = run(
      [A('england', 'lon'), F('england', 'nth'), F('germany', 'hel'), F('germany', 'den')],
      [mv('lon', 'yor'), cvy('nth', 'lon', 'yor'), mv('hel', 'nth'), sup('den', 'hel', 'nth')],
    )
    expect(r.success.get('lon')).toBe(true)
  })
})
