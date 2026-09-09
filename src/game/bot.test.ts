import { describe, expect, it } from 'vitest'
import { chooseOrders, consider, propose, type Mind } from './bot'
import { desire, standing, type Position } from './evaluate'
import { boardFrom, type Unit } from './orders'
import type { Power } from './map'
import { emptyLedger, judge, remember, type Agreement, type Deal } from './press'
import { openingOwnership, type Ownership } from './turn'

const A = (power: Power, at: string): Unit => ({ power, type: 'army', at })
const F = (power: Power, at: string): Unit => ({ power, type: 'fleet', at })

const at = (units: Unit[], own?: [string, Power][]): Position => ({
  board: boardFrom(units),
  own: own ? (new Map(own) as Ownership) : openingOwnership(),
})

const mind = (power: Power, agreements: Agreement[] = [], ledger = emptyLedger()): Mind => ({
  power,
  ledger,
  agreements,
})

const deal = (from: Power, to: Power, d: Deal, turn = 1): Agreement => ({
  id: 'x',
  from,
  to,
  turn,
  deal: d,
})

describe('what a position is worth', () => {
  it('counts centres above everything else', () => {
    const few = at([A('germany', 'ber')], [['ber', 'germany']])
    const many = at(
      [A('germany', 'ber')],
      [['ber', 'germany'], ['mun', 'germany'], ['kie', 'germany']],
    )
    expect(standing(many, 'germany')).toBeGreaterThan(standing(few, 'germany'))
  })

  it('calls a solo the end of the argument', () => {
    const own = Object.fromEntries(
      ['ber', 'mun', 'kie', 'hol', 'bel', 'den', 'swe', 'nwy', 'par', 'bre', 'mar', 'spa',
       'por', 'lon', 'edi', 'lvp', 'ven', 'rom'].map((id) => [id, 'germany']),
    )
    const pos = at([A('germany', 'ber')], Object.entries(own) as [string, Power][])
    expect(standing(pos, 'germany')).toBe(Number.MAX_SAFE_INTEGER)
  })
})

describe('what a province is worth taking', () => {
  const pos = at([A('germany', 'mun')], [['mun', 'germany']])

  it('wants a neutral centre more than open country', () => {
    expect(desire(pos, 'germany', 'bel')).toBeGreaterThan(desire(pos, 'germany', 'bur'))
  })

  it('wants a rival\'s centre most of all', () => {
    const held = at([A('germany', 'mun')], [['mun', 'germany'], ['bel', 'france']])
    expect(desire(held, 'germany', 'bel')).toBeGreaterThan(desire(pos, 'germany', 'bel'))
  })

  it('values its own centre by how threatened it is', () => {
    const quiet = at([A('germany', 'mun')], [['mun', 'germany']])
    const menaced = at([A('germany', 'mun'), A('france', 'bur')], [['mun', 'germany']])
    expect(desire(menaced, 'germany', 'mun')).toBeGreaterThan(desire(quiet, 'germany', 'mun'))
  })
})

describe('a bot with a free hand', () => {
  it('walks into an undefended centre', () => {
    // Denmark and Holland are both open and both worth the same; which one
    // it picks is a tie-break, and pinning the test to one of them would be
    // testing the tie-break rather than the judgement.
    const pos = at([A('germany', 'kie')])
    const { orders } = chooseOrders(pos, mind('germany'), 1)
    const move = orders.find((o) => o.type === 'move')
    expect(move && 'to' in move ? move.to : null).toBeOneOf(['hol', 'den'])
  })

  it('garrisons a centre of its own that is under threat', () => {
    /*
     * Munich and Berlin are both threatened and there is one spare unit.
     * The wrong answer, and the one this bot gave until the cases caught it,
     * is to march the Munich garrison to Berlin -- defending one centre by
     * abandoning another of exactly the same value.
     */
    const pos = at(
      [A('germany', 'mun'), A('france', 'bur'), A('france', 'sil')],
      [['mun', 'germany'], ['ber', 'germany']],
    )
    const { orders } = chooseOrders(pos, mind('germany'), 1)
    expect(orders.find((o) => o.at === 'mun')?.type).toBe('hold')
  })

  it('puts a second unit behind the first when the prize is worth it', () => {
    // Two German armies that can both reach Belgium, and a Frenchman in it.
    const pos = at(
      [A('germany', 'ruh'), A('germany', 'hol'), A('france', 'bel')],
      [['bel', 'france']],
    )
    const { orders } = chooseOrders(pos, mind('germany'), 1)
    expect(orders.some((o) => o.type === 'move' && o.to === 'bel')).toBe(true)
    expect(orders.some((o) => o.type === 'support' && o.to === 'bel')).toBe(true)
  })

  it('gives every unit something to do', () => {
    const pos = at([A('germany', 'ber'), A('germany', 'mun'), F('germany', 'kie')])
    const { orders } = chooseOrders(pos, mind('germany'), 1)
    expect(orders).toHaveLength(3)
  })
})

