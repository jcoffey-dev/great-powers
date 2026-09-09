import { POWERS, SOLO, type Power } from './map'
import { centreCount, type Ownership } from './turn'

/**
 * Giving up, and the two different things people mean by it.
 *
 * A game of Diplomacy that is lost can take another five years to finish
 * losing, and every online version of the game has had to answer this. The
 * hobby settled on two answers and they are not the same:
 *
 *   - **Resigning** is unilateral. You stop playing your power and nobody
 *     gets a say, because nobody is entitled to your attention. The power
 *     itself does not leave the board -- it goes into civil disorder, holds
 *     everything and pays units off as it loses centres, which is precisely
 *     what the rules already say happens to an absent player. That matters
 *     to everyone else: a resigned Austria is still eleven centres somebody
 *     has to take, and letting it evaporate would hand the game to whoever
 *     happened to be next to it.
 *
 *   - **A draw** is not unilateral, and this is the part that makes it
 *     Diplomacy rather than a menu. Every surviving power votes, and one
 *     refusal is enough. A power that still believes it can win will refuse,
 *     and it should -- being able to end the game by asking would be worth
 *     more than any alliance in it.
 *
 * The votes are decided on the position, not on politeness, and each comes
 * back with its reason so a refusal can be argued with next year.
 */

export interface Verdict {
  power: Power
  agree: boolean
  why: string
}

/** Within this of the lead and a power still fancies its chances. */
export const IN_THE_HUNT = 2

const name = (p: Power) => p[0]!.toUpperCase() + p.slice(1)

/** The largest centre count on the board. */
export const lead = (own: Ownership): number =>
  Math.max(...POWERS.map((p) => centreCount(own, p)))

/**
 * Would this power accept a draw?
 *
 * It refuses while it leads or is within a couple of centres of leading,
 * because that power is still playing to win and a draw would take that
 * away. Everybody else has more to gain from ending level than from being
 * ground down over another eight years, and says so.
 */
export function onDraw(own: Ownership, power: Power): Verdict {
  const mine = centreCount(own, power)
  const top = lead(own)

  if (mine === 0) {
    return { power, agree: true, why: `${name(power)} has nothing left to draw with.` }
  }
  if (mine >= top) {
    return { power, agree: false, why: `${name(power)} leads with ${mine} and wants the solo.` }
  }
  if (top - mine <= IN_THE_HUNT) {
    return {
      power,
      agree: false,
      why: `${name(power)} is ${top - mine} behind and thinks that is catchable.`,
    }
  }
  return {
    power,
    agree: true,
    why: `${name(power)} is ${top - mine} behind and would rather share it.`,
  }
}

/**
 * Would this power let the leader simply be given the game?
 *
 * Far harder than a draw, and it should be. A concession hands somebody the
 * solo, so a power only agrees when that solo was coming anyway -- and the
 * measure of "anyway" is that the leader is most of the way to eighteen and
 * further ahead than anyone can close. Otherwise refusing costs nothing but
 * time, and time is the only thing the losing side has.
 */
export function onConcession(own: Ownership, power: Power, to: Power): Verdict {
  const theirs = centreCount(own, to)
  const mine = centreCount(own, power)

  if (power === to) {
    return { power, agree: true, why: `${name(power)} will take it.` }
  }
  if (theirs < SOLO - 4) {
    return {
      power,
      agree: false,
      why: `${name(power)} says ${theirs} is not eighteen yet.`,
    }
  }
  if (mine === 0) {
    return { power, agree: true, why: `${name(power)} has no say left.` }
  }
  if (theirs - mine <= IN_THE_HUNT) {
    return {
      power,
      agree: false,
      why: `${name(power)} is close enough to stop it.`,
    }
  }
  return { power, agree: true, why: `${name(power)} cannot stop it and says so.` }
}

/** A vote is carried only if nobody still standing refuses. */
export const carried = (verdicts: readonly Verdict[]): boolean => verdicts.every((v) => v.agree)
