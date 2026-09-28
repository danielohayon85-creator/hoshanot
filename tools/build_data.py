#!/usr/bin/env python3
"""בונה את hoshanot/data.js מתוך מקורות פתוחים.

מקורות:
  • אשכנז      — סידור קורן השלם (Koren Publishers Jerusalem, 2017) דרך Sefaria · CC BY-NC
  • ספרד       — סידור ספרד, מהדורת "תורת אמת" דרך Sefaria
  • עדות המזרח — ויקיטקסט, "הושענות/נוסח עדות המזרח" · CC BY-SA

הרצה:  python3 hoshanot/tools/build_data.py
(דורש גישה לרשת; הקובץ data.js שנוצר נשמר ב-repo כך שהאפליקציה עובדת בלי בנייה.)
"""
import html
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / 'data.js'
UA = 'HoshanotReaderBuild/1.0 (static liturgy reader; occasional one-off fetch)'

NIKUD = re.compile('[ְ-ׇּׁׂ]')
TAAMIM = re.compile('[֑-֯׀͏]')
WIDE = str.maketrans('ﬡﬢﬣﬤﬥﬦﬧﬨ', 'אדהכלםרת')
REFRAIN_START = ('אֲנִי וָהוּ', 'אֲנִי וָהוֹ', 'הוֹשַׁע נָא', 'הוֹשַׁעְנָא', 'הוֹשַׁעֲנָא', 'אָנָּא הוֹשִׁיעָה', 'אָנָּא, הוֹשִׁיעָה', 'אָנָּא אֵל נָא', 'אָנָּא, אֵל נָא')


def fetch(url):
    for attempt in range(5):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read().decode('utf-8')
        except Exception as e:  # noqa: BLE001 — רשת: ננסה שוב
            wait = 2 ** (attempt + 1) * 5
            print(f'  ! {e} — retry in {wait}s', file=sys.stderr)
            time.sleep(wait)
    raise SystemExit(f'failed to fetch {url}')


def sefaria(ref):
    url = 'https://www.sefaria.org/api/v3/texts/' + urllib.parse.quote(ref) + '?version=hebrew'
    data = json.loads(fetch(url))

    def flat(x):
        if isinstance(x, list):
            for y in x:
                yield from flat(y)
        else:
            yield x
    return list(flat(data['versions'][0]['text']))


def plain(s):
    """טקסט ללא תגיות וללא ניקוד — להשוואות בלבד."""
    s = re.sub(r'<[^>]+>', ' ', s)
    s = TAAMIM.sub('', NIKUD.sub('', s)).replace('ֽ', '')
    return re.sub(r'\s+', ' ', s).strip()


def clean(s):
    s = html.unescape(s).translate(WIDE)
    s = TAAMIM.sub('', s)
    s = s.replace(' ', ' ')
    s = re.sub(r'[ \t ]+', ' ', s)
    s = re.sub(r'\s*<br\s*/?>\s*', '<br>', s)
    return s.strip()


def is_refrain(h):
    if '<br>' in h:
        return False
    t = re.sub(r'<[^>]+>', '', h).strip()
    t_plain = plain(t)
    if 'למענך' in t_plain:  # "הוֹשַׁע נָא לְמַעַנְךָ אֱלֹהֵינוּ" — פתיחה, לא פזמון
        return False
    return len(t_plain) <= 60 and any(t_plain.startswith(plain(r)) for r in REFRAIN_START)


def stichs(h):
    """פיוט אלפביתי ("א. ב. ג.") — מפוצל לחרוזים, כך שחרוז לא נשבר בין שורות."""
    if '<br>' in h:
        return None
    parts = [p.strip() for p in re.split(r'(?<=\.)\s+', h) if p.strip()]
    if len(parts) < 6:
        return None
    if sum(len(plain(p)) for p in parts) / len(parts) > 48:
        return None
    return parts


def para(h):
    """ממיר קטע טקסט לבלוק/ים: חרוזים, פזמון או פסקה."""
    h = clean(h)
    if not re.sub(r'<[^>]+>', '', h).strip():
        return []
    if is_refrain(h):
        return [['r', re.sub(r'</?b>', '', h)]]
    # כמה "כְּהוֹשַׁעְתָּ" ברצף בפסקה אחת — כל אחד בשורה משלו
    pieces = re.split(r'(?<=[.:])\s+(?=כְּהוֹשַׁ)', h) if '<br>' not in h else [h]
    if len(pieces) > 1:
        out = []
        for piece in pieces:
            out.extend(para(piece))
        return out
    # פסקה ארוכה שמורכבת מכמה "כְּהוֹשַׁעְתָּ ...:" / פסוקים — כל אחד בשורה
    if len(plain(h)) > 280 and '<br>' not in h and h.count(': ') >= 2:
        out = []
        for piece in re.split(r'(?<=:)\s+', h):
            out.extend(para(piece))
        return out
    st = stichs(h)
    if st:
        return [['s', st]]
    return [['p', h]]


