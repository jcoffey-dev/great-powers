import { describe, expect, it } from 'vitest'
import cases from './datc.json'
import { adjudicate } from './adjudicate'
import { boardFrom, type Order, type Unit } from './orders'

/**
 * The published test cases, run against this adjudicator.
 *
 * These are not my cases. They are the Diplomacy Adjudicator Test Cases,
 * which is what the hobby settled on as the specification for what a correct
 * adjudicator does, and they exist precisely because everybody's first
 * attempt is subtly wrong in a way that plays fine. `tools/datc.py` turns the
 * published document into the fixture beside this file; only the orders and
 * their annotated outcomes come across. See NOTICE.md.
 *
 * Sections A to G are the movement phase and are run here. H is retreating
 * and I and J are the winter, which need their own harnesses.
 */

interface Case {
  id: string
  title: string
  units: Unit[]
  orders: Order[]
  expect: Record<string, string[]>
}

/*
 * Cases whose setup is written in prose rather than in orders -- "Germany has
 * a fleet in London", "France owns F Spain(nc)" -- and which every other case
 * states by listing the unit under its owner. `tools/datc.py` builds units
 * from the order lines, so it cannot see a unit nobody ordered, or an owner
 * who is not the one giving the order. These are not failures, they are
 * unrepresentable, and pretending otherwise would leave three permanent red
 * marks that nobody would look at twice after the first week.
 */
const PROSE = new Set(['6.A.6', '6.B.10', '6.B.11'])

const movement = (cases as unknown as Case[]).filter(
  (c) => /^6\.[A-G]\./.test(c.id) && !PROSE.has(c.id),
)

/*
 * `invalid` marks an order the adjudicator should refuse to treat as an
 * order at all -- a support for a move nobody made, say. It is a statement
 * about parsing rather than about the outcome, and this engine reaches the
 * same result by never counting such a support for anything, so there is
 * nothing here to assert. `stands` and `destroyed` belong to the retreat
 * phase, which this harness does not run.
 */
const SKIP = new Set(['invalid', 'stands', 'destroyed', 'no convoy', 'bounce'])

describe('DATC', () => {
  it.each(movement.map((c) => [c.id, c.title, c] as const))('%s %s', (_id, _title, c) => {
    const outcome = adjudicate(boardFrom(c.units), c.orders)

    for (const [province, marks] of Object.entries(c.expect)) {
      for (const mark of marks) {
        if (SKIP.has(mark)) continue
        switch (mark) {
          case 'succeeds':
          case 'given':
          case 'available':
            expect(outcome.success.get(province), `${province} ${mark}`).toBe(true)
            break
          case 'fails':
          case 'cut':
          case 'illegal':
            expect(outcome.success.get(province), `${province} ${mark}`).toBe(false)
            break
          case 'disrupted': {
            /*
             * A disrupted convoy is one that did not carry its army, and
             * there are two ways to fail at that. The escort may be sunk --
             * and the army still arrive by another route, which is what a
             * multi-route convoy is for. Or the escort may survive and the
             * army still not move, which is what happens in Pandin's
             * Paradox. Either counts.
             */
            const convoy = c.orders.find(
              (o) => o.type === 'convoy' && o.at.split('/')[0] === province,
            )
            const army = convoy && 'from' in convoy ? convoy.from.split('/')[0] : province
            const carried =
              !outcome.dislodged.has(province) && outcome.success.get(army) === true
            expect(carried, `${province} disrupted`).toBe(false)
            break
          }
          case 'dislodged':
            expect(outcome.dislodged.has(province), `${province} dislodged`).toBe(true)
            break
        }
      }
    }

    // Nobody unmentioned may be thrown out: a dislodgement the cases do not
    // list is as wrong as one they list and this engine misses.
    for (const province of outcome.dislodged.keys()) {
      const marks = c.expect[province] ?? []
      expect(
        marks.includes('dislodged') || marks.includes('destroyed'),
        `${province} unexpectedly dislodged`,
      ).toBe(true)
    }
  })
})
