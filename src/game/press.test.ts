import { describe, expect, it } from 'vitest'
import { boardFrom, type Order, type Unit } from './orders'
import type { Power } from './map'
import {
  conflicts,
  emptyLedger,
  judge,
  look,
  remember,
  trust,
  type Agreement,
  type Deal,
} from './press'

const A = (power: Power, at: string): Unit => ({ power, type: 'army', at })
const mv = (at: string, to: string): Order => ({ type: 'move', at, to })
const sup = (at: string, from: string, to: string): Order => ({ type: 'support', at, from, to })
const hold = (at: string): Order => ({ type: 'hold', at })

const deal = (from: Power, to: Power, d: Deal, turn = 1): Agreement => ({
  id: `${from}-${to}-${turn}`,
  from,
  to,
  turn,
  deal: d,
})

const board = boardFrom([A('austria', 'vie'), A('russia', 'war'), A('italy', 'ven')])

const orders = (o: Partial<Record<Power, Order[]>>): Map<Power, Order[]> =>
  new Map(Object.entries(o) as [Power, Order[]][])

describe('a promise of support', () => {
  const d = deal('austria', 'russia', {
    kind: 'support',
    mover: 'austria',
    helper: 'russia',
    from: 'vie',
    to: 'gal',
  })

  it('is kept by both when both do as they said', () => {
    const v = judge(d, orders({ austria: [mv('vie', 'gal')], russia: [sup('war', 'vie', 'gal')] }), board)
    expect(v.every((x) => x.kept)).toBe(true)
  })

  it('names the one who did not, and only that one', () => {
    const v = judge(d, orders({ austria: [mv('vie', 'gal')], russia: [hold('war')] }), board)
    const broke = v.filter((x) => !x.kept)
    expect(broke).toHaveLength(1)
    expect(broke[0]!.power).toBe('russia')
    expect(broke[0]!.why).toContain('did not order the support')
  })

  it('binds the asker too, who has to actually make the move', () => {
    const v = judge(d, orders({ austria: [hold('vie')], russia: [sup('war', 'vie', 'gal')] }), board)
    expect(v.find((x) => x.power === 'austria')!.kept).toBe(false)
    expect(v.find((x) => x.power === 'russia')!.kept).toBe(true)
  })

  it('is judged on the order given, not on how it turned out', () => {
    /*
     * The support was ordered and would have been cut, or the move bounced.
     * Neither is a lie. Blaming a power for a bounce would make every
     * alliance a lottery and every honest ally look like a liar.
     */
    const v = judge(d, orders({ austria: [mv('vie', 'gal')], russia: [sup('war', 'vie', 'gal')] }), board)
    expect(v.every((x) => x.kept)).toBe(true)
  })
})

describe('a demilitarised province', () => {
  const d = deal('austria', 'russia', { kind: 'dmz', province: 'gal' })

  it('holds when both stay out', () => {
    const v = judge(d, orders({ austria: [hold('vie')], russia: [hold('war')] }), board)
    expect(v.every((x) => x.kept)).toBe(true)
  })

  it('is broken by walking in', () => {
    const v = judge(d, orders({ austria: [hold('vie')], russia: [mv('war', 'gal')] }), board)
    expect(v.find((x) => x.power === 'russia')!.kept).toBe(false)
    expect(v.find((x) => x.power === 'austria')!.kept).toBe(true)
  })
})

describe('peace', () => {
  const d = deal('austria', 'italy', { kind: 'peace' })
  const neighbours = boardFrom([A('austria', 'tri'), A('italy', 'ven')])

  it('holds while neither touches the other', () => {
    const v = judge(d, orders({ austria: [mv('tri', 'alb')], italy: [mv('ven', 'pie')] }), neighbours)
    expect(v.every((x) => x.kept)).toBe(true)
  })

  it('is broken by moving on a unit of theirs', () => {
    const v = judge(d, orders({ austria: [hold('tri')], italy: [mv('ven', 'tri')] }), neighbours)
    expect(v.find((x) => x.power === 'italy')!.kept).toBe(false)
    expect(v.find((x) => x.power === 'italy')!.why).toContain('tri')
    expect(v.find((x) => x.power === 'austria')!.kept).toBe(true)
  })

  it('is broken by helping yourself to an empty centre of theirs', () => {
    /*
     * The centre is undefended and nobody is home. That is not a loophole in
     * peace, it is the most obvious way to break it, so ownership counts as
     * well as occupation.
     */
    const own = new Map([['tri', 'austria']]) as Map<string, Power>
    const empty = boardFrom([A('italy', 'ven')])
    const v = judge(d, orders({ italy: [mv('ven', 'tri')] }), empty, own)
    expect(v.find((x) => x.power === 'italy')!.kept).toBe(false)
  })
})

