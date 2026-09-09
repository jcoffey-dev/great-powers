#!/usr/bin/env python3
"""
Turn the published Diplomacy Adjudicator Test Cases into a fixture.

    python3 tools/datc.py path/to/datc.html > src/game/datc.json

Only the machine-readable half is taken across: the case number, its title,
the orders, and the outcome each order is annotated with. The document's
explanatory prose is Lucas Kruijswijk's writing and stays where it is -- see
NOTICE.md. What lands here are the cases themselves, which are the thing an
adjudicator is measured against.
"""
import html
import json
import re
import sys
import pathlib

POWERS = ['austria', 'england', 'france', 'germany', 'italy', 'russia', 'turkey']
ANNOTATIONS = [
    'succeeds', 'fails', 'illegal', 'dislodged', 'given', 'invalid',
    'available', 'cut', 'disrupted', 'no convoy', 'bounce',
    'destroyed', 'stands',
]


def province_names(map_ts: pathlib.Path) -> dict[str, str]:
    """id -> full name, read straight out of the board so they cannot drift."""
    out = {}
    for m in re.finditer(r"^\s+([a-z]{3}): P\('([^']+)'", map_ts.read_text(), re.M):
        out[m.group(2)] = m.group(1)
    return out


def to_text(raw: str) -> list[str]:
    t = re.sub(r'<(script|style)[^>]*>.*?</\1>', '', raw, flags=re.S | re.I)
    t = re.sub(r'<br\s*/?>', '\n', t, flags=re.I)
    t = re.sub(r'</(p|div|li|h[1-6]|tr)>', '\n', t, flags=re.I)
    t = re.sub(r'<[^>]+>', '', t)
    return [l.rstrip() for l in html.unescape(t).split('\n')]


def norm(name: str) -> str:
    return re.sub(r'\s+', ' ', name.replace('.', '').strip()).lower()


