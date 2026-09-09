/**
 * The synth, shared with its siblings.
 *
 * The engine below -- the scheduler, the six voices and the small kit -- is
 * the one written for the lemonade stand and carried through the cave game
 * and the starship. Same author, same licence, and deliberately not forked: a
 * look-ahead scheduler is not the part of a game worth writing four times.
 *
 * What is written *for this game* is everything under "sfx", and the score in
 * `score.ts`. A war needs guns, and the difference between a field gun and a
 * naval gun is most of what makes a map of Europe sound like 1914.
 *
 * Pulse waves for voices, filtered white noise for percussion, and the
 * scheduler so patterns stay in time even when React is busy re-rendering.
 */

const NOTE_INDEX: Record<string, number> = {
  C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5,
  'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11,
}

/** "C#4" -> Hz. A4 = 440. */
export function noteToFreq(note: string): number {
  const m = /^([A-G]#?)(-?\d)$/.exec(note)
  if (!m) return 0
  const semis = NOTE_INDEX[m[1]] + (Number(m[2]) + 1) * 12
  return 440 * Math.pow(2, (semis - 69) / 12)
}

export type Wave = 'pulse12' | 'pulse25' | 'pulse50' | 'triangle' | 'saw' | 'noise'

export interface Track {
  wave: Wave
  gain: number
  /**
   * One entry per step. '.' rest, '=' sustain previous, otherwise a note.
   * Slashes stack notes into a chord: "F4/A4/C5". On a noise track the
   * letter picks the drum: K kick, S snare, C clap, H closed hat, O open hat.
   */
  notes: string[]
  /** Sweeping lowpass, the whole point of a funk bass. */
  filter?: { from: number; to: number; q?: number }
  /** Fraction of the note's length actually sounded; low values are stabs. */
  gate?: number
  /** Cents, for a fatter unison. */
  detune?: number
}

export interface Tune {
  bpm: number
  stepsPerBeat: number
  tracks: Track[]
  /** 0 is straight, ~0.15 is a light funk shuffle. Delays every other step. */
  swing?: number
}

/** Fourier series for a pulse wave of the given duty cycle. */
function pulseWave(ctx: AudioContext, duty: number, harmonics = 24): PeriodicWave {
  const real = new Float32Array(harmonics + 1)
  const imag = new Float32Array(harmonics + 1)
  for (let n = 1; n <= harmonics; n++) {
    imag[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty)
  }
  return ctx.createPeriodicWave(real, imag, { disableNormalization: false })
}

/**
 * The dial-in, as a schedule rather than a number buried in the audio.
 *
 * The boot screen prints what is happening while it happens, so both have to
 * agree about when each stage starts -- and the only way to keep two clocks in
 * step is to have one clock. All values are seconds from the moment of DIAL.
 */

export class Synth {
  private ctx: AudioContext | null = null
  private master!: GainNode
  private musicBus!: GainNode
  private sfxBus!: GainNode
  private waves: Partial<Record<Wave, PeriodicWave>> = {}
  private noiseBuffer!: AudioBuffer

  private tune: Tune | null = null
  private step = 0
  private nextStepTime = 0
  private timer: number | null = null

  musicOn = true
  sfxOn = true

  /** Must be called from a user gesture the first time. */
  ensure(): AudioContext {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume()
      return this.ctx
    }
    const ctx = new AudioContext()
    this.ctx = ctx
    this.master = ctx.createGain()
    this.master.gain.value = 0.5
    this.master.connect(ctx.destination)

    /*
     * The buses open at whatever the toggles already say, not at full.
     * A one-shot calls `ensure` itself, so a game started with the sound
     * turned off would otherwise make exactly one noise -- the first one --
     * before anything got round to muting it.
     */
    this.musicBus = ctx.createGain()
    this.musicBus.gain.value = this.musicOn ? 0.55 : 0
    this.musicBus.connect(this.master)

    this.sfxBus = ctx.createGain()
    this.sfxBus.gain.value = this.sfxOn ? 0.9 : 0
    this.sfxBus.connect(this.master)

    this.waves.pulse12 = pulseWave(ctx, 0.125)
    this.waves.pulse25 = pulseWave(ctx, 0.25)
    this.waves.pulse50 = pulseWave(ctx, 0.5)

    const len = Math.floor(ctx.sampleRate * 1.5)
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    this.noiseBuffer = buf

    return ctx
  }

  setMusic(on: boolean) {
    this.musicOn = on
    if (!this.ctx) return
    this.musicBus.gain.setTargetAtTime(on ? 0.55 : 0, this.ctx.currentTime, 0.05)
  }

  setSfx(on: boolean) {
    this.sfxOn = on
    if (!this.ctx) return
    this.sfxBus.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.02)
  }

  // ---------------------------------------------------------------- voices

  private voice(
    dest: AudioNode,
    wave: Wave,
    freq: number,
    at: number,
    dur: number,
    gain: number,
    opts: { filter?: Track['filter']; detune?: number } = {},
  ) {
    const ctx = this.ensure()
    const osc = ctx.createOscillator()
    if (wave === 'triangle') osc.type = 'triangle'
    else if (wave === 'saw') osc.type = 'sawtooth'
    else osc.setPeriodicWave(this.waves[wave] ?? this.waves.pulse50!)
    osc.frequency.setValueAtTime(freq, at)
    if (opts.detune) osc.detune.setValueAtTime(opts.detune, at)

    const env = ctx.createGain()
    const peak = Math.max(0.0001, gain)
    env.gain.setValueAtTime(0.0001, at)
    env.gain.exponentialRampToValueAtTime(peak, at + 0.008)
    env.gain.setValueAtTime(peak, at + Math.max(0.02, dur * 0.6))
    env.gain.exponentialRampToValueAtTime(0.0001, at + dur)

    let node: AudioNode = osc
    if (opts.filter) {
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.Q.value = opts.filter.q ?? 6
      lp.frequency.setValueAtTime(opts.filter.from, at)
      lp.frequency.exponentialRampToValueAtTime(
        Math.max(60, opts.filter.to),
        at + Math.max(0.05, dur),
      )
      osc.connect(lp)
      node = lp
    }

    node.connect(env).connect(dest)
    osc.start(at)
    osc.stop(at + dur + 0.02)
  }

  /** A small kit: pitched-sine kick, noise-and-tone snare, clap, two hats. */
  private drum(dest: AudioNode, kind: string, at: number, gain: number) {
    const ctx = this.ensure()

    if (kind === 'K') {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(130, at)
      osc.frequency.exponentialRampToValueAtTime(42, at + 0.11)
      const env = ctx.createGain()
      env.gain.setValueAtTime(gain * 1.5, at)
      env.gain.exponentialRampToValueAtTime(0.0001, at + 0.24)
      osc.connect(env).connect(dest)
      osc.start(at)
      osc.stop(at + 0.26)
      return
    }

    const noise = ctx.createBufferSource()
    noise.buffer = this.noiseBuffer
    const filter = ctx.createBiquadFilter()
    const env = ctx.createGain()
    let dur = 0.05

    if (kind === 'S' || kind === 'C') {
      filter.type = 'bandpass'
      filter.frequency.value = kind === 'S' ? 1900 : 1300
      filter.Q.value = kind === 'S' ? 0.9 : 2.4
      dur = kind === 'S' ? 0.16 : 0.1
      if (kind === 'S') {
        // A little body under the crack.
        const tone = ctx.createOscillator()
        tone.type = 'triangle'
        tone.frequency.setValueAtTime(210, at)
        tone.frequency.exponentialRampToValueAtTime(150, at + 0.09)
        const tenv = ctx.createGain()
        tenv.gain.setValueAtTime(gain * 0.6, at)
        tenv.gain.exponentialRampToValueAtTime(0.0001, at + 0.1)
        tone.connect(tenv).connect(dest)
        tone.start(at)
        tone.stop(at + 0.12)
      }
    } else {
      filter.type = 'highpass'
      filter.frequency.value = 7200
      dur = kind === 'O' ? 0.22 : 0.035
    }

    env.gain.setValueAtTime(gain, at)
    env.gain.exponentialRampToValueAtTime(0.0001, at + dur)
    noise.connect(filter).connect(env).connect(dest)
    noise.start(at)
    noise.stop(at + dur + 0.02)
  }

  // ------------------------------------------------------------- sequencer

  playTune(tune: Tune, restart = true) {
    this.ensure()
    if (this.tune === tune && this.timer !== null && !restart) return
    this.stopTune()
    this.tune = tune
    this.step = 0
    this.nextStepTime = this.ctx!.currentTime + 0.08
    this.timer = window.setInterval(() => this.schedule(), 25)
  }

  stopTune() {
    if (this.timer !== null) window.clearInterval(this.timer)
    this.timer = null
    this.tune = null
  }

  get playing() {
    return this.timer !== null
  }

  private schedule() {
    const ctx = this.ctx
    const tune = this.tune
    if (!ctx || !tune) return
    const stepDur = 60 / tune.bpm / tune.stepsPerBeat
    const length = Math.max(...tune.tracks.map((t) => t.notes.length))
    const swing = tune.swing ?? 0

    while (this.nextStepTime < ctx.currentTime + 0.2) {
      // A shuffle pushes every other step late without moving the downbeats.
      const at = this.nextStepTime + (this.step % 2 === 1 ? swing * stepDur : 0)

      for (const track of tune.tracks) {
        const note = track.notes[this.step % track.notes.length]
        if (!note || note === '.' || note === '=') continue

        // A note runs until the next step that is not a sustain marker.
        let held = 1
        for (let i = 1; i < length; i++) {
          if (track.notes[(this.step + i) % track.notes.length] === '=') held++
          else break
        }
        const dur = held * stepDur * (track.gate ?? 0.95)

        if (track.wave === 'noise') {
          this.drum(this.musicBus, note, at, track.gain)
          continue
        }

        for (const part of note.split('/')) {
          const f = noteToFreq(part)
          if (!f) continue
          this.voice(this.musicBus, track.wave, f, at, dur, track.gain, {
            filter: track.filter,
            detune: track.detune,
          })
        }
      }
      this.nextStepTime += stepDur
      this.step = (this.step + 1) % length
    }
  }

  // ------------------------------------------------------------------ sfx

  private seq(notes: [string, number][], wave: Wave = 'pulse25', gain = 0.22) {
    const ctx = this.ensure()
    let t = ctx.currentTime + 0.01
    for (const [note, dur] of notes) {
      if (note !== '.') this.voice(this.sfxBus, wave, noteToFreq(note), t, dur, gain)
      t += dur
    }
  }

  /** A click on the map. Small, dry, and not a musical note. */
  tap() {
    const ctx = this.ensure()
    const at = ctx.currentTime + 0.01
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuffer
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 2600
    bp.Q.value = 1.4
    const env = ctx.createGain()
    env.gain.setValueAtTime(0.1, at)
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.035)
    src.connect(bp).connect(env).connect(this.sfxBus)
    src.start(at)
    src.stop(at + 0.05)
  }

  /** An order written down. Pencil on a map board. */
  written() {
    this.seq([['B4', 0.045], ['E5', 0.08]], 'triangle', 0.14)
  }

  /** An order the rules will not take. */
  reject() {
    this.seq([['A3', 0.09], ['D#3', 0.18]], 'saw', 0.16)
  }

  /**
   * The field telegraph, for the press.
   *
   * Not Morse -- a rhythm that only *reads* as Morse, because a real letter
   * would say something and somebody would eventually read it. A carrier tone
   * gated into short and long, which is the whole sound of a key being worked.
   */
  telegraph(long = false) {
    const ctx = this.ensure()
    const at = ctx.currentTime + 0.01
    const pattern = long ? [0.06, 0.14, 0.06, 0.06] : [0.06, 0.06, 0.14]
    let t = at
    for (const len of pattern) {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = 720
      const env = ctx.createGain()
      env.gain.setValueAtTime(0.0001, t)
      env.gain.exponentialRampToValueAtTime(0.075, t + 0.006)
      env.gain.setValueAtTime(0.075, t + len - 0.01)
      env.gain.exponentialRampToValueAtTime(0.0001, t + len)
      osc.connect(env).connect(this.sfxBus)
      osc.start(t)
      osc.stop(t + len + 0.02)
      t += len + 0.05
    }
  }

  // -------------------------------------------------------------- the war

  /**
   * A field gun, and the shell landing.
   *
   * The two halves are the sound: a crack with almost no body, then a
   * lowpassed thump a beat later with plenty. Artillery at a distance is
   * mostly the second one, so the first is kept quiet and quick -- turn it up
   * and the whole thing collapses into a drum.
   */
  private gun(at: number, gain: number, pitch: number) {
    const ctx = this.ensure()

    const crack = ctx.createBufferSource()
    crack.buffer = this.noiseBuffer
    crack.playbackRate.value = 1.2
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 1100
    const cenv = ctx.createGain()
    cenv.gain.setValueAtTime(gain * 0.5, at)
    cenv.gain.exponentialRampToValueAtTime(0.0001, at + 0.09)
    crack.connect(hp).connect(cenv).connect(this.sfxBus)
    crack.start(at)
    crack.stop(at + 0.11)

    const body = ctx.createBufferSource()
    body.buffer = this.noiseBuffer
    body.playbackRate.value = 0.45
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.Q.value = 1.2
    lp.frequency.setValueAtTime(900, at + 0.02)
    lp.frequency.exponentialRampToValueAtTime(110, at + 0.5)
    const benv = ctx.createGain()
    benv.gain.setValueAtTime(0.0001, at + 0.02)
    benv.gain.exponentialRampToValueAtTime(gain, at + 0.05)
    benv.gain.exponentialRampToValueAtTime(0.0001, at + 0.55)
    body.connect(lp).connect(benv).connect(this.sfxBus)
    body.start(at + 0.02)
    body.stop(at + 0.6)

    const boom = ctx.createOscillator()
    boom.type = 'sine'
    boom.frequency.setValueAtTime(pitch, at + 0.03)
    boom.frequency.exponentialRampToValueAtTime(pitch * 0.35, at + 0.4)
    const oenv = ctx.createGain()
    oenv.gain.setValueAtTime(gain * 0.8, at + 0.03)
    oenv.gain.exponentialRampToValueAtTime(0.0001, at + 0.45)
    boom.connect(oenv).connect(this.sfxBus)
    boom.start(at + 0.03)
    boom.stop(at + 0.5)
  }

  /**
   * A province changing hands on land.
   *
   * Five guns at uneven spacing, because a barrage that keeps time is a
   * drum machine. The offsets are fixed rather than random so the sound is
   * the same every turn -- a battle that sounds different each time reads as
   * a glitch, not as variety.
   */
  ground() {
    const ctx = this.ensure()
    const at = ctx.currentTime + 0.01
    for (const [i, offset] of [0, 0.13, 0.19, 0.36, 0.47].entries()) {
      this.gun(at + offset, 0.22 - i * 0.02, 90 - i * 6)
    }

    // Rifle fire under it: noise chopped fast enough to lose its pitch.
    for (let i = 0; i < 14; i++) {
      const t = at + 0.08 + i * 0.043
      const src = ctx.createBufferSource()
      src.buffer = this.noiseBuffer
      src.playbackRate.value = 2
      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = 2200
      bp.Q.value = 0.8
      const env = ctx.createGain()
      env.gain.setValueAtTime(0.05, t)
      env.gain.exponentialRampToValueAtTime(0.0001, t + 0.03)
      src.connect(bp).connect(env).connect(this.sfxBus)
      src.start(t)
      src.stop(t + 0.04)
    }
  }

  /**
   * A fight at sea.
   *
   * The same guns, bigger and slower, and no rifles -- there is nobody
   * within a mile to fire one. What replaces them is the sea: filtered noise
   * held under the whole thing, which is what keeps this from being the land
   * battle at a lower pitch.
   */
  naval() {
    const ctx = this.ensure()
    const at = ctx.currentTime + 0.01

    const swell = ctx.createBufferSource()
    swell.buffer = this.noiseBuffer
    swell.loop = true
    swell.playbackRate.value = 0.3
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 420
    lp.Q.value = 0.7
    const senv = ctx.createGain()
    senv.gain.setValueAtTime(0.0001, at)
    senv.gain.exponentialRampToValueAtTime(0.12, at + 0.3)
    senv.gain.setValueAtTime(0.12, at + 0.9)
    senv.gain.exponentialRampToValueAtTime(0.0001, at + 1.5)
    swell.connect(lp).connect(senv).connect(this.sfxBus)
    swell.start(at)
    swell.stop(at + 1.55)

    // A salvo is several barrels at once, which is why they land together.
    for (const offset of [0.05, 0.09, 0.13, 0.55, 0.6, 0.66]) {
      this.gun(at + offset, 0.2, 62)
    }
  }

  /**
   * An escort seeing a convoy across.
   *
   * A steam whistle answered by a second one further off, over the engine.
   * This is the one battle sound in the game that is not a battle: a convoy
   * that gets through is a quiet crossing, and it should sound like relief.
   */
  escort() {
    const ctx = this.ensure()
    const at = ctx.currentTime + 0.01

    for (const [i, f] of [330, 246].entries()) {
      const t = at + i * 0.34
      // A whistle is two close pitches beating against each other.
      for (const detune of [-14, 12]) {
        const osc = ctx.createOscillator()
        osc.type = 'sawtooth'
        osc.frequency.value = f
        osc.detune.value = detune
        const lp = ctx.createBiquadFilter()
        lp.type = 'lowpass'
        lp.frequency.value = 1300
        const env = ctx.createGain()
        env.gain.setValueAtTime(0.0001, t)
        env.gain.exponentialRampToValueAtTime(0.08 - i * 0.03, t + 0.08)
        env.gain.setValueAtTime(0.08 - i * 0.03, t + 0.3)
        env.gain.exponentialRampToValueAtTime(0.0001, t + 0.55)
        osc.connect(lp).connect(env).connect(this.sfxBus)
        osc.start(t)
        osc.stop(t + 0.6)
      }
    }

    const engine = ctx.createBufferSource()
    engine.buffer = this.noiseBuffer
    engine.playbackRate.value = 0.25
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 260
    const env = ctx.createGain()
    env.gain.setValueAtTime(0.0001, at)
    env.gain.exponentialRampToValueAtTime(0.09, at + 0.2)
    env.gain.exponentialRampToValueAtTime(0.0001, at + 1.1)
    engine.connect(lp).connect(env).connect(this.sfxBus)
    engine.start(at)
    engine.stop(at + 1.2)
  }

  /**
   * Falling back.
   *
   * A bugle call down rather than up, and a drum walking away behind it.
   * The interval matters: the same three notes rising would be a charge, and
   * that is the entire difference between the two sounds.
   */
  retreat() {
    this.seq([['G4', 0.16], ['E4', 0.16], ['C4', 0.36]], 'saw', 0.13)
    const ctx = this.ensure()
    const at = ctx.currentTime + 0.02
    for (const [i, offset] of [0, 0.3, 0.6, 0.9].entries()) {
      this.drum(this.sfxBus, 'K', at + offset, 0.28 - i * 0.05)
    }
  }

  /** A unit lost for good: no bugle, just the drum stopping. */
  disband() {
    const ctx = this.ensure()
    const at = ctx.currentTime + 0.01
    this.drum(this.sfxBus, 'K', at, 0.3)
    this.seq([['C4', 0.18], ['B3', 0.5]], 'triangle', 0.12)
  }

  /**
   * A unit raised over the winter.
   *
   * A yard, not a battle: rivets, then the ship or the column moving off.
   * Three hammer blows on metal and a rising tone under them.
   */
  build() {
    const ctx = this.ensure()
    const at = ctx.currentTime + 0.01

    for (const [i, offset] of [0, 0.16, 0.32].entries()) {
      const t = at + offset
      const src = ctx.createBufferSource()
      src.buffer = this.noiseBuffer
      src.playbackRate.value = 1.6
      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = 3200 + i * 400
      bp.Q.value = 6
      const env = ctx.createGain()
      env.gain.setValueAtTime(0.14, t)
      env.gain.exponentialRampToValueAtTime(0.0001, t + 0.16)
      src.connect(bp).connect(env).connect(this.sfxBus)
      src.start(t)
      src.stop(t + 0.18)
    }

    const rise = ctx.createOscillator()
    rise.type = 'triangle'
    rise.frequency.setValueAtTime(98, at + 0.3)
    rise.frequency.exponentialRampToValueAtTime(196, at + 0.85)
    const env = ctx.createGain()
    env.gain.setValueAtTime(0.0001, at + 0.3)
    env.gain.exponentialRampToValueAtTime(0.14, at + 0.45)
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.95)
    rise.connect(env).connect(this.sfxBus)
    rise.start(at + 0.3)
    rise.stop(at + 1)
  }

  // ---------------------------------------------------------- the endings

  /**
   * Eighteen centres.
   *
   * Bells, and the guns firing with nothing to hit. A victory in 1918 was
   * church bells before it was anything else, and this is the only sound in
   * the game allowed to be straightforwardly happy.
   */
  victory() {
    const ctx = this.ensure()
    const at = ctx.currentTime + 0.01
    for (const [i, note] of ['D5', 'A4', 'F#4', 'D4', 'A4', 'D5'].entries()) {
      const t = at + i * 0.42
      const f = noteToFreq(note)
      // A bell is a struck partial well above the note, decaying fast.
      for (const [mult, gain, dur] of [
        [1, 0.13, 2.6],
        [2.76, 0.05, 1.1],
        [5.4, 0.025, 0.5],
      ] as const) {
        const osc = ctx.createOscillator()
        osc.type = 'sine'
        osc.frequency.value = f * mult
        const env = ctx.createGain()
        env.gain.setValueAtTime(0.0001, t)
        env.gain.exponentialRampToValueAtTime(gain, t + 0.01)
        env.gain.exponentialRampToValueAtTime(0.0001, t + dur)
        osc.connect(env).connect(this.sfxBus)
        osc.start(t)
        osc.stop(t + dur + 0.05)
      }
    }
    for (const offset of [0.6, 1.4, 2.1]) this.gun(at + offset, 0.12, 80)
  }

  /**
   * Somebody else's eighteen.
   *
   * The same bells, in a minor key, ringing for a capital that is not yours.
   * Reusing the victory sound rather than writing a second one is the point:
   * a solo sounds the same from the outside, and you only find out which one
   * it was by looking at the board.
   */
  defeat() {
    const ctx = this.ensure()
    const at = ctx.currentTime + 0.01
    for (const [i, note] of ['D4', 'F4', 'A3', 'D3'].entries()) {
      const t = at + i * 0.5
      const f = noteToFreq(note)
      for (const [mult, gain, dur] of [
        [1, 0.13, 3],
        [2.76, 0.04, 1.2],
      ] as const) {
        const osc = ctx.createOscillator()
        osc.type = 'sine'
        osc.frequency.value = f * mult
        const env = ctx.createGain()
        env.gain.setValueAtTime(0.0001, t)
        env.gain.exponentialRampToValueAtTime(gain, t + 0.01)
        env.gain.exponentialRampToValueAtTime(0.0001, t + dur)
        osc.connect(env).connect(this.sfxBus)
        osc.start(t)
        osc.stop(t + dur + 0.05)
      }
    }
  }

  /** Your last centre. A single low bell and nothing after it. */
  eliminated() {
    const ctx = this.ensure()
    const at = ctx.currentTime + 0.01
    for (const [mult, gain, dur] of [
      [1, 0.16, 4],
      [2.76, 0.05, 1.6],
    ] as const) {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = noteToFreq('D2') * mult
      const env = ctx.createGain()
      env.gain.setValueAtTime(0.0001, at)
      env.gain.exponentialRampToValueAtTime(gain, at + 0.01)
      env.gain.exponentialRampToValueAtTime(0.0001, at + dur)
      osc.connect(env).connect(this.sfxBus)
      osc.start(at)
      osc.stop(at + dur + 0.05)
    }
  }

  /**
   * The armistice.
   *
   * A draw is not a defeat and it is certainly not a victory, so it gets the
   * one thing neither of those has: the guns stopping. A last salvo, and
   * then a chord that resolves and simply stays there.
   */
  armistice() {
    const ctx = this.ensure()
    const at = ctx.currentTime + 0.01
    this.gun(at, 0.18, 70)
    for (const note of ['D3', 'A3', 'D4', 'F#4']) {
      const osc = ctx.createOscillator()
      osc.type = 'triangle'
      osc.frequency.value = noteToFreq(note)
      const env = ctx.createGain()
      env.gain.setValueAtTime(0.0001, at + 0.8)
      env.gain.exponentialRampToValueAtTime(0.07, at + 1.4)
      env.gain.setValueAtTime(0.07, at + 3)
      env.gain.exponentialRampToValueAtTime(0.0001, at + 4.5)
      osc.connect(env).connect(this.sfxBus)
      osc.start(at + 0.8)
      osc.stop(at + 4.6)
    }
  }
}

export const synth = new Synth()
