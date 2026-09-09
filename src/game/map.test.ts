import { describe, expect, it } from 'vitest'
import { ARMY, FLEET, OPENING, POWERS, PROVINCES, base } from './map'

/**
 * The board, checked against itself.
 *
 * An adjacency list this size is typed by hand once and wrong in three places
 * unless something looks. Symmetry is the test that earns its keep: if
 * Wales lists Yorkshire and Yorkshire does not list Wales, one of them is a
 * typo, and no amount of playing would reliably surface it -- it would just
 * mean a move that works in one direction and not the other.
 */

const ids = Object.keys(PROVINCES)
const seas = ids.filter((id) => PROVINCES[id]!.terrain === 'sea')
const inland = ids.filter((id) => PROVINCES[id]!.terrain === 'land')
const coasts = ids.filter((id) => PROVINCES[id]!.terrain === 'coast')

describe('the shape of the map', () => {
  it('is seventy-five provinces: nineteen sea and fifty-six land', () => {
    expect(ids).toHaveLength(75)
    expect(seas).toHaveLength(19)
    expect(inland.length + coasts.length).toBe(56)
  })

  it('has thirty-four supply centres, twenty-two of them home', () => {
    const sc = ids.filter((id) => PROVINCES[id]!.sc)
    expect(sc).toHaveLength(34)
    expect(sc.filter((id) => PROVINCES[id]!.home)).toHaveLength(22)
  })

  it('gives Russia four home centres and everybody else three', () => {
    for (const power of POWERS) {
      const home = ids.filter((id) => PROVINCES[id]!.home === power)
      expect(home, power).toHaveLength(power === 'russia' ? 4 : 3)
    }
  })

  it('names a coast only where a fleet has to choose one', () => {
    const split = ids.filter((id) => PROVINCES[id]!.coasts)
    expect(split.sort()).toEqual(['bul', 'spa', 'stp'])
  })
})

describe('where an army may walk', () => {
  it('knows every land province and no sea', () => {
    expect(Object.keys(ARMY).sort()).toEqual([...inland, ...coasts].sort())
  })

  it('never steps into water', () => {
    for (const [from, tos] of Object.entries(ARMY)) {
      for (const to of tos) {
        expect(PROVINCES[to], `${from} -> ${to}`).toBeDefined()
        expect(PROVINCES[to]!.terrain, `${from} -> ${to}`).not.toBe('sea')
      }
    }
  })

  it('is symmetric', () => {
    const oneWay: string[] = []
    for (const [from, tos] of Object.entries(ARMY)) {
      for (const to of tos) {
        if (!ARMY[to]?.includes(from)) oneWay.push(`${from} -> ${to}`)
      }
    }
    expect(oneWay).toEqual([])
  })

  it('lists nobody twice and never itself', () => {
    for (const [from, tos] of Object.entries(ARMY)) {
      expect(new Set(tos).size, from).toBe(tos.length)
      expect(tos, from).not.toContain(from)
    }
  })
})

describe('where a fleet may sail', () => {
  it('knows every sea and coast, and no inland province', () => {
    const expected = [
      ...seas,
      ...coasts.flatMap((id) =>
        PROVINCES[id]!.coasts ? PROVINCES[id]!.coasts!.map((c) => `${id}/${c}`) : [id],
      ),
    ]
    expect(Object.keys(FLEET).sort()).toEqual(expected.sort())
  })

  it('is never simply in Spain, Bulgaria or St Petersburg', () => {
    for (const id of ['spa', 'bul', 'stp']) expect(FLEET[id]).toBeUndefined()
  })

  it('names only places a fleet could be', () => {
    for (const [from, tos] of Object.entries(FLEET)) {
      for (const to of tos) {
        expect(FLEET[to], `${from} -> ${to}`).toBeDefined()
        expect(PROVINCES[base(to)]!.terrain, `${from} -> ${to}`).not.toBe('land')
      }
    }
  })

  it('is symmetric', () => {
    const oneWay: string[] = []
    for (const [from, tos] of Object.entries(FLEET)) {
      for (const to of tos) {
        if (!FLEET[to]?.includes(from)) oneWay.push(`${from} -> ${to}`)
      }
    }
    expect(oneWay).toEqual([])
  })

  it('gives every coastal province some water to sit on', () => {
    for (const id of coasts) {
      const keys = PROVINCES[id]!.coasts ? PROVINCES[id]!.coasts!.map((c) => `${id}/${c}`) : [id]
      for (const key of keys) {
        const wet = FLEET[key]!.filter((to) => PROVINCES[base(to)]!.terrain === 'sea')
        expect(wet.length, key).toBeGreaterThan(0)
      }
    }
  })
})

describe('Spring 1901', () => {
  it('puts twenty-two units on the board, all of them at home', () => {
    let units = 0
    for (const power of POWERS) {
      const { armies, fleets } = OPENING[power]
      units += armies.length + fleets.length
      for (const id of armies) {
        expect(ARMY[id], `${power} army ${id}`).toBeDefined()
        expect(PROVINCES[id]!.home, `${power} army ${id}`).toBe(power)
      }
      for (const id of fleets) {
        expect(FLEET[id], `${power} fleet ${id}`).toBeDefined()
        expect(PROVINCES[base(id)]!.home, `${power} fleet ${id}`).toBe(power)
      }
    }
    expect(units).toBe(22)
  })
})
