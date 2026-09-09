import { PROVINCES, POWERS, base, type Power } from '../game/map'
import { CENTRES, bounds, cell, path, radius, reachableFrom } from '../game/layout'
import type { Board as Units } from '../game/orders'
import type { Ownership } from '../game/turn'

/**
 * The board.
 *
 * Territories, drawn from coordinates I placed by hand and divided by the
 * halfway line between them. Nothing here is a picture of anybody's map.
 * Flat fills, one heavy outline, no gradients: the same cel style the other
 * three games use.
 *
 * The regions are what the map looks like; they are not what the rules are
 * read from. A Voronoi cell cannot reproduce every adjacency in this game --
 * provinces interleave, and the Adriatic borders Venice with Trieste sitting
 * between their centres -- so clicking a province lights up exactly where its
 * unit may legally go, taken from the adjacency graph itself. The picture is
 * a picture; the rules answer for themselves when asked.
 */

export const COLOURS: Record<Power, string> = {
  austria: '#e4572e',
  england: '#3b5bdb',
  france: '#4dabf7',
  germany: '#4b545e',
  italy: '#37b24d',
  russia: '#9775fa',
  turkey: '#f2a03d',
}

const SEA = '#5b93bd'
const SEA_DEEP = '#4a7fa8'
const LAND = '#ded0ab'
const LAND_SC = '#efe3c2'
const OUTLINE = '#241a10'

export function Board({
  units,
  own,
  selected,
  onPick,
}: {
  units: Units
  own: Ownership
  selected?: string | null
  onPick?: (province: string) => void
}) {
  const box = bounds(10)
  const ids = Object.keys(PROVINCES)

  const standing = selected ? units.get(selected) : undefined
  const reachable = new Set(standing ? reachableFrom(standing) : [])

  return (
    <svg
      className="board"
      viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
      role="img"
      aria-label="The board: seventy-five provinces, coloured by who holds them."
    >
      <rect className="ocean" x={box.x} y={box.y} width={box.w} height={box.h} />

      {/* Territories. Sea first so the coastlines sit on top of the water. */}
      {ids
        .sort((a, b) => Number(PROVINCES[b]!.terrain === 'sea') - Number(PROVINCES[a]!.terrain === 'sea'))
        .map((id) => {
          const p = PROVINCES[id]!
          const owner = own.get(id)
          const fill =
            p.terrain === 'sea' ? (p.sc ? SEA : SEA_DEEP) : owner ? COLOURS[owner] : p.sc ? LAND_SC : LAND

          return (
            <path
              key={id}
              className={`region ${p.terrain} ${p.sc ? 'centre' : ''} ${
                selected === id ? 'picked' : reachable.has(id) ? 'open' : ''
              }`}
              d={path(cell(id))}
              fill={fill}
              onClick={() => onPick?.(id)}
            />
          )
        })}

      {/* Supply centres get a mark of their own: they are the only thing
          anybody is actually counting. */}
      {ids
        .filter((id) => PROVINCES[id]!.sc)
        .map((id) => (
          <circle
            className="pip"
            key={`pip-${id}`}
            cx={CENTRES[id]!.x}
            cy={CENTRES[id]!.y - radius(id) * 0.55}
            r={4.4}
          />
        ))}

      {ids.map((id) => (
        <text
          className={`label ${PROVINCES[id]!.terrain === 'sea' ? 'wet' : ''}`}
          key={`t-${id}`}
          x={CENTRES[id]!.x}
          y={CENTRES[id]!.y + 4}
        >
          {id.toUpperCase()}
        </text>
      ))}

      {/* Units last: they are what you are actually looking at. */}
      {[...units.entries()].map(([at, unit]) => {
        const p = CENTRES[base(unit.at)] ?? CENTRES[at]!
        return (
          <g className="unit" key={at} transform={`translate(${p.x} ${p.y + 17})`}>
            {unit.type === 'army' ? (
              <path d="M-11 6 L-11 -3 L0 -9 L11 -3 L11 6 Z" fill={COLOURS[unit.power]} />
            ) : (
              <path d="M-12 4 L12 4 L7 -2 L2 -2 L2 -9 L-3 -2 L-12 -2 Z" fill={COLOURS[unit.power]} />
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

export { POWERS, OUTLINE }