describe('a bot with a promise to keep', () => {
  // Bound to the turn it is judged on: a deal is always about a named turn,
  // and one made for 1901 says nothing about 1905.
  const promise = deal('germany', 'france', { kind: 'dmz', province: 'bel' }, 5)

  /*
   * The same position every time: a German army in the Ruhr with Belgium
   * open in front of it, and French units close enough to German centres to
   * matter. The only thing that changes between these cases is what France
   * has done with its word up to now.
   */
  const position = () =>
    at(
      [A('germany', 'ruh'), A('germany', 'mun'), A('france', 'bur'), A('france', 'sil')],
      [['mun', 'germany'], ['ber', 'germany'], ['kie', 'germany']],
    )

  /** A ledger where France has done this, over and over. */
  const history = (kept: boolean, turns: number[]) => {
    let ledger = emptyLedger()
    const board = boardFrom([A('germany', 'ruh'), A('france', 'bur')])
    for (const turn of turns) {
      ledger = remember(
        ledger,
        judge(
          deal('germany', 'france', { kind: 'dmz', province: 'bel' }, turn),
          new Map([
            ['germany' as Power, [{ type: 'hold' as const, at: 'ruh' }]],
            [
              'france' as Power,
              kept
                ? [{ type: 'hold' as const, at: 'bur' }]
                : [{ type: 'move' as const, at: 'bur', to: 'bel' }],
            ],
          ]),
          board,
        ),
      )
    }
    return ledger
  }

  it('stays out when the friendship is worth more than the province', () => {
    const ledger = history(true, [1, 2, 3, 4])
    const { orders, broke, reasoning } = chooseOrders(
      position(),
      mind('germany', [promise], ledger),
      5,
    )
    expect(broke).toHaveLength(0)
    expect(orders.some((o) => o.type === 'move' && o.to === 'bel')).toBe(false)
    expect(reasoning.some((r) => r.includes('keeping faith'))).toBe(true)
  })

  it('walks in anyway when the friendship is already worthless', () => {
    // France has broken its word repeatedly, so there is nothing left to
    // spend: a promise costs nothing to break once the other side has
    // stopped believing you anyway.
    const ledger = history(false, [1, 2, 3, 4])
    const { broke } = chooseOrders(position(), mind('germany', [promise], ledger), 5)
    expect(broke).toHaveLength(1)
    expect(broke[0]!.gain).toBeGreaterThan(broke[0]!.cost)
  })

  it('says out loud what it thought the betrayal was worth', () => {
    const ledger = history(false, [1, 2, 3, 4])
    const { reasoning } = chooseOrders(position(), mind('germany', [promise], ledger), 5)
    expect(reasoning.join(' ')).toMatch(/breaking with france: bel is worth \d+, they are worth/)
  })
})

describe('a bot being asked', () => {
  it('takes support for a centre it wants', () => {
    const pos = at([A('germany', 'ruh'), A('france', 'bur')])
    const answer = consider(
      pos,
      mind('germany'),
      {
        id: 'p',
        from: 'france',
        to: 'germany',
        turn: 1,
        deal: { kind: 'support', mover: 'germany', helper: 'france', from: 'ruh', to: 'bel' },
      },
      1,
    )
    expect(answer.reply).toBe('accept')
  })

  it('refuses to hand over a province it wants itself', () => {
    const pos = at([A('germany', 'ruh'), A('france', 'bur')])
    const answer = consider(
      pos,
      mind('germany'),
      {
        id: 'p',
        from: 'france',
        to: 'germany',
        turn: 1,
        deal: { kind: 'support', mover: 'france', helper: 'germany', from: 'bur', to: 'bel' },
      },
      1,
    )
    expect(answer.reply).toBe('refuse')
    expect(answer.why).toContain('myself')
  })

  it('believes a proven liar less than a stranger', () => {
    const board = boardFrom([A('germany', 'ruh'), A('france', 'bur')])
    let ledger = emptyLedger()
    for (const turn of [1, 2, 3]) {
      ledger = remember(
        ledger,
        judge(
          deal('germany', 'france', { kind: 'dmz', province: 'bel' }, turn),
          new Map([
            ['germany' as Power, [{ type: 'hold' as const, at: 'ruh' }]],
            ['france' as Power, [{ type: 'move' as const, at: 'bur', to: 'bel' }]],
          ]),
          board,
        ),
      )
    }
    const pos = at([A('germany', 'ruh'), A('france', 'bur')])
    const offer = {
      id: 'p',
      from: 'france' as Power,
      to: 'germany' as Power,
      turn: 4,
      deal: { kind: 'support' as const, mover: 'germany' as Power, helper: 'france' as Power, from: 'ruh', to: 'bel' },
    }
    expect(consider(pos, mind('germany', [], ledger), offer, 4).reply).toBe('refuse')
    expect(consider(pos, mind('germany'), offer, 4).reply).toBe('accept')
  })
})

