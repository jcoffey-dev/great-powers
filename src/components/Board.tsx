import { PROVINCES, POWERS, base, type Power } from '../game/map'
import { CENTRES, borders, bounds, radius } from '../game/layout'
import type { Board as Units } from '../game/orders'
import type { Ownership } from '../game/turn'

/**
 * The board.
 *
 * Everything is drawn from `layout.ts` and the rules, so nothing here is a
 * picture of anybody's map. Flat fills, one heavy outline, no gradients: the
 * same cel style the other three games use, on a board that has to stay
 * readable at a glance while somebody is arguing with you about Galicia.
 *
 * Borders are lines because in this game the adjacency *is* the rules. A
 * region map has to decide whether two shapes touch, and when it gets that
 * wrong it costs somebody the game. A line cannot be misread.
 */

export const COLOURS: Record<Power, string> = {
  austria: '#e4572e',
  england: '#3b5bdb',
  france: '#4dabf7',
  germany: '#495057',
  italy: '#37b24d',
  russia: '#9775fa',
  turkey: '#f59f00',
}

const SEA = '#4a7fa8'
const LAND = '#e8d9b5'
const NEUTRAL_SC = '#fff6e0'
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
  const edges = borders()
  const box = bounds()

  return (
    <svg
      className="board"
      viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
      role="img"
      aria-label="The board: seventy-five provinces and the borders between them."
    >
      <rect className="sea-bed" x={box.x} y={box.y} width={box.w} height={box.h} />

      {/* Borders first, so every province sits on top of its own edges. */}
      <g className="edges">
        {edges.map(([a, b]) => (
          <line
            key={`${a}-${b}`}
            x1={CENTRES[a]!.x}
            y1={CENTRES[a]!.y}
            x2={CENTRES[b]!.x}
            y2={CENTRES[b]!.y}
          />
        ))}
      </g>

      {Object.keys(PROVINCES).map((id) => {
        const p = PROVINCES[id]!
        const at = CENTRES[id]!
        const r = radius(id)
        const owner = own.get(id)
        const fill =
          p.terrain === 'sea' ? SEA : owner ? COLOURS[owner] : p.sc ? NEUTRAL_SC : LAND

        return (
          <g
            className={`province ${p.terrain} ${p.sc ? 'centre' : ''} ${selected === id ? 'picked' : ''}`}
            key={id}
            onClick={() => onPick?.(id)}
          >
            {p.terrain === 'sea' ? (
              <circle cx={at.x} cy={at.y} r={r} fill={fill} />
            ) : (
              <rect
                x={at.x - r}
                y={at.y - r * 0.82}
                width={r * 2}
                height={r * 1.64}
                rx={r * 0.45}
                fill={fill}
              />
            )}

            {/* A supply centre is the only thing anybody is counting, so it
                gets a mark of its own rather than a different shade. */}
            {p.sc && <circle className="pip" cx={at.x} cy={at.y - r * 0.86} r={4} />}

            <text
              className="label"
              x={at.x}
              y={at.y + 5}
              style={{ fill: labelInk(p.terrain === 'sea' ? SEA : owner ? COLOURS[owner] : LAND) }}
            >
              {id.toUpperCase()}
            </text>
          </g>
        )
      })}

      {/* Units last: they are what you are actually looking at. */}
      {[...units.entries()].map(([at, unit]) => {
        const p = CENTRES[base(unit.at)] ?? CENTRES[at]!
        return (
          <g className="unit" key={at} transform={`translate(${p.x} ${p.y + 16})`}>
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

/** Dark text on a light province, light on a dark one. */
function labelInk(background: string): string {
  const n = parseInt(background.slice(1), 16)
  const lum = (((n >> 16) & 255) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000
  return lum > 140 ? OUTLINE : '#fff6e0'
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

export { POWERS }