describe('a double deal', () => {
  it('is two promises that cannot both be kept', () => {
    const keepOut = deal('austria', 'russia', { kind: 'dmz', province: 'gal' })
    const helpIn = deal('austria', 'turkey', {
      kind: 'support',
      mover: 'turkey',
      helper: 'austria',
      from: 'rum',
      to: 'gal',
    })
    expect(conflicts(keepOut, helpIn)).toBe(true)
  })

  it('is not two promises that merely look alike', () => {
    const a = deal('austria', 'russia', { kind: 'dmz', province: 'gal' })
    const b = deal('austria', 'turkey', { kind: 'dmz', province: 'ser' })
    expect(conflicts(a, b)).toBe(false)
  })

  it('is one unit promised to two different moves', () => {
    const a = deal('austria', 'russia', {
      kind: 'support',
      mover: 'russia',
      helper: 'austria',
      from: 'war',
      to: 'gal',
    })
    const b = deal('austria', 'turkey', {
      kind: 'support',
      mover: 'turkey',
      helper: 'austria',
      from: 'rum',
      to: 'ser',
    })
    expect(conflicts(a, b)).toBe(true)
  })

  it('lets a power promise different turns freely', () => {
    const a = deal('austria', 'russia', { kind: 'dmz', province: 'gal' }, 1)
    const b = deal('austria', 'turkey', {
      kind: 'support',
      mover: 'turkey',
      helper: 'austria',
      from: 'rum',
      to: 'gal',
    }, 2)
    expect(conflicts(a, b)).toBe(false)
  })
})

describe('memory', () => {
  const d = deal('austria', 'russia', { kind: 'dmz', province: 'gal' }, 3)

  it('records a broken promise against the one who broke it', () => {
    const v = judge(d, orders({ austria: [hold('vie')], russia: [mv('war', 'gal')] }), board)
    const ledger = remember(emptyLedger(), v)
    expect(look(ledger, 'austria', 'russia').broken).toBe(1)
    expect(look(ledger, 'austria', 'russia').betrayals).toEqual([3])
    // Austria kept it, and Russia noticed that too.
    expect(look(ledger, 'russia', 'austria').kept).toBe(1)
  })

  it('does not tell anybody who was not there', () => {
    const v = judge(d, orders({ austria: [hold('vie')], russia: [mv('war', 'gal')] }), board)
    const ledger = remember(emptyLedger(), v)
    expect(look(ledger, 'italy', 'russia')).toEqual({ kept: 0, broken: 0, betrayals: [] })
  })
})

describe('trust', () => {
  const stab = (turn: number) =>
    judge(
      deal('austria', 'russia', { kind: 'dmz', province: 'gal' }, turn),
      orders({ austria: [hold('vie')], russia: [mv('war', 'gal')] }),
      board,
    )
  const honour = (turn: number) =>
    judge(
      deal('austria', 'russia', { kind: 'dmz', province: 'gal' }, turn),
      orders({ austria: [hold('vie')], russia: [hold('war')] }),
      board,
    )

  it('gives a stranger the benefit of the doubt', () => {
    expect(trust(emptyLedger(), 'austria', 'russia', 1)).toBeGreaterThan(0.5)
  })

  it('thinks better of somebody who keeps their word', () => {
    let l = emptyLedger()
    for (const t of [1, 2, 3]) l = remember(l, honour(t))
    expect(trust(l, 'austria', 'russia', 4)).toBeGreaterThan(0.9)
  })

  it('drops hard on a betrayal', () => {
    const l = remember(emptyLedger(), stab(1))
    expect(trust(l, 'austria', 'russia', 1)).toBeLessThan(0.3)
  })

  it('lets an old betrayal fade without forgetting it', () => {
    const l = remember(emptyLedger(), stab(1))
    const fresh = trust(l, 'austria', 'russia', 2)
    const stale = trust(l, 'austria', 'russia', 30)
    expect(stale).toBeGreaterThan(fresh)
    // Never fully: the count stays in the ledger for anybody who asks.
    expect(look(l, 'austria', 'russia').broken).toBe(1)
  })

  it('weighs a stab against the promises kept before it', () => {
    let loyal = emptyLedger()
    for (const t of [1, 2, 3, 4, 5, 6]) loyal = remember(loyal, honour(t))
    const afterLong = remember(loyal, stab(7))
    const afterNothing = remember(emptyLedger(), stab(7))
    expect(trust(afterLong, 'austria', 'russia', 7)).toBeGreaterThan(
      trust(afterNothing, 'austria', 'russia', 7),
    )
  })
})
