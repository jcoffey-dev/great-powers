import { describe, expect, it } from 'vitest'
import { ARMISTICE, THE_FRONT, THE_PUSH } from './score'
import { noteToFreq, type Tune } from './synth'

/**
 * The music cannot be listened to by a test, but it can be proved to be
 * playable, which is the half that fails silently.
 *
 * A mistyped note name does not throw: `noteToFreq` returns 0, the oscillator
 * is set to 0 Hz, and that voice is simply not there for the rest of the
 * piece. You would have to notice a missing inner part by ear, in a tune you
 * have heard forty times while testing something else. So every step of every
 * track is checked here instead.
 *
 * The key is checked too, which is not pedantry: three pieces meant to be the
 * same war have to agree about what note the war is in, and a B natural typed
 * for a B flat would be a wrong note nobody would trace back to a keyboard.
 */

const KIT = new Set(['K', 'S', 'C', 'H', 'O'])
const TUNES: [string, Tune][] = [
  ['THE_FRONT', THE_FRONT],
  ['THE_PUSH', THE_PUSH],
  ['ARMISTICE', ARMISTICE],
]

/** D minor, with the raised leading note and the picardy third allowed. */
const IN_KEY = new Set(['D', 'E', 'F', 'G', 'A', 'A#', 'C', 'C#', 'F#'])

describe.each(TUNES)('%s', (_name, tune) => {
  it('names a note the synth can find, on every step of every track', () => {
    for (const track of tune.tracks) {
      for (const step of track.notes) {
        if (step === '.' || step === '=') continue
        if (track.wave === 'noise') {
          expect(KIT).toContain(step)
          continue
        }
        // Chords are stacked with slashes; every voice in one has to parse.
        for (const note of step.split('/')) {
          expect(noteToFreq(note), `${note} in ${step}`).toBeGreaterThan(0)
        }
      }
    }
  })

  it('stays in D minor', () => {
    for (const track of tune.tracks) {
      if (track.wave === 'noise') continue
      for (const step of track.notes) {
        if (step === '.' || step === '=') continue
        for (const note of step.split('/')) {
          expect(IN_KEY, note).toContain(note.replace(/-?\d$/, ''))
        }
      }
    }
  })

  it('is the same length on every track, so the loop does not drift', () => {
    const lengths = new Set(tune.tracks.map((t) => t.notes.length))
    expect(lengths.size).toBe(1)
  })

  it('starts on a note rather than a tie', () => {
    // '=' sustains the previous step, and there is no previous step at zero.
    for (const track of tune.tracks) expect(track.notes[0]).not.toBe('=')
  })
})

it('marches faster in autumn than in spring', () => {
  // Not decoration: which piece is playing is how the year is counted.
  expect(THE_PUSH.bpm).toBeGreaterThan(THE_FRONT.bpm)
  expect(ARMISTICE.bpm).toBeLessThan(THE_FRONT.bpm)
})