def split_lead_refrain(h):
    """"הוֹשַׁע נָא<br>לְמַעַן..." → פזמון + פיוט."""
    h = clean(h)
    if '<br>' in h:
        first, rest = h.split('<br>', 1)
        if is_refrain(first):
            return [['r', first]] + para(rest)
    return para(h)


def blocks_from(segments):
    out = []
    for s in segments:
        out.extend(para(s))
    return out


def find(segments, start_plain, after=0):
    starts = start_plain if isinstance(start_plain, tuple) else (start_plain,)
    for i in range(after, len(segments)):
        t = plain(segments[i])
        if any(t.startswith(s) or t.replace('הושע נא ', '', 1).startswith(s) for s in starts):
            return i
    raise SystemExit(f'segment not found: {start_plain}')


HAKAFA = ['הקפה ראשונה', 'הקפה שנייה', 'הקפה שלישית', 'הקפה רביעית', 'הקפה חמישית', 'הקפה שישית', 'הקפה שביעית']

TITLES = {
    'amitecha': 'לְמַעַן אֲמִתָּךְ',
    'even': 'אֶבֶן שְׁתִיָּה',
    'eeroch': 'אֶעֱרוֹךְ שׁוּעִי',
    'om_ani': 'אוֹם אֲנִי חוֹמָה',
    'el': 'אֵל לְמוֹשָׁעוֹת',
    'adon': 'אָדוֹן הַמּוֹשִׁיעַ',
    'shabbat': 'אוֹם נְצוּרָה',
    'hr': 'הוֹשַׁעְנָא רַבָּה',
}
PIYUT_START = {
    'amitecha': 'למען אמתך',
    'even': 'אבן שתיה',
    'eeroch': 'אער',  # "אערך" / "אערוך"
    'om_ani': ('אם אני חומה', 'אום אני חומה'),
    'el': 'אל למושעות',
    'adon': 'אדון המושיע',
}


# ───────────── אשכנז — קורן ─────────────
def build_ashkenaz():
    base = 'סידור קורן השלם; אשכנז, חגים ומועדים, '
    daily = sefaria(base + 'הושענות')
    shab = sefaria(base + 'הושענות לשבת חול המועד')
    hr = sefaria(base + 'הושענות להושענא רבה')

    o = find(daily, 'הושע נא למענך אלהינו')
    opening = [['n', 'פותחים את ארון הקודש. החזן והקהל אומרים:']] + blocks_from(daily[o:o + 4])
    close_at = find(daily, 'אני והו')
    closing = blocks_from(daily[close_at:])

    services = {}
    for key, start in PIYUT_START.items():
        i = find(daily, start, o + 4)
        services[key] = opening + split_lead_refrain(daily[i]) + closing

    so = find(shab, 'הושע נא למענך אלהינו')
    services['shabbat'] = (
        [['n', 'בשבת אין נוטלים לולב ואין מקיפים. פותחים את ארון הקודש ואומרים:']]
        + blocks_from(shab[so:so + 4])
        + split_lead_refrain(shab[so + 4])
        + blocks_from(shab[so + 5:])
    )

    # הושענא רבה: כותרת לכל הקפה, לפני ה"הוֹשַׁע נָא" שפותח אותה
    ho = find(hr, 'הושע נא למענך אלהינו')
    starts = []
    after = ho
    for s in ['למען אמתך', 'אבן שתיה', PIYUT_START['om_ani'], 'אדון המושיע', 'אדם ובהמה', 'אדמה מארר', 'למען איתן']:
        i = find(hr, s, after)
        starts.append(i)
        after = i + 1
    heads = {}
    for n, i in enumerate(starts):
        j = i - 1
        while j > ho and not plain(hr[j]):
            j -= 1
        heads[j if plain(hr[j]) == 'הושע נא' else i] = HAKAFA[n]
    out = [['n', 'פותחים את ארון הקודש, מוציאים את כל ספרי התורה לבימה, ומקיפים שבע הקפות.']]
    chavata = find(hr, 'יהי רצון מלפניך')
    for idx in range(ho, len(hr)):
        if idx in heads:
            out.append(['h', heads[idx]])
        if idx == chavata:
            out.append(['h', 'חביטת הערבה'])
            out.append(['n', 'מניחים את הלולב, חובטים את הערבות על הקרקע חמש פעמים, ואומרים:'])
        out.extend(split_lead_refrain(hr[idx]) if idx in starts else para(hr[idx]))
    services['hr'] = out

    return {
        'name': 'אשכנז',
        'source': 'סידור קורן השלם · הוצאת קורן ירושלים, 2017 (דרך Sefaria, רישיון CC BY-NC)',
        'services': {k: {'title': TITLES[k], 'blocks': v} for k, v in services.items()},
    }