describe('a bot doing the asking', () => {
  it('asks for help taking something it cannot take alone', () => {
    // Germany wants Belgium; France is sitting in it; England has a fleet
    // that could push. Germany has nobody of its own to spare.
    const pos = at(
      [A('germany', 'ruh'), A('france', 'bel'), F('england', 'nth')],
      [['bel', 'france']],
    )
    const overtures = propose(pos, mind('germany'), 1)
    const ask = overtures.find((o) => o.proposal.deal.kind === 'support')

    expect(ask).toBeDefined()
    expect(ask!.proposal.to).toBe('england')
    expect(ask!.says).toContain('bel')
  })

  it('never asks the power it is attacking to help it', () => {
    const pos = at([A('germany', 'ruh'), A('france', 'bel')], [['bel', 'france']])
    const overtures = propose(pos, mind('germany'), 1)
    expect(
      overtures.some((o) => o.proposal.deal.kind === 'support' && o.proposal.to === 'france'),
    ).toBe(false)
  })

  it('never offers peace to somebody it is in the middle of attacking', () => {
    const pos = at([A('germany', 'ruh'), A('france', 'bel'), A('france', 'bur')], [['bel', 'france']])
    const overtures = propose(pos, mind('germany'), 1)
    expect(
      overtures.some((o) => o.proposal.deal.kind === 'peace' && o.proposal.to === 'france'),
    ).toBe(false)
  })

  it('will offer a quiet border to somebody it is attacking somewhere else', () => {
    /*
     * Germany marches on French Belgium and in the same breath suggests
     * leaving Burgundy alone. That is not a lie and it is not incoherent: a
     * promise about Burgundy is a promise about Burgundy. It is the sharpest
     * thing in this game -- an offer that will be kept to the letter by
     * somebody who is robbing you at the same moment -- and a bot that
     * refused to make it would be playing a politer game than this one.
     */
    const pos = at([A('germany', 'ruh'), A('france', 'bel')], [['bel', 'france']])
    const overtures = propose(pos, mind('germany'), 1)
    const dmz = overtures.find((o) => o.proposal.deal.kind === 'dmz')
    expect(dmz?.proposal.to).toBe('france')
    expect(dmz!.proposal.deal.kind === 'dmz' && dmz!.proposal.deal.province).not.toBe('bel')
  })

  it('asks whoever it believes most', () => {
    const pos = at(
      [A('germany', 'ruh'), A('france', 'bel'), A('england', 'hol'), A('italy', 'bur')],
      [['bel', 'france']],
    )
    // England has lied repeatedly; Italy has not.
    let ledger = emptyLedger()
    const board = boardFrom([A('germany', 'ruh'), A('england', 'hol')])
    for (const turn of [1, 2, 3]) {
      ledger = remember(
        ledger,
        judge(
          deal('germany', 'england', { kind: 'dmz', province: 'bel' }, turn),
          new Map([
            ['germany' as Power, [{ type: 'hold' as const, at: 'ruh' }]],
            ['england' as Power, [{ type: 'move' as const, at: 'hol', to: 'bel' }]],
          ]),
          board,
        ),
      )
    }
    const ask = propose(pos, mind('germany', [], ledger), 4).find(
      (o) => o.proposal.deal.kind === 'support',
    )
    expect(ask!.proposal.to).toBe('italy')
  })

  it('offers a quiet border over ground neither of them owns', () => {
    const pos = at([A('germany', 'mun'), A('austria', 'tyr')])
    const overtures = propose(pos, mind('germany'), 1)
    const dmz = overtures.find((o) => o.proposal.deal.kind === 'dmz')
    expect(dmz).toBeDefined()
    expect(dmz!.proposal.to).toBe('austria')
    expect(dmz!.says).toContain('empty')
  })

  it('does not offer to leave alone a province it is walking into', () => {
    const pos = at([A('germany', 'ruh'), A('france', 'bur')])
    const overtures = propose(pos, mind('germany'), 1)
    const plan = chooseOrders(pos, mind('germany'), 1)
    const taking = plan.orders
      .filter((o) => o.type === 'move')
      .map((o) => (o as { to: string }).to.split('/')[0]!)
    for (const o of overtures) {
      if (o.proposal.deal.kind !== 'dmz') continue
      expect(taking).not.toContain(o.proposal.deal.province)
    }
  })

  it('does not open its mouth more than three times a turn', () => {
    const pos = at([
      A('germany', 'mun'),
      A('germany', 'ber'),
      A('germany', 'kie'),
      A('france', 'bur'),
      A('austria', 'tyr'),
      A('russia', 'sil'),
      A('russia', 'pru'),
      A('england', 'hol'),
    ])
    expect(propose(pos, mind('germany'), 1).length).toBeLessThanOrEqual(3)
  })
})
