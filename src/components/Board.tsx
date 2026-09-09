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
            <ellipse className="shadow" cx="0" cy="13" rx="17" ry="4" />
            {unit.type === 'army' ? (
              <Soldier colour={COLOURS[unit.power]} />
            ) : (
              <Ship colour={COLOURS[unit.power]} />
            )}
          </g>
        )
      })}
    </svg>
  )
}

/**
 * An army: a soldier from the shoulders up, in a helmet.
 *
 * A person reads as troops at any size, which two stacked rectangles never
 * did -- the first pass drew a blockhouse and a wedge and at map scale they
 * were two similar smudges in the same colour. The silhouette has to do the
 * work, so the helmet is wider than the head and the shoulders are square.
 */
function Soldier({ colour }: { colour: string }) {
  return (
    <g>
      <path className="body" d="M-13 13 L-13 3 C-13 -3 -7 -6 0 -6 C7 -6 13 -3 13 3 L13 13 Z" fill={colour} />
      <circle className="head" cx="0" cy="-9" r="6.5" fill={colour} />
      {/* The brim is what makes it a helmet rather than a head. */}
      <path className="helmet" d="M-10 -11 C-10 -18 10 -18 10 -11 Z" fill={colour} />
      <path className="brim" d="M-11.5 -10.5 L11.5 -10.5" />
      <path className="lit" d="M-8 12 L-8 3 C-8 -1 -5 -3 -2 -3.5" />
    </g>
  )
}

/**
 * A fleet: a hull, a mast and a sail.
 *
 * The sail is the tell. A hull on its own is a wedge and a wedge is whatever
 * you already thought it was; a triangle above a curve is a boat before
 * anybody has decided to look.
 */
function Ship({ colour }: { colour: string }) {
  return (
    <g>
      <path className="sail" d="M1.5 -17 L14 1 L1.5 1 Z" fill={colour} />
      <path className="mast" d="M0 2 L0 -17" />
      <path
        className="hull"
        d="M-16 2 L16 2 C15 9 11 13 6 13 L-6 13 C-11 13 -15 9 -16 2 Z"
        fill={colour}
      />
      <path className="lit" d="M-12 4 C-11 8 -8 10 -4 10.5" />
    </g>
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
