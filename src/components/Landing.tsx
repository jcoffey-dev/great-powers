import { COLOURS, POWER_NAMES } from './Board'
import { LAST_YEAR } from '../game/game'
import { POWERS, SOLO, type Power } from '../game/map'

/**
 * The page before the map.
 *
 * Diplomacy has a reputation and about half of it is wrong, so it is worth
 * two paragraphs before anybody clicks. The rules are short enough to state
 * completely and strange enough that stating them is a courtesy: there is no
 * luck in this game at all, every unit is the same strength, and the only
 * thing that ever decides anything is who agreed to help.
 *
 * It is also the honest place for the licence. A page that says nothing
 * about where the map came from is a page quietly hoping nobody asks.
 */
export function Landing({
  power,
  onPick,
  onStart,
}: {
  power: Power
  onPick: (p: Power) => void
  onStart: () => void
}) {
  return (
    <div className="landing">
      <header>
        <h1>Great Powers</h1>
        <p className="tagline">
          Europe, 1901. Seven of you, thirty-four supply centres, and no dice.
        </p>
      </header>

      <div className="cols">
        <section>
          <h2>The whole game</h2>
          <p>
            You have armies and fleets. Every spring and every autumn, each of them gets one
            order: hold, move to a neighbouring province, support somebody else's move or hold,
            or — for a fleet at sea — carry an army across.
          </p>
          <p>
            <strong>Every unit is exactly as strong as every other.</strong> One unit cannot push
            another out of a province. Two can. So nothing happens on this board that somebody
            did not agree to help with, and the game is the agreeing.
          </p>
          <p>
            All orders are carried out at once. A move into an occupied province fails unless it
            has more support than the defence; equal strength bounces and both stay put. A unit
            thrown out retreats or is gone.
          </p>
          <p>
            In autumn, whoever is standing on a supply centre owns it. Own more centres than you
            have units and you build over the winter; own fewer and you pay units off.
          </p>
        </section>

        <section>
          <h2>Winning, and stopping</h2>
          <p>
            <strong>{SOLO} of the 34 centres wins outright.</strong> Nobody has ever managed that
            without help, and nobody has ever been helped to it on purpose — which is the whole
            problem, and the whole game.
          </p>
          <p>
            Otherwise it runs to the end of {LAST_YEAR} and the survivors draw. You may ask for
            that draw earlier, but every power still standing has to agree, and a power that
            fancies its chances will say no and tell you why.
          </p>
          <p>
            You may also resign. That is yours alone to decide and nobody votes on it — but your
            power does not leave the board. It holds where it stands and is paid off as it loses
            centres, because eleven abandoned centres are eleven centres somebody has to go and
            take.
          </p>
          <h2>Talking</h2>
          <p>
            The other six will approach you with deals and will answer yours. Nothing anybody
            agrees to is binding. Breaking your word is a legal move, and it is remembered.
          </p>
        </section>
      </div>

      <div className="choose">
        <h2>Take a power</h2>
        <ul>
          {POWERS.map((p) => (
            <li key={p}>
              <button
                type="button"
                className={p === power ? 'on' : ''}
                aria-pressed={p === power}
                onClick={() => onPick(p)}
              >
                <span className="swatch" style={{ background: COLOURS[p] }} />
                {POWER_NAMES[p]}
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className="start" onClick={onStart}>
          Spring 1901
        </button>
      </div>

      <footer>
        <p>
          Great Powers is free software under the{' '}
          <a href="https://www.gnu.org/licenses/agpl-3.0.html">GNU Affero General Public License,
          version 3 or later</a>. It comes with no warranty whatsoever. You may use, study, change
          and share it; if you run a changed version where other people can reach it, they are
          entitled to its source.
        </p>
        <p>
          The map is derived from the standard map of the{' '}
          <a href="https://github.com/diplomacy/diplomacy">diplomacy</a> project, also AGPL, and
          the adjudicator is tested against Lucas Kruijswijk's Diplomacy Adjudicator Test Cases.
          Neither is affiliated with this. See NOTICE.md.
        </p>
        <p>
          This is not the board game, and is not connected to the people who publish it. No
          artwork, text or trademark of theirs is used here: every mark on the screen and every
          note of the music is generated in code in this repository.
        </p>
      </footer>
    </div>
  )
}
