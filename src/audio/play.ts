import type { Cue, Ending } from '../game/sound'
import { synth } from './synth'

/**
 * Cues to actual noise, spaced out.
 *
 * A turn's sounds all land at once if you let them, and three of them at once
 * is one indistinct crash. So each gets its own moment. The gaps are the
 * lengths of the sounds themselves, near enough -- the guns run about a
 * second, and the escort a little longer.
 */
const GAP = 900

export function playCues(cues: readonly Cue[]) {
  if (!synth.sfxOn) return
  for (const [i, cue] of cues.entries()) {
    window.setTimeout(() => {
      if (!synth.sfxOn) return
      if (cue === 'ground') synth.ground()
      else if (cue === 'naval') synth.naval()
      else if (cue === 'escort') synth.escort()
      else if (cue === 'retreat') synth.retreat()
      else if (cue === 'disband') synth.disband()
      else synth.build()
    }, i * GAP)
  }
}

export function playEnding(ending: Ending) {
  if (!synth.sfxOn) return
  if (ending === 'victory') synth.victory()
  else if (ending === 'defeat') synth.defeat()
  else if (ending === 'eliminated') synth.eliminated()
  else synth.armistice()
}
