import { PROVINCES, POWERS, base, type Power } from '../game/map'
import { CENTRES, SHAPES, SHIFT, VIEW_BOX, reachableFrom } from '../game/layout'
import type { Board as Units, Order } from '../game/orders'
import type { Ownership } from '../game/turn'

/**
 * The board.
 *
 * The outlines are the standard map's; everything drawn on them is this
 * game's. Flat fills and one dark line, a pale sea, and each power in a
 * colour you can tell from the others at a glance while somebody is arguing
 * with you about Galicia.
 *
 * Clicking a province lights up exactly where its unit may legally go, taken
 * from the rules rather than from which shapes happen to share an edge.
 */

export const COLOURS: Record<Power, string> = {
  austria: '#d4736c',
  england: '#e7a8c8',
  france: '#89b4dd',
  germany: '#9d9d9d',
  italy: '#93cc9e',
  russia: '#b08fc4',
  turkey: '#e8dc8c',
}

const SEA = '#d3e6f2'
const LAND = '#e6d8ba'
const LAND_SC = '#f3ead4'
const INK = '#2b2318'

export function Board({
  units,
  own,
  orders,
  selected,
  offering,
  onPick,
}: {
  units: Units
  own: Ownership
  /** Orders written so far, drawn on the board as they are given. */
  orders?: ReadonlyMap<string, Order>
  selected?: string | null
  /** Provinces the current step will accept a click on. */
  offering?: ReadonlySet<string>
  onPick?: (province: string) => void
}) {
  const ids = Object.keys(PROVINCES)
  const standing = selected ? units.get(selected) : undefined
  const reachable = offering ?? new Set(standing ? reachableFrom(standing) : [])
  const at = (id: string) => CENTRES[id] ?? CENTRES[base(id)]!

  const shade = (id: string) => {
    const p = PROVINCES[id]!
    if (p.terrain === 'sea') return SEA
    const owner = own.get(id)
    return owner ? COLOURS[owner] : p.sc ? LAND_SC : LAND
  }

  return (
    <svg className="board" viewBox={VIEW_BOX} role="img" aria-label="Europe in 1901.">
      <rect className="ocean" x="0" y="0" width="100%" height="100%" />

      <g transform={SHIFT}>
        {ids.map((id) => (
          <path
            key={id}
            className={`region ${PROVINCES[id]!.terrain === 'sea' ? 'sea' : 'land'} ${
              selected === id ? 'picked' : reachable.has(id) ? 'open' : ''
            }`}
            d={SHAPES[id] ?? ''}
            fill={shade(id)}
            onClick={() => onPick?.(id)}
          />
        ))}
      </g>

      {/* A supply centre is the only thing anybody is counting. */}
      {ids
        .filter((id) => PROVINCES[id]!.sc)
        .map((id) => (
          <circle
            className="pip"
            key={`p-${id}`}
            cx={CENTRES[id]!.x}
            cy={CENTRES[id]!.y - 26}
            r={7}
          />
        ))}

      {ids.map((id) => (
        <text
          className={`label ${PROVINCES[id]!.terrain === 'sea' ? 'wet' : ''}`}
          key={`t-${id}`}
          x={CENTRES[id]!.x}
          y={CENTRES[id]!.y - 38}
        >
          {id.toUpperCase()}
        </text>
      ))}

      {/*
        The orders, drawn where they are being given. A move is an arrow to
        where it is going; a support is a dashed line to what it is holding
        up; a hold is a ring round the unit. Seeing them on the board is the
        difference between checking your orders and re-reading a list.
      */}
      <g className="orders">
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5"
            markerHeight="5" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" />
          </marker>
        </defs>
        {[...(orders?.values() ?? [])].map((o) => {
          const from = at(o.at)
          if (o.type === 'hold') {
            return <circle className="o-hold" key={o.at} cx={from.x} cy={from.y} r={24} />
          }
          if (o.type === 'move') {
            const to = at(o.to)
            return (
              <line className="o-move" key={o.at} x1={from.x} y1={from.y} x2={to.x} y2={to.y} />
            )
          }
          // A support props something up somewhere else: draw it to the
          // province being held rather than to the unit doing the holding.
          const target = at(o.type === 'support' ? o.to : o.to)
          const via = at(o.from)
          return (
            <g className={o.type === 'support' ? 'o-support' : 'o-convoy'} key={o.at}>
              <line x1={from.x} y1={from.y} x2={via.x} y2={via.y} />
              {base(o.from) !== base(o.to) && (
                <line x1={via.x} y1={via.y} x2={target.x} y2={target.y} />
              )}
            </g>
          )
        })}
      </g>

      {[...units.entries()].map(([at, unit]) => {
        const p = CENTRES[unit.at] ?? CENTRES[base(unit.at)] ?? CENTRES[at]!
        return (
          <g className="unit" key={at} transform={`translate(${p.x} ${p.y})`}>
            {unit.type === 'army' ? (
              <path d="M-15 9 L-15 -3 L0 -13 L15 -3 L15 9 Z" fill={COLOURS[unit.power]} />
            ) : (
              <path
                d="M-17 7 L17 7 L9 -1 L3 -1 L3 -13 L-4 -1 L-17 -1 Z"
                fill={COLOURS[unit.power]}
              />
            )}
          </g>
        )
      })}
    </svg>
  )
}

export const POWER_NAMES: Record<Power, string> = {
  austria: 'Austria',
  england: 'England',
  france: 'France',
  germany: 'Germany',
  italy: 'Italy',
  russia: 'Russia',
  turkey: 'Turkey',
}

export { POWERS, INK }
