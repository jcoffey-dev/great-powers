import { describe, expect, it } from 'vitest'
import { IN_THE_HUNT, carried, onConcession, onDraw } from './concede'
import type { Power } from './map'
import type { Ownership } from './turn'

/** A board described by how many centres each power holds. */
const board = (counts: Partial<Record<Power, number>>): Ownership => {
  const own: Ownership = new Map()
  let n = 0
  for (const [power, count] of Object.entries(counts)) {
    for (let i = 0; i < count!; i++) own.set(`x${n++}`, power as Power)
  }
  return own
}

describe('a draw', () => {
  it('is refused by the power in front', () => {
    const own = board({ russia: 12, france: 6, italy: 4 })
    expect(onDraw(own, 'russia').agree).toBe(false)
  })

  it('is refused by anybody still within reach of the front', () => {
    const own = board({ russia: 12, france: 12 - IN_THE_HUNT })
    expect(onDraw(own, 'france').agree).toBe(false)
  })

  it('is accepted by anybody who has been left behind', () => {
    const own = board({ russia: 12, france: 12 - IN_THE_HUNT - 1 })
    expect(onDraw(own, 'france').agree).toBe(true)
  })

  it('is accepted by a power with nothing left', () => {
    const own = board({ russia: 12, france: 6 })
    expect(onDraw(own, 'italy').agree).toBe(true)
  })

  it('needs everybody, so one refusal is enough', () => {
    const own = board({ russia: 12, france: 6, italy: 4 })
    const votes = (['russia', 'france', 'italy'] as Power[]).map((p) => onDraw(own, p))
    expect(votes.filter((v) => v.agree)).toHaveLength(2)
    expect(carried(votes)).toBe(false)
  })

  it('carries when the board has no contender in it', () => {
    const own = board({ russia: 9, france: 5, italy: 5, turkey: 5 })
    const votes = (['france', 'italy', 'turkey'] as Power[]).map((p) => onDraw(own, p))
    expect(carried(votes)).toBe(true)
  })

  it('says why, either way', () => {
    const own = board({ russia: 12, france: 4 })
    expect(onDraw(own, 'russia').why).toMatch(/solo/)
    expect(onDraw(own, 'france').why).toMatch(/share/)
  })
})

describe('a concession', () => {
  it('is refused while the leader is nowhere near eighteen', () => {
    const own = board({ russia: 12, france: 6 })
    expect(onConcession(own, 'france', 'russia').agree).toBe(false)
  })

  it('is refused by somebody close enough to stop it', () => {
    const own = board({ russia: 15, france: 14 })
    expect(onConcession(own, 'france', 'russia').agree).toBe(false)
  })

  it('is accepted when the leader is nearly there and nobody can reach them', () => {
    const own = board({ russia: 16, france: 6, italy: 5 })
    expect(onConcession(own, 'france', 'russia').agree).toBe(true)
    expect(onConcession(own, 'italy', 'russia').agree).toBe(true)
  })

  it('is harder to get than a draw on the same board', () => {
    // The point of having both: a board where everybody will end it level is
    // usually a board where nobody will hand it over.
    const own = board({ russia: 13, france: 5, italy: 5 })
    const draw = (['france', 'italy'] as Power[]).map((p) => onDraw(own, p))
    const give = (['france', 'italy'] as Power[]).map((p) => onConcession(own, p, 'russia'))
    expect(carried(draw)).toBe(true)
    expect(carried(give)).toBe(false)
  })
})
