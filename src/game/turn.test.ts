import { describe, expect, it } from 'vitest'
import { adjudicate } from './adjudicate'
import { boardFrom, type Order, type Unit } from './orders'
import type { Power } from './map'
import {
  adjustmentFor,
  applyMoves,
  applyRetreats,
  buildOptions,
  centreCount,
  civilDisorderDisbands,
  eliminated,
  openingOwnership,
  retreatOptions,
  soloWinner,
  updateOwnership,
  type RetreatOrder,
} from './turn'

const A = (power: Power, at: string): Unit => ({ power, type: 'army', at })
const F = (power: Power, at: string): Unit => ({ power, type: 'fleet', at })
const mv = (at: string, to: string): Order => ({ type: 'move', at, to })
const sup = (at: string, from: string, to: string): Order => ({ type: 'support', at, from, to })
const hold = (at: string): Order => ({ type: 'hold', at })
const cvy = (at: string, from: string, to: string): Order => ({ type: 'convoy', at, from, to })

/** Move, then hand back the board and the outcome the retreat phase needs. */
function movement(units: Unit[], orders: Order[]) {
  const board = boardFrom(units)
  const outcome = adjudicate(board, orders)
  return { outcome, after: applyMoves(board, orders, outcome) }
}

describe('after the moving', () => {
  it('puts the winner in and takes the loser off the board', () => {
    const { outcome, after } = movement(
      [A('france', 'bur'), A('france', 'par'), A('germany', 'mun')],
      [mv('bur', 'mun'), sup('par', 'bur', 'mun'), hold('mun')],
    )
    expect(after.get('mun')?.power).toBe('france')
    expect(after.has('bur')).toBe(false)
    expect(outcome.dislodged.has('mun')).toBe(true)
  })

  it('keeps the coast a fleet was ordered to', () => {
    const { after } = movement([F('france', 'mao')], [mv('mao', 'spa/nc')])
    expect(after.get('spa')?.at).toBe('spa/nc')
  })
})

describe('where a beaten unit may go', () => {
  const setup = () =>
    movement(
      [A('france', 'bur'), A('france', 'par'), A('germany', 'mun')],
      [mv('bur', 'mun'), sup('par', 'bur', 'mun'), hold('mun')],
    )

  it('will not go back the way the attacker came', () => {
    const { outcome, after } = setup()
    expect(retreatOptions(after, outcome, 'mun')).not.toContain('bur')
  })

  it('will not go where somebody is standing', () => {
    const { outcome, after } = setup()
    // Paris is where the supporting army still is -- and out of reach anyway.
    expect(retreatOptions(after, outcome, 'mun')).not.toContain('par')
    expect(retreatOptions(after, outcome, 'mun')).toContain('tyr')
  })

  it('will not go into a province two other units bounced out of', () => {
    const { outcome, after } = movement(
      [
        A('france', 'bur'),
        A('france', 'par'),
        A('germany', 'mun'),
        A('austria', 'vie'),
        A('italy', 'ven'),
      ],
      [
        mv('bur', 'mun'),
        sup('par', 'bur', 'mun'),
        hold('mun'),
        mv('vie', 'tyr'),
        mv('ven', 'tyr'),
      ],
    )
    expect(outcome.bounced.has('tyr')).toBe(true)
    expect(retreatOptions(after, outcome, 'mun')).not.toContain('tyr')
  })

  it('may go back the way the attacker came when the attacker came by sea', () => {
    const { outcome, after } = movement(
      [A('england', 'lon'), F('england', 'nth'), F('england', 'hel'), A('germany', 'hol')],
      [mv('lon', 'hol'), cvy('nth', 'lon', 'hol'), sup('hel', 'lon', 'hol'), hold('hol')],
    )
    expect(outcome.dislodged.get('hol')?.byConvoy).toBe(true)
    // London is empty and was never marched through.
    expect(retreatOptions(after, outcome, 'hol')).toContain('kie')
  })

  it('is disbanded when there is nowhere at all', () => {
    // Boxed into a corner: Portugal, attacked from Spain, with the sea taken.
    const { outcome, after } = movement(
      [A('france', 'spa'), A('france', 'gas'), F('england', 'mao'), A('italy', 'por')],
      [mv('spa', 'por'), sup('gas', 'spa', 'por'), hold('mao'), hold('por')],
    )
    expect(outcome.dislodged.has('por')).toBe(true)
    expect(retreatOptions(after, outcome, 'por')).toEqual([])
    const { disbanded } = applyRetreats(after, outcome, [])
    expect(disbanded).toHaveLength(1)
  })
})

