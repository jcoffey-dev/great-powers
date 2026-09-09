import { useMemo, useState } from 'react'
import { Board, COLOURS, POWER_NAMES } from './components/Board'
import { OPENING, POWERS, PROVINCES } from './game/map'
import { boardFrom, type Unit } from './game/orders'
import { centreCount, openingOwnership } from './game/turn'
import './App.css'

/**
 * The opening position, on the board, so the map can be looked at.
 *
 * This is scaffolding: order entry, the press and the turn loop are not
 * wired to it yet. What it is for is seeing whether seventy-five provinces
 * and twenty-two units are legible at a glance, which is a question no test
 * can answer.
 */
export default function App() {
  const [picked, setPicked] = useState<string | null>(null)

  const units = useMemo(() => {
    const all: Unit[] = []
    for (const power of POWERS) {
      for (const at of OPENING[power].armies) all.push({ power, type: 'army', at })
      for (const at of OPENING[power].fleets) all.push({ power, type: 'fleet', at })
    }
    return boardFrom(all)
  }, [])

  const own = useMemo(openingOwnership, [])

  return (
    <div className="app">
      <header>
        <h1>Great Powers</h1>
        <p className="dim">Spring 1901 &mdash; the board before anybody has said anything.</p>
      </header>

      <div className="map-wrap">
        <Board units={units} own={own} selected={picked} onPick={setPicked} />
      </div>

      <aside className="side">
        <ul className="powers">
          {POWERS.map((power) => (
            <li key={power}>
              <span className="swatch" style={{ background: COLOURS[power] }} />
              {POWER_NAMES[power]}
              <span className="count">{centreCount(own, power)}</span>
            </li>
          ))}
        </ul>

        <div className="picked">
          {picked ? (
            <>
              <h2>{PROVINCES[picked]!.name}</h2>
              <p className="dim">
                {PROVINCES[picked]!.terrain === 'sea'
                  ? 'Open water. Fleets only.'
                  : PROVINCES[picked]!.terrain === 'coast'
                    ? 'Coastal. Armies and fleets.'
                    : 'Inland. Armies only.'}
                {PROVINCES[picked]!.sc ? ' A supply centre.' : ''}
              </p>
            </>
          ) : (
            <p className="dim">Click a province.</p>
          )}
        </div>
      </aside>
    </div>
  )
}
