# Notice, credits and provenance

## What this is

An independent reimplementation of the classic seven-power negotiation game,
written from scratch in TypeScript in 2026: one human against six computer
powers, in one sitting.

## The name

It is not called what you expect, and that is deliberate. The rules of a game
are ideas rather than expression and nobody gets to fence them off, so they
are rebuilt here freely. The **name** is a live trademark belonging to a
company that enforces it, and this ships on a public site with somebody's name
on the footer. So the mechanics are exact and the vocabulary is ours. "Great
Powers" is what those seven were called at the time.

None of that is a copyright question. Game mechanics are ideas; names are a
trademark question, which is about whether a reader would think this came from
them. Calling it *Great Powers* answers that, and costs the game nothing.

## The board

**The geometry of the map is not ours.** The province outlines, the
coordinates where units stand and the shape of every coastline come from the
standard map published with the **diplomacy** engine:

- <https://github.com/diplomacy/diplomacy> — AGPL-3.0-or-later

That is the same licence this project uses, so it is carried across whole
rather than approximated. `tools/map.py` extracts it into `src/game/board.json`
and can be re-run against a newer copy at any time. What comes across is
outlines and coordinates. Every colour, every mark drawn on top, and every
decision about what the map should say is this project's.

Worth writing down why, because three earlier attempts did it the hard way and
all three were worse. Dividing the plane by nearest province gives a tidy
board that looks nothing like Europe. Drawing the adjacency graph gives
something unimpeachable about the rules that is not a map at all -- circles
joined by lines. Placing fifty-six polygons by eye gives fifty-six islands.
Drawing Europe accurately is real work, somebody did it properly, and they
published it under a licence that invites exactly this.

The **adjacency rules** in `src/game/map.ts` are ours, typed out and then
checked against themselves -- symmetry, counts, and the separation of the
army and fleet graphs. A topology is a fact about a published game; it is the
same list every implementation has used since 1959.

## The test cases

`src/game/datc.json` is derived from the **Diplomacy Adjudicator Test Cases**,
which is what the hobby settled on as the specification for a correct
adjudicator:

- Lucas B. Kruijswijk, *Diplomacy Adjudicator Test Cases*, version 3.3

Only the machine-readable half is carried across -- the case numbers, the
orders, and the outcome each order is annotated with. The document's
explanatory prose is Kruijswijk's writing and stays where it is.
`tools/datc.py` does the extraction.

## What is ours

Everything else: the adjudicator and its paradox resolver, the retreat and
adjustment phases, the press, the trust ledger, the bots and their reasoning,
the interface, and every word on screen.

## Licence

Copyright (C) 2026 John Coffey.

This program is free software: you can redistribute it and/or modify it under
the terms of the **GNU Affero General Public License** as published by the
Free Software Foundation, either version 3 of the License, or (at your option)
any later version — see [LICENSE](LICENSE).

AGPL rather than plain GPL because the leaderboard is a network service: §13
means anyone who runs a modified copy of this for other people over a network
has to offer them its source. It is also the licence the map arrives under,
which is what makes carrying it across straightforward rather than a question.

This program is distributed in the hope that it will be useful, but WITHOUT ANY
WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A
PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

*None of the above is legal advice.*