def main() -> int:
    doc = pathlib.Path(sys.argv[1])
    names = province_names(pathlib.Path(__file__).parent.parent / 'src/game/map.ts')
    lookup = {norm(n): i for n, i in names.items()}

    def place(text: str) -> str:
        """'Spain(nc)' -> 'spa/nc'. Unknown names raise rather than guess."""
        text = text.strip()
        coast = None
        m = re.match(r'^(.*?)\s*\((nc|sc|ec|wc)\)$', text)
        if m:
            text, coast = m.group(1), m.group(2)
        pid = lookup.get(norm(text))
        if pid is None:
            raise KeyError(text)
        return f'{pid}/{coast}' if coast else pid

    lines = to_text(doc.read_text(encoding='utf-8', errors='replace'))
    heads = [(k, l) for k, l in enumerate(lines)
             if re.match(r'\s*6\.[A-Z]\.\d+\.\s+TEST CASE', l)]

    cases, unknown = [], set()
    for idx, (start, head) in enumerate(heads):
        end = heads[idx + 1][0] if idx + 1 < len(heads) else len(lines)
        m = re.match(r'\s*(6\.[A-Z]\.\d+)\.\s+TEST CASE,\s*(.*)', head)
        case = {'id': m.group(1), 'title': m.group(2).strip().lower(),
                'units': [], 'orders': [], 'expect': {},
                'retreats': [], 'expectRetreat': {},
                'adjust': [], 'expectAdjust': {}, 'own': {}}

        power = None
        ok = True
        # Cases in section H run a movement phase and then a retreat phase.
        phase = 'move'
        for line in lines[start + 1:end]:
            s = line.strip()
            if not s:
                continue
            if s.upper() == 'RETREATS':
                phase = 'retreat'
                continue

            p = s.rstrip(':').strip().lower()
            if s.endswith(':') and p in POWERS:
                power = p
                continue

            # "Germany owns SC Kiel" / "Germany owns A Prussia": the winter
            # cases state the position this way rather than by ordering it.
            if m3 := re.match(r'^(\w+)\s+owns\s+(SC|A|F)\s+(.*?)\s*$', s, re.I):
                who = m3.group(1).lower()
                if who not in POWERS:
                    continue
                try:
                    where = place(m3.group(3))
                except KeyError as e:
                    unknown.add(str(e)); ok = False; break
                if m3.group(2).upper() == 'SC':
                    case['own'][where.split('/')[0]] = who
                else:
                    kind = 'army' if m3.group(2).upper() == 'A' else 'fleet'
                    case['units'].append({'power': who, 'type': kind, 'at': where})
                    case['own'].setdefault(where.split('/')[0], who) if False else None
                continue

            # "Build A Kiel" / "Disband F Gulf of Lyon" / "Remove A Paris".
            if m3 := re.match(r'^(Build|Disband|Remove|Automatic disband)\s+([AF])\s+(.*?)\s*$', s, re.I):
                body, marks = m3.group(3), []
                while True:
                    m4 = re.search(r',?\s*(' + '|'.join(ANNOTATIONS) + r')\s*$', body, re.I)
                    if not m4:
                        break
                    marks.insert(0, m4.group(1).lower())
                    body = body[:m4.start()].rstrip()
                try:
                    where = place(body)
                except KeyError as e:
                    unknown.add(str(e)); ok = False; break
                kind = 'army' if m3.group(2).upper() == 'A' else 'fleet'
                verb = m3.group(1).lower()
                case['adjust'].append({
                    'type': 'build' if verb == 'build'
                    else 'auto' if verb == 'automatic disband' else 'disband',
                    'at': where, 'unit': kind, 'power': power,
                })
                if marks:
                    case['expectAdjust'][where.split('/')[0]] = marks
                continue

            if not re.match(r'^[AF]\s', s) or power is None:
                continue

            body, marks = s, []
            while True:
                m2 = re.search(r',?\s*(' + '|'.join(ANNOTATIONS) + r')\s*$', body, re.I)
                if not m2:
                    break
                marks.insert(0, m2.group(1).lower())
                body = body[:m2.start()].rstrip()

            try:
                unit_type = 'army' if body[0] == 'A' else 'fleet'
                rest = body[1:].strip()

                if m2 := re.match(r'^(.*?)\s+Convoys\s+A\s+(.*?)\s+-\s+(.*)$', rest, re.I):
                    at = place(m2.group(1))
                    order = {'type': 'convoy', 'at': at,
                             'from': place(m2.group(2)), 'to': place(m2.group(3))}
                elif m2 := re.match(r'^(.*?)\s+Supports\s+[AF]\s+(.*?)\s+-\s+(.*)$', rest, re.I):
                    at = place(m2.group(1))
                    order = {'type': 'support', 'at': at,
                             'from': place(m2.group(2)), 'to': place(m2.group(3))}
                elif m2 := re.match(r'^(.*?)\s+Supports\s+[AF]\s+(.*)$', rest, re.I):
                    at = place(m2.group(1))
                    tgt = place(m2.group(2))
                    order = {'type': 'support', 'at': at, 'from': tgt, 'to': tgt}
                elif m2 := re.match(r'^(.*?)\s+-\s+(.*?)(\s+via\s+convoy)?$', rest, re.I):
                    at = place(m2.group(1))
                    order = {'type': 'move', 'at': at, 'to': place(m2.group(2)),
                             'viaConvoy': bool(m2.group(3))}
                elif m2 := re.match(r'^(.*?)\s+Holds?$', rest, re.I):
                    at = place(m2.group(1))
                    order = {'type': 'hold', 'at': at}
                else:
                    at = place(rest)
                    order = {'type': 'hold', 'at': at}
            except KeyError as e:
                unknown.add(str(e))
                ok = False
                break

            if phase == 'move':
                case['units'].append({'power': power, 'type': unit_type, 'at': at})
                case['orders'].append({**order, 'power': power})
                if marks:
                    case['expect'][at.split('/')[0]] = marks
            else:
                case['retreats'].append({**order, 'power': power})
                if marks:
                    case['expectRetreat'][at.split('/')[0]] = marks

        if ok and (case['orders'] or case['adjust']):
            cases.append(case)

    if unknown:
        print(f'unmapped province names: {sorted(unknown)}', file=sys.stderr)
    print(f'{len(cases)} of {len(heads)} cases parsed', file=sys.stderr)
    json.dump(cases, sys.stdout, indent=1)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
