import { useState } from 'react'
import { POWER_NAMES } from './Board'
import type { Overture } from '../game/bot'
import { PROVINCES, POWERS, base, type Power } from '../game/map'
import type { Order } from '../game/orders'
import { look, trust, type Agreement, type Ledger } from '../game/press'

/**
 * What the powers are saying to you, and what you say back.
 *
 * The whole point of this game is here rather than on the board. A power
 * asks for something in a sentence, you answer yes or no, and at the end of
 * the turn the orders say whether either of you meant it. Nothing in this
 * panel enforces anything -- accepting a deal writes no order and stops no
 * order being written. That gap is the game.
 */

export function PressPanel({
  power,
  turn,
  ledger,
  asked,
  agreements,
  orders,
  onAnswer,
  onAsk,
}: {
  power: Power
  turn: number
  ledger: Ledger
  /** Approaches made to the player this turn. */
  asked: readonly Overture[]
  agreements: readonly Agreement[]
  /** The player's own orders, so help can be asked for a move already written. */
  orders: ReadonlyMap<string, Order>
  onAnswer: (overture: Overture, yes: boolean) => void
  onAsk: (to: Power, order: Extract<Order, { type: 'move' }>) => string
  }) {
  const [said, setSaid] = useState<{ to: Power; reply: string } | null>(null)

  const mine = agreements.filter((a) => a.from === power || a.to === power)
  const moves = [...orders.values()].filter(
    (o): o is Extract<Order, { type: 'move' }> => o.type === 'move',
  )

  return (
    <div className="press">
      <h2>The press</h2>

      {asked.length === 0 ? (
        <p className="dim small">Nobody has approached you this turn.</p>
      ) : (
        <ul className="asks">
          {asked.map((o) => (
            <li key={o.proposal.id}>
              <p className="who">{POWER_NAMES[o.proposal.from]} says</p>
              <p className="quote">&ldquo;{o.says}&rdquo;</p>
              <div className="answer">
                <button onClick={() => onAnswer(o, true)}>Agree</button>
                <button className="no" onClick={() => onAnswer(o, false)}>
                  Refuse
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/*
        Asking is done from an order already written, because that is the
        only shape this request has ever taken: I am going there, help me.
      */}
      {moves.length > 0 && (
        <div className="asking">
          <p className="small dim">Ask for help with:</p>
          {moves.map((o) => (
            <div className="ask-row" key={o.at}>
              <span>
                {base(o.at)} &rarr; {base(o.to)}
              </span>
              <span className="whoms">
                {POWERS.filter((p) => p !== power).map((p) => (
                  <button
                    key={p}
                    title={`Ask ${POWER_NAMES[p]}`}
                    onClick={() => setSaid({ to: p, reply: onAsk(p, o) })}
                  >
                    {POWER_NAMES[p].slice(0, 2)}
                  </button>
                ))}
              </span>
            </div>
          ))}
          {said && (
            <p className="quote reply">
              {POWER_NAMES[said.to]}: &ldquo;{said.reply}&rdquo;
            </p>
          )}
        </div>
      )}

      {mine.length > 0 && (
        <>
          <h3>Agreed this turn</h3>
          <ul className="deals">
            {mine.map((a) => (
              <li key={a.id}>{describe(a, power)}</li>
            ))}
          </ul>
        </>
      )}

      <h3>What they make of you</h3>
      <ul className="opinions">
        {POWERS.filter((p) => p !== power).map((p) => {
          const r = look(ledger, p, power)
          return (
            <li key={p}>
              <span>{POWER_NAMES[p]}</span>
              <span className="dim small">
                {r.kept + r.broken === 0
                  ? 'no dealings'
                  : `${r.kept} kept, ${r.broken} broken`}
              </span>
              <span className="bar" aria-hidden>
                <i style={{ width: `${Math.round(trust(ledger, p, power, turn) * 100)}%` }} />
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function describe(a: Agreement, me: Power): string {
  const them = a.from === me ? a.to : a.from
  const who = POWER_NAMES[them]
  switch (a.deal.kind) {
    case 'peace':
      return `Peace with ${who}.`
    case 'dmz':
      return `${PROVINCES[base(a.deal.province)]!.name} left empty, with ${who}.`
    case 'support':
      return a.deal.helper === me
        ? `You support ${who}: ${base(a.deal.from)} → ${base(a.deal.to)}.`
        : `${who} supports you: ${base(a.deal.from)} → ${base(a.deal.to)}.`
  }
}