# ───────────── ספרד — תורת אמת ─────────────
def sef_segment(h):
    depth = 0
    m = re.match(r'^\s*((?:<small>\s*)+)', h)
    if m:
        depth = m.group(1).count('<small>')
    if '<big>' in h:
        return []  # כותרת המקור — מוחלפת בכותרות שלנו
    if depth >= 2:
        return [['n', re.sub(r'<[^>]+>', '', h).strip()]]
    h = re.sub(r'</?(small|big)>', '', h)
    h = re.sub(r'</?b>', '', h)
    return para(h)


def sef_blocks(segs):
    out = []
    for s in segs:
        out.extend(sef_segment(s))
    return out


def build_sefard():
    daily = sefaria('Siddur Sefard, Sukkot, First Day & Chol HaMoed')
    shab = sefaria('Siddur Sefard, Sukkot, Sabbath')
    hr = sefaria('Siddur Sefard, Sukkot, Hoshana Rabba')

    o = find(daily, 'הושע נא')
    opening = [['n', 'פותחים את ארון הקודש. החזן והקהל אומרים:']] + sef_blocks(daily[o:o + 5])
    first = find(daily, PIYUT_START['amitecha'], o)
    closing = sef_blocks(daily[first + 1:first + 4])

    services = {}
    for key, start in PIYUT_START.items():
        i = find(daily, start, o + 5)
        services[key] = opening + sef_blocks([daily[i]]) + closing

    so = find(shab, 'הושע נא')
    services['shabbat'] = (
        [['n', 'בשבת אין נוטלים לולב ואין מקיפים. פותחים את ארון הקודש ואומרים:']]
        + sef_blocks(shab[so:])
    )

    ho = find(hr, 'הושע נא')
    starts = {}
    after = ho
    for n, s in enumerate(['למען אמתך', 'אבן שתיה', PIYUT_START['om_ani'], 'אדון המושיע', 'אדם ובהמה', 'אדמה מארר', 'למען איתן']):
        i = find(hr, s, after)
        starts[i] = HAKAFA[n]
        after = i + 1
    out = [['n', 'פותחים את ארון הקודש, מוציאים את ספרי התורה לבימה, ומקיפים שבע הקפות.']]
    for idx in range(ho, len(hr)):
        if idx in starts:
            out.append(['h', starts[idx]])
        out.extend(sef_segment(hr[idx]))
    services['hr'] = out

    return {
        'name': 'ספרד',
        'source': 'סידור ספרד, מהדורת "תורת אמת" (דרך Sefaria)',
        'services': {k: {'title': TITLES[k], 'blocks': v} for k, v in services.items()},
    }


# ───────────── עדות המזרח — ויקיטקסט ─────────────
EDOT_SECTIONS = {
    'הושענות ליום הראשון': ('d1', 'הושענות ליום הראשון'),
    'הושענות ליום השני': ('d2', 'הושענות ליום השני'),
    'הושענות ליום השלישי': ('d3', 'הושענות ליום השלישי'),
    'הושענות ליום הרביעי': ('d4', 'הושענות ליום הרביעי'),
    'הושענות ליום החמישי': ('d5', 'הושענות ליום החמישי'),
    'הושענות ליום השישי': ('d6', 'הושענות ליום השישי'),
    'הושענות ליום שבת': ('shabbat', 'הושענות לשבת'),
    'הושענות להושענא רבא': ('hr', 'הוֹשַׁעְנָא רַבָּה'),
}


