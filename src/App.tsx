import { useCallback, useMemo, useState } from 'react'
import { Board, COLOURS, POWER_NAMES } from './components/Board'
import { OrderPanel, type Step } from './components/OrderPanel'
import { reachableFrom } from './game/layout'
import { OPENING, POWERS, PROVINCES, base, type Power } from './game/map'
import { boardFrom, canStep, validate, type Order, type Unit } from './game/orders'
import { centreCount, openingOwnership } from './game/turn'
import './App.css'

/**
 * Spring 1901, with orders.
 *
 * The whole interaction is clicks on the board, because that is where the
 * question is. A unit is selected, a verb is chosen, and the provinces the
 * next click will accept light up -- so a player never types a move that the
 * rules were never going to allow, and never has to learn a notation to find
 * that out.
 *
 * Everything is offered from the rules rather than from the map. A fleet on
 * the north coast of Spain is drawn identically to one on the south coast and
 * they can go to entirely different places, which no shape can express.
 */
export default function App() {
  const [power, setPower] = useState<Power>('austria')
  const [step, setStep] = useState<Step>({ kind: 'idle' })
  const [orders, setOrders] = useState<Map<string, Order>>(new Map())

  const units = useMemo(() => {
    const all: Unit[] = []
    for (const p of POWERS) {
      for (const at of OPENING[p].armies) all.push({ power: p, type: 'army', at })
      for (const at of OPENING[p].fleets) all.push({ power: p, type: 'fleet', at })
    }
    return boardFrom(all)
  }, [])

  const own = useMemo(openingOwnership, [])

  /** Which provinces the next click will do something with. */
  const offering = useMemo(() => {
    if (step.kind === 'idle') return new Set<string>()
    const unit = units.get(step.at)
    if (!unit) return new Set<string>()

    if (step.kind === 'move') return new Set(reachableFrom(unit).map(base))

    if (step.kind === 'support') {
      if (step.from === undefined) {
        // Anybody I could reach: I can prop them up where they stand, or
        // help them into somewhere I could have gone myself.
        return new Set(
          [...units.keys()].filter((p) => p !== step.at && canReach(unit, p)),
        )
      }
      const helped = units.get(step.from)
      if (!helped) return new Set<string>()
      // Only where both of us could go: you cannot support a move you could
      // not have made yourself.
      return new Set(
        reachableFrom(helped)
          .map(base)
          .filter((p) => canReach(unit, p) || p === step.from),
      )
    }

    if (step.from === undefined) {
      return new Set(
        [...units.entries()]
          .filter(([, u]) => u.type === 'army' && PROVINCES[base(u.at)]!.terrain === 'coast')
          .map(([p]) => p),
      )
    }
    return new Set(
      Object.keys(PROVINCES).filter((p) => PROVINCES[p]!.terrain === 'coast' && p !== step.from),
    )
  }, [step, units])

  const write = useCallback((order: Order) => {
    setOrders((prev) => new Map(prev).set(base(order.at), order))
    setStep({ kind: 'idle' })
  }, [])

  const click = (province: string) => {
    const here = units.get(province)

    // Starting again: clicking one of my own units always selects it.
    if (step.kind === 'idle' || !offering.has(province)) {
      if (here?.power === power) setStep({ kind: 'move', at: province })
      else setStep({ kind: 'idle' })
      return
    }

    if (step.kind === 'move') {
      write({ type: 'move', at: step.at, to: coastOf(units.get(step.at)!, province), power })
      return
    }

    if (step.kind === 'support') {
      if (step.from === undefined) {
        setStep({ ...step, from: province })
        return
      }
      write({ type: 'support', at: step.at, from: step.from, to: province, power })
      return
    }

    if (step.from === undefined) {
      setStep({ ...step, from: province })
      return
    }
    write({ type: 'convoy', at: step.at, from: step.from, to: province, power })
  }

  const clear = (at: string) => {
    setOrders((prev) => {
      const next = new Map(prev)
      next.delete(at)
      return next
    })
    setStep({ kind: 'idle' })
  }

  // What the rules make of the orders so far, live. A player should find out
  // that a support is impossible while writing it, not after the turn.
  const illegal = useMemo(
    () => validate(units, [...orders.values()]).illegal,
    [units, orders],
  )

  const mine = [...units.entries()].filter(([, u]) => u.power === power)

  return (
    <div className="app">
      <header>
        <h1>Great Powers</h1>
        <p className="dim">
          Spring 1901 &mdash; playing{' '}
          <select value={power} onChange={(e) => {
            setPower(e.target.value as Power)
            setOrders(new Map())
            setStep({ kind: 'idle' })
          }}>
            {POWERS.map((p) => (
              <option key={p} value={p}>{POWER_NAMES[p]}</option>
            ))}
          </select>
          . {mine.length - orders.size} of {mine.length} units still without orders.
        </p>
      </header>

      <div className="map-wrap">
        <Board
          units={units}
          own={own}
          orders={orders}
          selected={step.kind === 'idle' ? null : step.at}
          offering={offering}
          onPick={click}
        />
      </div>

      <aside className="side">
        <ul className="powers">
          {POWERS.map((p) => (
            <li key={p} className={p === power ? 'me' : ''}>
              <span className="swatch" style={{ background: COLOURS[p] }} />
              {POWER_NAMES[p]}
              <span className="count">{centreCount(own, p)}</span>
            </li>
          ))}
        </ul>

        <OrderPanel
          units={units}
          orders={orders}
          step={step}
          illegal={illegal}
          onAsk={(kind) =>
            setStep(step.kind === 'idle' ? step : ({ kind, at: step.at } as Step))
          }
          onClear={clear}
          onSubmit={() => undefined}
        />
      </aside>
    </div>
  )
}

/** Can this unit reach that province, by any coast of it? */
function canReach(unit: Unit, province: string): boolean {
  if (canStep(unit, province)) return true
  const coasts = PROVINCES[province]?.coasts
  return coasts !== undefined && coasts.some((c) => canStep(unit, `${province}/${c}`))
}

/**
 * Which coast a fleet means. Where only one is reachable the order is
 * unambiguous even though it did not say, which is the rule the adjudicator
 * applies too -- so the interface should not make a fuss about it either.
 */
function coastOf(unit: Unit, province: string): string {
  const coasts = PROVINCES[province]?.coasts
  if (unit.type === 'army' || !coasts) return province
  const open = coasts.map((c) => `${province}/${c}`).filter((k) => canStep(unit, k))
  return open.length === 1 ? open[0]! : province
}
