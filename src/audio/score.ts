import type { Tune } from './synth'

/**
 * The score, and what it is and is not.
 *
 * It is not a quotation. There is a great deal of music from and about that
 * war and a fair amount of it is still in copyright somewhere, and it would
 * be a strange sort of care to build the map from a licensed source, credit
 * it properly, and then lift eight bars of somebody's march.
 *
 * What it *is* is the idiom, which belongs to nobody: a minor key, dotted
 * rhythms, low brass moving in whole bars, and a side drum that never stops.
 * That is how music has meant "an army is moving" since long before 1914 --
 * it is Beethoven's funeral marches before it is anybody's, and the dominant
 * chord borrowed from the harmonic minor, which does most of the work here,
 * is older than that again. Nobody owns a raised leading note.
 *
 * D minor throughout, so the three pieces are the same war. The instruments
 * are the six voices the sibling games use, leant on differently:
 *
 *   - **brass** is a detuned saw with the filter closing across each note;
 *   - **the band** is a quiet pulse-50 holding actual chords, one a bar;
 *   - **the bass** is a triangle, low, doubling the root;
 *   - **the drums** are the kit's kick as a bass drum and its snare as a
 *     side drum, on separate tracks because they play at once.
 *
 * There are three, and which one you are hearing tells you something:
 *
 *   - `THE_FRONT` in spring, when the armies move and nothing is decided;
 *   - `THE_PUSH` in autumn, when centres change hands and the year is
 *     counted -- same key, twice the pulse, and the drum never leaves;
 *   - `ARMISTICE` when it is over, whoever won.
 */

const bar = (...steps: string[]) => steps

/** A chord held for a whole bar. */
const held = (chord: string) => [chord, '=', '=', '=', '=', '=', '=', '=']

/** The bass, doing the same. */
const pedal = held

const BRASS = {
  wave: 'saw',
  gain: 0.12,
  gate: 0.94,
  detune: 6,
  filter: { from: 1600, to: 850, q: 1.3 },
} as const

const BAND = { wave: 'pulse50', gain: 0.045, gate: 1 } as const
const BASS = { wave: 'triangle', gain: 0.24, gate: 1 } as const

/**
 * Spring.
 *
 * Eight bars. It opens on the dotted figure that is the whole march -- a
 * long D, a short E, a long F -- and climbs that same shape twice, the
 * second time from a fourth higher so it can reach the top D and stop.
 *
 * The third bar is where it stops being a parade: the band goes to A major
 * rather than A minor, which is a note that does not belong to the key and
 * is the reason the bar sounds like a warning.
 */
export const THE_FRONT: Tune = {
  bpm: 100,
  stepsPerBeat: 2,
  tracks: [
    {
      ...BRASS,
      notes: [
        ...bar('D4', '=', '=', 'E4', 'F4', '=', '=', '='),
        ...bar('E4', '=', '=', 'F4', 'G4', '=', '=', '='),
        ...bar('A4', '=', '=', '=', 'G4', '=', 'F4', '='),
        ...bar('E4', '=', '=', '=', '=', '=', '.', '.'),
        ...bar('A4', '=', '=', 'A#4', 'A4', '=', '=', '='),
        ...bar('G4', '=', '=', 'A4', 'A#4', '=', '=', '='),
        ...bar('C5', '=', '=', '=', 'A#4', '=', 'A4', '='),
        ...bar('D5', '=', '=', '=', '=', '=', '=', '.'),
      ],
    },
    {
      ...BAND,
      notes: [
        ...held('D3/F3/A3'),
        ...held('D3/F3/A3'),
        ...held('A2/C#3/E3'),
        ...held('D3/F3/A3'),
        ...held('D3/F3/A3'),
        ...held('A#2/D3/F3'),
        ...held('A2/C#3/E3'),
        ...held('D3/F3/A3'),
      ],
    },
    {
      ...BASS,
      notes: [
        ...pedal('D2'),
        ...pedal('D2'),
        ...pedal('A1'),
        ...pedal('D2'),
        ...pedal('D2'),
        ...pedal('A#1'),
        ...pedal('A1'),
        ...pedal('D2'),
      ],
    },
    {
      // The side drum. The same four-bar figure twice, opening out at the
      // end of each half -- a drummer marks the turn, he does not vamp.
      wave: 'noise',
      gain: 0.16,
      notes: [
        ...bar('S', '.', 'S', 'S', '.', 'S', '.', '.'),
        ...bar('S', '.', 'S', 'S', '.', 'S', '.', '.'),
        ...bar('S', '.', 'S', 'S', '.', 'S', '.', '.'),
        ...bar('S', 'S', 'S', 'S', 'S', '.', 'S', '.'),
        ...bar('S', '.', 'S', 'S', '.', 'S', '.', '.'),
        ...bar('S', '.', 'S', 'S', '.', 'S', '.', '.'),
        ...bar('S', '.', 'S', 'S', '.', 'S', '.', '.'),
        ...bar('S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'),
      ],
    },
    {
      // The bass drum, on the tread.
      wave: 'noise',
      gain: 0.3,
      notes: Array.from({ length: 64 }, (_, i) => (i % 4 === 0 ? 'K' : '.')),
    },
  ],
}

