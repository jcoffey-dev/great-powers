#!/usr/bin/env python3
"""
Pull the board out of the standard map published with the diplomacy engine.

    python3 tools/map.py path/to/standard.svg > src/game/board.json

The source is https://github.com/diplomacy/diplomacy, which is AGPL-3.0 --
the same licence this project uses -- so the geometry can be carried across
whole, with attribution. See NOTICE.md.

What comes across is data and nothing else: for each province, the outline as
an SVG path, where a unit stands, and where the name goes. The colours, the
styling and every mark this game puts on top of it are ours.
"""
import json
import pathlib
import re
import sys


# This map names five seas differently and carries one province we do not
# have: Switzerland, which is impassable and therefore not a province at all.
ALIASES = {'gol': 'lyo', 'mid': 'mao', 'nat': 'nao', 'nrg': 'nwg', 'tyn': 'tys'}
SKIP = {'swi'}


def rename(name: str) -> str:
    """Their names for ours: aliases, and a coast written with a slash."""
    head, _, coast = name.partition('-')
    head = ALIASES.get(head, head)
    return f'{head}/{coast}' if coast else head


def main() -> int:
    svg = pathlib.Path(sys.argv[1]).read_text()

    box = re.search(r'viewBox="([\d.\s-]+)"', svg)
    vb = [float(v) for v in box.group(1).split()] if box else [0, 0, 1835, 1360]

    # Outlines. Every province is a <path id="xxx" d="..."> in the map layer.
    shapes = {}
    for m in re.finditer(r'<path\b[^>]*\bid="([a-z]{3}(?:/[a-z]{2})?)"[^>]*\bd="([^"]+)"', svg):
        name = rename(m.group(1))
        if name in SKIP:
            continue
        shapes[name] = ' '.join(m.group(2).split())

    # Denmark has islands and Constantinople sits on both sides of the
    # straits, so those two are groups of paths rather than one path each.
    for m in re.finditer(r'<g[^>]*\bid="([a-z]{3})"[^>]*>(.*?)</g>', svg, re.S):
        name = rename(m.group(1))
        if name in SKIP:
            continue
        parts = [' '.join(d.split()) for d in re.findall(r'\bd="([^"]+)"', m.group(2))]
        if parts:
            shapes[name] = ' '.join(parts)

    # Where a unit stands, from the jdip province metadata.
    units = {}
    for m in re.finditer(
        r'<jdipNS:PROVINCE\s+name="([^"]+)"\s*>(.*?)</jdipNS:PROVINCE>', svg, re.S
    ):
        u = re.search(r'<jdipNS:UNIT\s+x="([\d.]+)"\s+y="([\d.]+)"', m.group(2))
        name = rename(m.group(1))
        if u and name not in SKIP:
            units[name] = [float(u.group(1)), float(u.group(2))]

    # Where the name goes, from the brief label layer.
    labels = {}
    layer = re.search(r'<g[^>]*id="BriefLabelLayer".*?</g>', svg, re.S)
    if layer:
        for m in re.finditer(
            r'<text[^>]*\bx="([\d.-]+)"[^>]*\by="([\d.-]+)"[^>]*>([^<]+)</text>', layer.group(0)
        ):
            labels[m.group(3).strip().lower()] = [float(m.group(1)), float(m.group(2))]

    # The outlines live in a layer that is shifted; the unit coordinates are
    # not. Carrying the transform across rather than baking it into the paths
    # keeps this a faithful copy of what was published.
    layer = re.search(r'<g[^>]*id="MapLayer"[^>]*transform="translate\(\s*(-?[\d.]+)[\s,]+(-?[\d.]+)\s*\)"', svg)
    shift = [float(layer.group(1)), float(layer.group(2))] if layer else [0.0, 0.0]

    out = {
        'shift': shift,
        'source': 'https://github.com/diplomacy/diplomacy (AGPL-3.0)',
        'viewBox': vb,
        'shapes': shapes,
        'units': units,
        'labels': labels,
    }
    print(f'{len(shapes)} outlines, {len(units)} unit spots, {len(labels)} labels', file=sys.stderr)
    json.dump(out, sys.stdout, separators=(',', ':'))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