describe('retreating', () => {
  const setup = () =>
    movement(
      [A('france', 'bur'), A('france', 'par'), A('germany', 'mun')],
      [mv('bur', 'mun'), sup('par', 'bur', 'mun'), hold('mun')],
    )

  it('puts a unit down where it was told', () => {
    const { outcome, after } = setup()
    const r: RetreatOrder[] = [{ type: 'retreat', at: 'mun', to: 'tyr' }]
    const { board, disbanded } = applyRetreats(after, outcome, r)
    expect(board.get('tyr')?.power).toBe('germany')
    expect(disbanded).toHaveLength(0)
  })

  it('destroys both when two fall back on the same province', () => {
    const { outcome, after } = movement(
      [
        A('france', 'bur'),
        A('france', 'par'),
        A('germany', 'mun'),
        A('italy', 'ven'),
        A('italy', 'tri'),
        A('austria', 'tyr'),
      ],
      [
        mv('bur', 'mun'),
        sup('par', 'bur', 'mun'),
        hold('mun'),
        mv('ven', 'tyr'),
        sup('tri', 'ven', 'tyr'),
        hold('tyr'),
      ],
    )
    expect(outcome.dislodged.size).toBe(2)
    const { board, disbanded } = applyRetreats(after, outcome, [
      { type: 'retreat', at: 'mun', to: 'boh' },
      { type: 'retreat', at: 'tyr', to: 'boh' },
    ])
    expect(disbanded).toHaveLength(2)
    expect(board.has('boh')).toBe(false)
  })
})

describe('the winter', () => {
  it('starts everybody on their own centres and nobody on the neutrals', () => {
    const own = openingOwnership()
    expect(own.size).toBe(22)
    expect(centreCount(own, 'russia')).toBe(4)
    expect(centreCount(own, 'italy')).toBe(3)
    expect(own.has('bel')).toBe(false)
  })

  it('hands a centre over for standing on it', () => {
    const own = updateOwnership(openingOwnership(), boardFrom([A('germany', 'bel')]))
    expect(own.get('bel')).toBe('germany')
    expect(centreCount(own, 'germany')).toBe(4)
  })

  it('leaves a centre yours after you walk away from it', () => {
    const first = updateOwnership(openingOwnership(), boardFrom([A('germany', 'bel')]))
    const second = updateOwnership(first, boardFrom([A('germany', 'ruh')]))
    expect(second.get('bel')).toBe('germany')
  })

  it('counts what a power is owed', () => {
    const own = updateOwnership(openingOwnership(), boardFrom([A('germany', 'bel')]))
    const board = boardFrom([A('germany', 'bel'), A('germany', 'mun'), F('germany', 'kie')])
    // Four centres, three units.
    expect(adjustmentFor(own, board, 'germany')).toBe(1)
  })

  it('builds only at home, only in an empty centre, and only on a coast for a fleet', () => {
    const own = openingOwnership()
    const board = boardFrom([A('germany', 'ber')])
    const options = buildOptions(own, board, 'germany')
    const at = (id: string) => options.filter((o) => o.at === id).map((o) => o.type)

    expect(at('ber')).toEqual([]) // occupied
    expect(at('mun')).toEqual(['army']) // inland
    expect(at('kie').sort()).toEqual(['army', 'fleet'])
    expect(options.some((o) => o.at === 'par')).toBe(false) // not home
  })

  it('offers both coasts of St Petersburg to a fleet', () => {
    const options = buildOptions(openingOwnership(), boardFrom([]), 'russia')
    expect(options.filter((o) => o.at.startsWith('stp')).map((o) => o.at).sort()).toEqual([
      'stp',
      'stp/nc',
      'stp/sc',
    ])
  })

  it('will not build in a home centre somebody else has taken', () => {
    const own = updateOwnership(openingOwnership(), boardFrom([A('russia', 'ber')]))
    expect(buildOptions(own, boardFrom([]), 'germany').some((o) => o.at === 'ber')).toBe(false)
  })

  it('removes what is furthest from home when nobody says', () => {
    const board = boardFrom([A('germany', 'mun'), A('germany', 'ber'), A('germany', 'spa')])
    expect(civilDisorderDisbands(board, 'germany', 1)[0]!.at).toBe('spa')
  })

  it('knows an eliminated power and a solo when it sees one', () => {
    const own = openingOwnership()
    expect(eliminated(own, 'italy')).toBe(false)
    expect(soloWinner(own)).toBeNull()

    const big: typeof own = new Map(own)
    for (const [id] of [...big].slice(0, 18)) big.set(id, 'turkey')
    expect(soloWinner(big)).toBe('turkey')
  })
})