/**
 * Autumn.
 *
 * The same key and the same drum, at a hundred and thirty-two, with the bass
 * on every quaver instead of holding. Four bars rather than eight, because
 * the point of it is that it comes round again too soon.
 *
 * The melody hammers one note before it moves, which is the cheapest way
 * music has of sounding out of patience, and the last bar is the dominant
 * seventh left hanging -- so the loop does not settle, it restarts.
 */
export const THE_PUSH: Tune = {
  bpm: 132,
  stepsPerBeat: 2,
  tracks: [
    {
      ...BRASS,
      gain: 0.13,
      notes: [
        ...bar('D5', 'D5', 'D5', '=', 'C#5', '=', 'D5', '='),
        ...bar('F5', '=', 'E5', '=', 'D5', '=', 'C#5', '='),
        ...bar('D5', 'D5', 'D5', '=', 'E5', '=', 'F5', '='),
        ...bar('A5', '=', '=', '=', 'G5', '=', 'F5', 'E5'),
      ],
    },
    {
      ...BAND,
      gain: 0.05,
      notes: [
        ...held('D3/F3/A3'),
        ...held('A2/C#3/E3'),
        ...held('D3/F3/A3'),
        ...held('A2/C#3/G3'),
      ],
    },
    {
      ...BASS,
      gate: 0.6,
      notes: [
        ...bar('D2', 'D2', 'D2', 'D2', 'D2', 'D2', 'D2', 'D2'),
        ...bar('A1', 'A1', 'A1', 'A1', 'A1', 'A1', 'A1', 'A1'),
        ...bar('D2', 'D2', 'D2', 'D2', 'D2', 'D2', 'D2', 'D2'),
        ...bar('A1', 'A1', 'A1', 'A1', 'A1', 'A1', 'A1', 'A1'),
      ],
    },
    {
      wave: 'noise',
      gain: 0.17,
      notes: [
        ...bar('S', '.', 'S', '.', 'S', '.', 'S', 'S'),
        ...bar('S', '.', 'S', '.', 'S', '.', 'S', 'S'),
        ...bar('S', '.', 'S', '.', 'S', '.', 'S', 'S'),
        ...bar('S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'),
      ],
    },
    {
      wave: 'noise',
      gain: 0.32,
      notes: Array.from({ length: 32 }, (_, i) => (i % 2 === 0 ? 'K' : '.')),
    },
  ],
}

/**
 * The end of it, whoever won.
 *
 * Eight bars at sixty, one line over the band, and no drum after the fourth
 * bar -- which is the sound the piece is actually about. It turns to D major
 * in the seventh, which is a device four hundred years old and still the
 * only way music has of saying that something ended without saying it ended
 * well.
 */
export const ARMISTICE: Tune = {
  bpm: 60,
  stepsPerBeat: 2,
  tracks: [
    {
      ...BRASS,
      gain: 0.11,
      filter: { from: 1200, to: 700, q: 1.1 },
      notes: [
        ...bar('A4', '=', '=', '=', 'G4', '=', 'F4', '='),
        ...bar('E4', '=', '=', '=', '=', '=', '=', '.'),
        ...bar('F4', '=', '=', '=', 'G4', '=', 'A4', '='),
        ...bar('A#4', '=', '=', '=', '=', '=', '=', '.'),
        ...bar('A4', '=', '=', '=', 'G4', '=', 'F4', '='),
        ...bar('E4', '=', '=', '=', 'D4', '=', '=', '='),
        ...bar('F#4', '=', '=', '=', 'A4', '=', '=', '='),
        ...bar('D5', '=', '=', '=', '=', '=', '=', '='),
      ],
    },
    {
      ...BAND,
      notes: [
        ...held('D3/F3/A3'),
        ...held('A2/C#3/E3'),
        ...held('D3/F3/A3'),
        ...held('A#2/D3/F3'),
        ...held('D3/F3/A3'),
        ...held('A2/C#3/E3'),
        ...held('D3/F#3/A3'),
        ...held('D3/F#3/A3'),
      ],
    },
    {
      ...BASS,
      gain: 0.2,
      notes: [
        ...pedal('D2'),
        ...pedal('A1'),
        ...pedal('D2'),
        ...pedal('A#1'),
        ...pedal('D2'),
        ...pedal('A1'),
        ...pedal('D2'),
        ...pedal('D2'),
      ],
    },
    {
      // The drum walks out. Four bars of it, then thirty-two rests.
      wave: 'noise',
      gain: 0.22,
      notes: [
        ...bar('K', '.', '.', '.', 'K', '.', '.', '.'),
        ...bar('K', '.', '.', '.', '.', '.', '.', '.'),
        ...bar('K', '.', '.', '.', '.', '.', '.', '.'),
        ...bar('K', '.', '.', '.', '.', '.', '.', '.'),
        ...bar('.', '.', '.', '.', '.', '.', '.', '.'),
        ...bar('.', '.', '.', '.', '.', '.', '.', '.'),
        ...bar('.', '.', '.', '.', '.', '.', '.', '.'),
        ...bar('.', '.', '.', '.', '.', '.', '.', '.'),
      ],
    },
  ],
}