def wiki_inline(s):
    s = re.sub(r'<small>\s*<sup>.*?</sup>\s*</small>', '', s)
    s = re.sub(r'<su[bp]>.*?</su[bp]>', '', s)
    s = re.sub(r'\[\[(?:[^|\]]*\|)?([^\]]*)\]\]', r'\1', s)
    s = s.replace('{{ש}}', '<br>')
    # {{ק|{{ק|x}}}} → זעיר ; {{ק|x}} → קטן
    for _ in range(3):
        s = re.sub(r'\{\{ק\|\{\{ק\|([^{}]*)\}\}\}\}', r'<small class="xs">\1</small>', s)
        s = re.sub(r'\{\{ק\|([^{}]*)\}\}', r'<small>\1</small>', s)
    s = re.sub(r"'''(.*?)'''", r'<b>\1</b>', s)
    s = re.sub(r"''(.*?)''", r'\1', s)
    s = re.sub(r'<(?!/?(?:b|br|small)\b)[^>]*>', '', s)
    return s


def build_edot():
    title = 'הושענות/נוסח עדות המזרח'
    raw = fetch('https://he.wikisource.org/w/index.php?title=' + urllib.parse.quote(title) + '&action=raw')
    raw = raw.split('==הושענות לפי מנהג חבאן==')[0]
    parts = re.split(r'^===\s*(.*?)\s*===\s*$', raw, flags=re.M)
    services = {}
    for name, body in zip(parts[1::2], parts[2::2]):
        if name not in EDOT_SECTIONS:
            continue
        key, ttl = EDOT_SECTIONS[name]
        body = body.replace('{{עם-ניקוד|', '\n')
        lines = [ln for ln in body.split('\n') if ln.strip() != '}}']
        text = '\n'.join(lines)
        blocks = [['n', 'פותחים את ההיכל. החזן והקהל אומרים:']] if key != 'hr' else [
            ['n', 'פותחים את ההיכל, מוציאים ספרי תורה, ומקיפים שבע הקפות.']]
        for chunk in re.split(r'\n\s*\n', text):
            chunk = chunk.strip()
            if not chunk:
                continue
            if not NIKUD.search(chunk):
                t = re.sub(r"'''|\[\[|\]\]", '', chunk).strip()
                if 'הקפה' in t:
                    blocks.append(['h', t])
                elif 'הפיוט להלן' in t or t.startswith('{{') or t.startswith('ראו גם'):
                    continue
                else:
                    blocks.append(['n', t])
                continue
            rows = [wiki_inline(r).strip() for r in chunk.split('\n') if r.strip()]
            h = '<br>'.join(r[:-4] if r.endswith('<br>') else r for r in rows)
            h = clean(h)
            whole_bold = re.fullmatch(r'<b>([^<]*)</b>\s*:?', h)
            if whole_bold and len(plain(h)) < 60:
                blocks.append(['r', whole_bold.group(1)])
                continue
            # הדגשות במקור הן סימון האקרוסטיכון — לא נשמרות, למראה נקי ואחיד
            h = re.sub(r'</?b>', '', h)
            if is_refrain(h):
                blocks.append(['r', h])
            elif '<br>' not in h:
                blocks.extend(para(h))
            else:
                first, rest = h.split('<br>', 1)
                if is_refrain(first):
                    blocks += [['r', first], ['p', rest]]
                else:
                    blocks.append(['p', h])
        services[key] = {'title': ttl, 'blocks': blocks}
    missing = {v[0] for v in EDOT_SECTIONS.values()} - services.keys()
    if missing:
        raise SystemExit(f'edot: missing sections {missing}')
    return {
        'name': 'עדות המזרח',
        'source': 'ויקיטקסט — "הושענות/נוסח עדות המזרח" (רישיון CC BY-SA)',
        'services': services,
    }


def main():
    data = {'nusachim': {}}
    for key, fn in [('ashkenaz', build_ashkenaz), ('sefard', build_sefard), ('edot', build_edot)]:
        print(f'building {key}…', file=sys.stderr)
        data['nusachim'][key] = fn()
        for sk, sv in data['nusachim'][key]['services'].items():
            print(f'  {sk:9} {len(sv["blocks"]):4} blocks', file=sys.stderr)
    js = ('// נוצר אוטומטית ע"י tools/build_data.py — אין לערוך ידנית\n'
          'window.HOSHANOT_DATA = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')
    OUT.write_text(js, encoding='utf-8')
    print(f'wrote {OUT} ({len(js.encode()) // 1024} KB)', file=sys.stderr)


if __name__ == '__main__':
    main()
