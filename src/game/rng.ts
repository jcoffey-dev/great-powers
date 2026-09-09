/**
 * mulberry32 — small, fast, seedable PRNG.
 * The board is fixed, but the bots are not; a seed lets a whole game be replayed or
 * shared, and so a test can give the same power the same idea twice.
 */
export function makeRng(seed: number) {
  let a = seed >>> 0
  return function rng(): number {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type Rng = ReturnType<typeof makeRng>

export const chance = (rng: Rng, p: number) => rng() < p
