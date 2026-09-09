import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { playCues, playEnding } from './audio/play'
import { ARMISTICE, THE_FRONT, THE_PUSH } from './audio/score'
import { synth } from './audio/synth'
import { Board, COLOURS, POWER_NAMES } from './components/Board'
import { BuildPanel, RetreatPanel } from './components/AdjustPanel'
import { OrderPanel, type Step } from './components/OrderPanel'
import { Landing } from './components/Landing'
import { PressPanel } from './components/PressPanel'
import { consider, type Overture } from './game/bot'
import {
  LAST_YEAR,
  negotiate,
  newGame,
  askForDraw,
  askToConcede,
  resign,
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
import {
  convoyDestinations,
  convoyTargets,
  convoyable,
  supportTargets,
  supportable,
} from './game/targets'
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
  const [started, setStarted] = useState(false)
  const [said, setSaid] = useState<string[]>([])
  const [sure, setSure] = useState(false)

  // ------------------------------------------------------------ audio glue

  /*
   * A browser will not make a noise until somebody has touched the page, so
   * the context is opened on the first click rather than on load. Everything
   * before that is silent whatever the toggle says, which is the rule and
   * not a bug.
   */
  const woken = useRef(false)

  /*
   * Which piece is playing is not decoration: spring is the march, autumn is
   * the same march at a hundred and thirty-two, and autumn is the season
   * that counts centres. You can hear what time of year it is.
   */
  const tune = game.phase === 'over' ? ARMISTICE : game.season === 'spring' ? THE_FRONT : THE_PUSH

  const wake = useCallback(() => {
    if (woken.current || !sound) return
    woken.current = true
    synth.ensure()
    synth.playTune(tune, false)
  }, [sound, tune])

  useEffect(() => {
    synth.setMusic(sound)
    synth.setSfx(sound)
  }, [sound])

  useEffect(() => {
    if (woken.current) synth.playTune(tune, false)
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
    if (!started || game.phase !== 'orders' || talked.current === key) return
    talked.current = key
    const round = negotiate(game, power)
    setGame(round.game)
    setAsked(round.asked)
  }, [game, power, started])

  const own = game.own
  const units = game.board
  const pos = useMemo(() => ({ board: units, own }), [units, own])

  /*
   * The coasts the selected army could be carried to.
   *
   * Kept separate from the rest of the offering because the board draws it
   * differently -- a crossing is not a march, and a player who cannot tell
   * them apart will order one meaning the other -- and because it is what
   * decides whether the move is written `viaConvoy`.
   */
  const bySea = useMemo(() => {
    if (step.kind !== 'move') return new Set<string>()
    const unit = units.get(step.at)
    if (!unit) return new Set<string>()
    const legs = new Set(reachableFrom(unit).map(base))
    return new Set([...convoyDestinations(units, unit)].filter((p) => !legs.has(p)))
  }, [step, units])

  const offering = useMemo(() => {
    if (step.kind === 'idle') return new Set<string>()
    const unit = units.get(step.at)
    if (!unit) return new Set<string>()
    if (step.kind === 'move') {
      // Where its own legs go, and where somebody's fleets could take it.
      return new Set([...reachableFrom(unit).map(base), ...bySea])
    }
    if (step.kind === 'support') {
      return step.from === undefined
        ? supportable(units, unit)
        : supportTargets(units, unit, step.from)
    }
    return step.from === undefined
      ? convoyable(units, unit)
      : convoyTargets(units, unit, step.from)
  }, [step, units, bySea])

  const write = useCallback((order: Order) => {
    setOrders((prev) => new Map(prev).set(base(order.at), order))
    setStep({ kind: 'idle' })
    if (synth.sfxOn) synth.written()
  }, [])

  const click = (province: string) => {
    wake()
    const here = units.get(province)

    /*
     * A click that the current step cannot use.
     *
     * Half-written orders used to be thrown away by one of these: you picked
     * Support, picked the unit to help, missed the destination by a province,
     * and the whole thing silently became a fresh Move somewhere else. So a
     * two-part order now stands its ground and says no. Clicking the unit
     * giving the order takes you back to the start of it, and every other
     * unit of yours still switches straight over, which is what makes
     * writing a page of orders quick.
     */
    if (step.kind !== 'idle' && !offering.has(province)) {
      const half = step.kind !== 'move' && step.from !== undefined
      if (half && province !== step.at) {
        if (synth.sfxOn) synth.reject()
        return
      }
      if (synth.sfxOn) synth.tap()
      if (here?.power === power) setStep({ kind: 'move', at: province })
      else setStep({ kind: 'idle' })
      return
    }
    // Guarded rather than left to the muted bus, so a game played with the
    // sound off never opens an audio context at all.
    if (synth.sfxOn) synth.tap()
    if (step.kind === 'idle') {
      if (here?.power === power) setStep({ kind: 'move', at: province })
      return
    }
    if (step.kind === 'move') {
      /*
       * A destination its legs cannot reach is a crossing, and saying so is
       * not a formality: the rules let a unit be convoyed to a province it
       * could have walked to, and the two orders resolve differently.
       */
      write({
        type: 'move',
        at: step.at,
        to: coastOf(units.get(step.at)!, province),
        power,
        ...(bySea.has(province) ? { viaConvoy: true } : {}),
      })
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
      // A player who has resigned or been eliminated is not asked anything
      // again. The turns still have to happen: the rest of the board is
      // playing for a win and the result is worth watching.
      const done = g.resigned.includes(power) || g.out.includes(power)
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
          if (mineBeaten && !done) break
          g = resolveRetreats(g, power, [])
          heard = mergeCues(heard, g.sounds)
          continue
        }
        if (g.phase === 'builds') {
          if (!done && adjustmentFor(g.own, g.board, power) !== 0) break
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

  /*
   * Giving up, in its two shapes. See `concede.ts`: resigning needs nobody's
   * permission and a draw needs everybody's, and the refusals come back with
   * their reasons so they can be argued with next year.
   */
  const giveUp = () => {
    // Asked twice, in the page rather than in a browser dialog: this is the
    // one button here that cannot be taken back.
    if (!sure) {
      setSure(true)
      if (synth.sfxOn) synth.reject()
      return
    }
    if (synth.sfxOn) synth.disband()
    setGame(resign(game, power))
    setSure(false)
    setSaid([])
  }

  const askDraw = () => {
    setSure(false)
    if (synth.sfxOn) synth.telegraph(false)
    const { game: next, verdicts } = askForDraw(game, power)
    setGame(next)
    setSaid(verdicts.filter((v) => !v.agree).map((v) => v.why))
  }

  const askConcede = () => {
    setSure(false)
    const leader = POWERS.reduce((best, p) =>
      centreCount(own, p) > centreCount(own, best) ? p : best,
    )
    if (synth.sfxOn) synth.telegraph(false)
    const { game: next, verdicts } = askToConcede(game, power, leader)
    setGame(next)
    setSaid(verdicts.filter((v) => !v.agree).map((v) => v.why))
  }

  const doneBuilding = () => {
    setGame(advance(resolveBuilds(game, power, builds)))
    setBuilds([])
  }

  const mine = [...units.entries()].filter(([, u]) => u.power === power)
  const season = game.season === 'spring' ? 'Spring' : 'Autumn'
  const quit = game.resigned.includes(power) || game.out.includes(power)

  if (!started) {
    return (
      <Landing
        power={power}
        onPick={(p) => {
          wake()
          if (synth.sfxOn) synth.tap()
          setPower(p)
        }}
        onStart={() => {
          wake()
          if (synth.sfxOn) synth.dice()
          setStarted(true)
        }}
      />
    )
  }

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
            (quit
              ? '. Watching.'
              : `. ${mine.length - orders.size} of ${mine.length} units still without orders.`)}
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
          helping={step.kind === 'support' || step.kind === 'convoy' ? step.from : null}
          offering={offering}
          bySea={bySea}
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

        {game.phase === 'retreats' && game.outcome && !quit && (
          <RetreatPanel
            power={power}
            board={game.board}
            outcome={game.outcome}
            chosen={retreats}
            onChoose={(o) => setRetreats((prev) => new Map(prev).set(base(o.at), o))}
            onDone={doneRetreating}
          />
        )}

        {game.phase === 'builds' && !quit && (
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

        {game.phase === 'orders' && !quit && (
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

        {quit && game.phase !== 'over' && (
          <button type="button" className="submit watch" onClick={submit}>
            Next turn
          </button>
        )}

        {game.phase !== 'over' && (
          <div className="giving-up">
            {quit ? (
              <p className="dim">
                {game.out.includes(power)
                  ? 'You have no centres left. The rest plays out without you.'
                  : 'You have resigned. Your units hold where they stand.'}
              </p>
            ) : (
              <>
                <button type="button" onClick={askDraw}>
                  Ask for a draw
                </button>
                <button type="button" onClick={askConcede}>
                  Offer the game
                </button>
                <button type="button" className="resign" onClick={giveUp}>
                  {sure ? 'Resign — certain?' : 'Resign'}
                </button>
              </>
            )}
            {said.length > 0 && (
              <ul className="said">
                {said.map((why, i) => (
                  <li key={i}>{why}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {game.phase === 'orders' && !quit && (
        <OrderPanel
          units={units}
          orders={orders}
          step={step}
          illegal={illegal}
          bySea={bySea.size > 0}
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

function coastOf(unit: Unit, province: string): string {
  const coasts = PROVINCES[province]?.coasts
  if (unit.type === 'army' || !coasts) return province
  const open = coasts.map((c) => `${province}/${c}`).filter((k) => canStep(unit, k))
  return open.length === 1 ? open[0]! : province
}
