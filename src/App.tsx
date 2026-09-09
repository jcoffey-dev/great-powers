import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { playCues, playEnding } from './audio/play'
import { ARMISTICE, THE_FRONT, THE_PUSH } from './audio/score'
import { synth } from './audio/synth'
import { Board, COLOURS, POWER_NAMES } from './components/Board'
import { BuildPanel, RetreatPanel } from './components/AdjustPanel'
import { OrderPanel, type Step } from './components/OrderPanel'
import { PressPanel } from './components/PressPanel'
import { consider, type Overture } from './game/bot'
import {
  LAST_YEAR,
  negotiate,
  newGame,
  resolveBuilds,
  resolveOrders,
  resolveRetreats,
  turnOf,
  type Game,
} from './game/game'
import { reachableFrom } from './game/layout'
import { POWERS, PROVINCES, base, type Power } from './game/map'
import { canStep, validate, type Order, type Unit } from './game/orders'
import type { Proposal } from './game/press'
import { endingSounded, mergeCues, type Cue } from './game/sound'
import { adjustmentFor, centreCount, type AdjustOrder, type RetreatOrder } from './game/turn'
import './App.css'

/**
 * The game, being played.
 *
 * Everything is clicks on the board or answers in the panel, because those
 * are the only two things this game asks of anybody: where are your units
 * going, and do you mean what you told Russia.
 */
