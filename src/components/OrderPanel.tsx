import { PROVINCES, base } from '../game/map'
import type { Order, Unit } from '../game/orders'

/**
 * The orders as written, and the one control that matters: taking one back.
 *
 * The board shows what the orders *do*; this shows what they *say*, in the
 * same words the rules use. Both are needed. An arrow on a map is quicker to
 * read and cannot tell you that the support you meant to give Vienna is
 * actually being given to Budapest.
 */

export type Step =
  | { kind: 'idle' }
  | { kind: 'move'; at: string }
  | { kind: 'support'; at: string; from?: string }
  | { kind: 'convoy'; at: string; from?: string }

const name = (id: string) => PROVINCES[base(id)]!.name

export function say(order: Order, unit?: Unit): string {
  const who = `${unit?.type === 'fleet' ? 'F' : 'A'} ${name(order.at)}`
  switch (order.type) {
    case 'hold':
      return `${who} holds`
    case 'move':
      return `${who} → ${name(order.to)}`
    case 'support':
      return base(order.from) === base(order.to)
        ? `${who} supports ${name(order.from)}`
        : `${who} supports ${name(order.from)} → ${name(order.to)}`
    case 'convoy':
      return `${who} convoys ${name(order.from)} → ${name(order.to)}`
  }
}

export function OrderPanel({
  units,
  orders,
  step,
  illegal,
  bySea,
  onAsk,
  onClear,
  onSubmit,
}: {
  units: ReadonlyMap<string, Unit>
  orders: ReadonlyMap<string, Order>
  step: Step
  illegal: ReadonlySet<string>
  /** Whether any of the offered destinations needs a fleet to get there. */
  bySea?: boolean
  onAsk: (kind: Step['kind']) => void
  onClear: (at: string) => void
  onSubmit: () => void
}) {
  const selected = step.kind === 'idle' ? null : step.at
  const unit = selected ? units.get(selected) : undefined

  return (
    <div className="orders-panel">
      {unit && selected ? (
        <>
          <h2>
            {unit.type === 'fleet' ? 'Fleet' : 'Army'} {name(selected)}
          </h2>
          <div className="verbs">
            <button onClick={() => onAsk('move')} className={step.kind === 'move' ? 'on' : ''}>
              Move
            </button>
            <button onClick={() => onAsk('support')} className={step.kind === 'support' ? 'on' : ''}>
              Support
            </button>
            {unit.type === 'fleet' && PROVINCES[selected]!.terrain === 'sea' && (
              <button onClick={() => onAsk('convoy')} className={step.kind === 'convoy' ? 'on' : ''}>
                Convoy
              </button>
            )}
            <button onClick={() => onClear(selected)}>Hold</button>
          </div>
          <p className="hint dim">{hint(step, bySea ?? false)}</p>
        </>
      ) : (
        <p className="hint dim">Click one of your units.</p>
      )}

      <ul className="written">
        {[...orders.entries()].map(([at, order]) => (
          <li key={at} className={illegal.has(at) ? 'bad' : ''}>
            <span>{say(order, units.get(at))}</span>
            <button className="drop" onClick={() => onClear(at)} title="Take it back">
              ×
            </button>
          </li>
        ))}
        {orders.size === 0 && <li className="dim">Nothing ordered. Everybody holds.</li>}
      </ul>

      <button className="submit" onClick={onSubmit}>
        Submit orders
      </button>
    </div>
  )
}

function hint(step: Step, bySea: boolean): string {
  switch (step.kind) {
    case 'idle':
      return ''
    case 'move':
      return bySea
        ? 'Click where it should go. The coasts in blue need a fleet to carry it — order the convoy too.'
        : 'Click where it should go.'
    case 'support':
      return step.from === undefined
        ? 'Click the unit to support — or its own province, to hold it there.'
        : 'Click where that unit is going.'
    case 'convoy':
      return step.from === undefined
        ? 'Click the army to carry.'
        : 'Click where it is going.'
  }
}
