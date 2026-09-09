import { PROVINCES, base, type Power } from '../game/map'
import type { Unit } from '../game/orders'
import type { Outcome } from '../game/adjudicate'
import type { Board } from '../game/orders'
import {
  adjustmentFor,
  buildOptions,
  retreatOptions,
  type AdjustOrder,
  type Ownership,
  type RetreatOrder,
} from '../game/turn'

/**
 * The two phases that are not orders, and are decisions all the same.
 *
 * A beaten unit that finds somewhere to stand is a nuisance for years; one
 * that does not is gone. And the winter is where a good spring turns into a
 * bigger army, or does not. Taking either of these away from the player --
 * which is what happened while this was being built -- quietly removes half
 * the consequence of the turn they just played.
 *
 * Both are offered as places rather than as a notation, for the same reason
 * the orders are: the rules already know what is allowed, so the interface
 * should only ever offer what is.
 */

const name = (id: string) => PROVINCES[base(id)]!.name

export function RetreatPanel({
  power,
  board,
  outcome,
  chosen,
  onChoose,
  onDone,
}: {
  power: Power
  board: Board
  outcome: Outcome
  chosen: ReadonlyMap<string, RetreatOrder>
  onChoose: (order: RetreatOrder) => void
  onDone: () => void
}) {
  const beaten = [...outcome.dislodged.entries()].filter(([, d]) => d.unit.power === power)

  return (
    <div className="adjust">
      <h2>Retreats</h2>
      {beaten.length === 0 ? (
        <p className="small dim">Nothing of yours was thrown out.</p>
      ) : (
        beaten.map(([at, d]) => {
          const where = retreatOptions(board, outcome, at)
          const picked = chosen.get(at)
          return (
            <div className="beaten" key={at}>
              <p className="who">
                {d.unit.type === 'fleet' ? 'Fleet' : 'Army'} {name(at)}
                {where.length === 0 && ' — nowhere to go'}
              </p>
              <div className="choices">
                {where.map((to) => (
                  <button
                    key={to}
                    className={picked?.type === 'retreat' && picked.to === to ? 'on' : ''}
                    onClick={() => onChoose({ type: 'retreat', at, to })}
                  >
                    {name(to)}
                    {to.includes('/') ? ` (${to.split('/')[1]})` : ''}
                  </button>
                ))}
                <button
                  className={`no ${picked?.type === 'disband' ? 'on' : ''}`}
                  onClick={() => onChoose({ type: 'disband', at })}
                >
                  Disband
                </button>
              </div>
            </div>
          )
        })
      )}
      <button className="submit" onClick={onDone}>
        Done
      </button>
    </div>
  )
}

export function BuildPanel({
  power,
  board,
  own,
  chosen,
  onChoose,
  onDrop,
  onDone,
}: {
  power: Power
  board: Board
  own: Ownership
  chosen: readonly AdjustOrder[]
  onChoose: (order: AdjustOrder) => void
  onDrop: (at: string) => void
  onDone: () => void
}) {
  const owed = adjustmentFor(own, board, power)
  const left = Math.abs(owed) - chosen.length
  const mine = [...board.entries()].filter(([, u]) => u.power === power)

  return (
    <div className="adjust">
      <h2>{owed >= 0 ? 'Builds' : 'Disbands'}</h2>
      <p className="small dim">
        {owed === 0
          ? 'Your centres and your units are level.'
          : owed > 0
            ? `You may build ${owed}. ${left} left.`
            : `You must give up ${-owed}. ${left} left.`}
      </p>

      {owed > 0 && (
        <div className="choices">
          {buildOptions(own, board, power)
            .filter((o) => !chosen.some((c) => base(c.at) === base(o.at)))
            .map((o) => (
              <button
                key={`${o.at}-${o.type}`}
                disabled={left <= 0}
                onClick={() => onChoose({ type: 'build', at: o.at, unit: o.type })}
              >
                {o.type === 'fleet' ? 'Fleet' : 'Army'} {name(o.at)}
                {o.at.includes('/') ? ` (${o.at.split('/')[1]})` : ''}
              </button>
            ))}
        </div>
      )}

      {owed < 0 && (
        <div className="choices">
          {mine
            .filter(([at]) => !chosen.some((c) => base(c.at) === at))
            .map(([at, u]) => (
              <button
                key={at}
                className="no"
                disabled={left <= 0}
                onClick={() => onChoose({ type: 'disband', at: u.at, unit: u.type })}
              >
                {u.type === 'fleet' ? 'Fleet' : 'Army'} {name(at)}
              </button>
            ))}
        </div>
      )}

      {chosen.length > 0 && (
        <ul className="written">
          {chosen.map((c) => (
            <li key={c.at}>
              <span>
                {c.type === 'build' ? 'Build' : 'Give up'} {name(c.at)}
              </span>
              <button className="drop" onClick={() => onDrop(c.at)} title="Take it back">
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <button className="submit" onClick={onDone}>
        Done
      </button>
    </div>
  )
}

export type { Unit }