export default function App() {
  const [power, setPower] = useState<Power>('austria')
  const [game, setGame] = useState<Game>(newGame)
  const [asked, setAsked] = useState<Overture[]>([])
  const [step, setStep] = useState<Step>({ kind: 'idle' })
  const [orders, setOrders] = useState<Map<string, Order>>(new Map())
  const [retreats, setRetreats] = useState<Map<string, RetreatOrder>>(new Map())
  const [builds, setBuilds] = useState<AdjustOrder[]>([])
  const [sound, setSound] = useState(true)

  // ------------------------------------------------------------ audio glue

  /*
   * A browser will not make a noise until somebody has touched the page, so
   * the context is opened on the first click rather than on load. Everything
   * before that is silent whatever the toggle says, which is the rule and
   * not a bug.
   */
  const started = useRef(false)

  /*
   * Which piece is playing is not decoration: spring is the march, autumn is
   * the same march at a hundred and thirty-two, and autumn is the season
   * that counts centres. You can hear what time of year it is.
   */
  const tune = game.phase === 'over' ? ARMISTICE : game.season === 'spring' ? THE_FRONT : THE_PUSH

  const wake = useCallback(() => {
    if (started.current || !sound) return
    started.current = true
    synth.ensure()
    synth.playTune(tune, false)
  }, [sound, tune])

  useEffect(() => {
    synth.setMusic(sound)
    synth.setSfx(sound)
  }, [sound])

  useEffect(() => {
    if (started.current) synth.playTune(tune, false)
  }, [tune])

  /** The ending, once, when there is one. */
  const ended = useRef(false)
  useEffect(() => {
    if (game.phase !== 'over' || ended.current) return
    ended.current = true
    playEnding(endingSounded(game.winner, game.out, power))
  }, [game.phase, game.winner, game.out, power])

  /*
   * The talking happens once per orders phase. Keeping a note of which turn
   * has been negotiated matters more than it looks: agreeing a deal changes
   * the game, and a re-run on every change would have the powers proposing
   * to each other in a loop for ever.
   */
  const talked = useRef<string>('')
  useEffect(() => {
    const key = `${power}-${game.year}-${game.season}-${game.phase}`
    if (game.phase !== 'orders' || talked.current === key) return
    talked.current = key
    const round = negotiate(game, power)
    setGame(round.game)
    setAsked(round.asked)
  }, [game, power])

  const own = game.own
  const units = game.board
  const pos = useMemo(() => ({ board: units, own }), [units, own])

  const offering = useMemo(() => {
    if (step.kind === 'idle') return new Set<string>()
    const unit = units.get(step.at)
    if (!unit) return new Set<string>()
    if (step.kind === 'move') return new Set(reachableFrom(unit).map(base))
    if (step.kind === 'support') {
      if (step.from === undefined) {
        return new Set([...units.keys()].filter((p) => p !== step.at && canReach(unit, p)))
      }
      const helped = units.get(step.from)
      if (!helped) return new Set<string>()
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
    if (synth.sfxOn) synth.written()
  }, [])

  const click = (province: string) => {
    wake()
    // Guarded rather than left to the muted bus, so a game played with the
    // sound off never opens an audio context at all.
    if (synth.sfxOn) synth.tap()
    const here = units.get(province)
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
      if (step.from === undefined) return setStep({ ...step, from: province })
      return write({ type: 'support', at: step.at, from: step.from, to: province, power })
    }
    if (step.from === undefined) return setStep({ ...step, from: province })
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

  const illegal = useMemo(() => validate(units, [...orders.values()]).illegal, [units, orders])

  /** Yes or no to somebody's approach. Neither answer binds anybody. */
  const answer = (overture: Overture, yes: boolean) => {
    if (synth.sfxOn) synth.telegraph(yes)
    setAsked((prev) => prev.filter((o) => o.proposal.id !== overture.proposal.id))
    if (yes) setGame((g) => ({ ...g, agreements: [...g.agreements, overture.proposal] }))
  }

  /** Ask a power to support a move already written, and hear back at once. */
  const ask = (to: Power, order: Extract<Order, { type: 'move' }>): string => {
    const proposal: Proposal = {
      id: `${power}-${to}-${turnOf(game)}-${base(order.to)}`,
      from: power,
      to,
      turn: turnOf(game),
      deal: { kind: 'support', mover: power, helper: to, from: order.at, to: order.to },
    }
    const theirs = { power: to, ledger: game.ledger, agreements: game.agreements }
    const reply = consider(pos, theirs, proposal, turnOf(game))
    if (synth.sfxOn) synth.telegraph(reply.reply === 'accept')
    if (reply.reply === 'accept') {
      setGame((g) => ({ ...g, agreements: [...g.agreements, proposal] }))
    }
    return reply.why
  }

  /**
   * Carry the game forward past anything the player has no say in.
   *
   * A retreat phase with none of your units beaten, or a winter where your
   * centres and units are level, is not a decision -- it is a screen asking
   * you to press Done. So those are stepped through, and the game stops only
   * where there is actually a choice to make.
   */
  const advance = useCallback(
    (from: Game): Game => {
      let g = from
      /*
       * Each phase reports its own sounds, so a submission that runs through
       * three of them would otherwise arrive with only the last one's. They
       * are collected here and played together.
       */
      let heard: Cue[] = g.sounds
      for (;;) {
        if (g.phase === 'retreats') {
          const mineBeaten = [...(g.outcome?.dislodged.values() ?? [])].some(
            (d) => d.unit.power === power,
          )
          if (mineBeaten) break
          g = resolveRetreats(g, power, [])
          heard = mergeCues(heard, g.sounds)
          continue
        }
        if (g.phase === 'builds') {
          if (adjustmentFor(g.own, g.board, power) !== 0) break
          g = resolveBuilds(g, power, [])
          heard = mergeCues(heard, g.sounds)
          continue
        }
        break
      }
      playCues(heard)
      return g
    },
    [power],
  )

  const submit = () => {
    wake()
    setOrders(new Map())
    setStep({ kind: 'idle' })
    setAsked([])
    setGame(advance(resolveOrders(game, power, [...orders.values()])))
  }

  const doneRetreating = () => {
    setGame(advance(resolveRetreats(game, power, [...retreats.values()])))
    setRetreats(new Map())
  }

  const doneBuilding = () => {
    setGame(advance(resolveBuilds(game, power, builds)))
    setBuilds([])
  }

  const mine = [...units.entries()].filter(([, u]) => u.power === power)
  const season = game.season === 'spring' ? 'Spring' : 'Autumn'

  return (
    <div className="app">
      <header>
        <h1>Great Powers</h1>
        <button
          type="button"
          className="sound"
          aria-pressed={sound}
          onClick={() => {
            const next = !sound
            setSound(next)
            if (next) wake()
          }}
        >
          {sound ? 'Sound on' : 'Sound off'}
        </button>
        <p className="dim">
          {game.phase === 'over'
            ? game.winner
              ? `${POWER_NAMES[game.winner]} has eighteen centres. That is the game.`
              : `Called at the end of ${game.year}. A draw between the survivors.`
            : `${season} ${game.year} of ${LAST_YEAR} — playing `}
          {game.phase !== 'over' && (
            <select
              value={power}
              onChange={(e) => {
                setPower(e.target.value as Power)
                setOrders(new Map())
                setStep({ kind: 'idle' })
              }}
            >
              {POWERS.map((p) => (
                <option key={p} value={p}>
                  {POWER_NAMES[p]}
                </option>
              ))}
            </select>
          )}
          {game.phase === 'orders' &&
            `. ${mine.length - orders.size} of ${mine.length} units still without orders.`}
          {game.phase === 'retreats' && '. Somebody of yours was thrown out.'}
          {game.phase === 'builds' && '. The winter.'}
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
            <li key={p} className={`${p === power ? 'me' : ''} ${game.out.includes(p) ? 'gone' : ''}`}>
              <span className="swatch" style={{ background: COLOURS[p] }} />
              {POWER_NAMES[p]}
              <span className="count">{centreCount(own, p)}</span>
            </li>
          ))}
        </ul>

        {game.phase === 'retreats' && game.outcome && (
          <RetreatPanel
            power={power}
            board={game.board}
            outcome={game.outcome}
            chosen={retreats}
            onChoose={(o) => setRetreats((prev) => new Map(prev).set(base(o.at), o))}
            onDone={doneRetreating}
          />
        )}

        {game.phase === 'builds' && (
          <BuildPanel
            power={power}
            board={game.board}
            own={game.own}
            chosen={builds}
            onChoose={(o) => setBuilds((prev) => [...prev, o])}
            onDrop={(at) => setBuilds((prev) => prev.filter((c) => base(c.at) !== base(at)))}
            onDone={doneBuilding}
          />
        )}

        {game.phase === 'orders' && (
        <PressPanel
          power={power}
          turn={turnOf(game)}
          ledger={game.ledger}
          asked={asked}
          agreements={game.agreements}
          orders={orders}
          onAnswer={answer}
          onAsk={ask}
        />
        )}

        {game.phase === 'orders' && (
        <OrderPanel
          units={units}
          orders={orders}
          step={step}
          illegal={illegal}
          onAsk={(kind) => setStep(step.kind === 'idle' ? step : ({ kind, at: step.at } as Step))}
          onClear={clear}
          onSubmit={submit}
        />
        )}

        <ul className="log">
          {game.log.slice(-6).map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      </aside>
    </div>
  )
}

function canReach(unit: Unit, province: string): boolean {
  if (canStep(unit, province)) return true
  const coasts = PROVINCES[province]?.coasts
  return coasts !== undefined && coasts.some((c) => canStep(unit, `${province}/${c}`))
}

function coastOf(unit: Unit, province: string): string {
  const coasts = PROVINCES[province]?.coasts
  if (unit.type === 'army' || !coasts) return province
  const open = coasts.map((c) => `${province}/${c}`).filter((k) => canStep(unit, k))
  return open.length === 1 ? open[0]! : province
}
