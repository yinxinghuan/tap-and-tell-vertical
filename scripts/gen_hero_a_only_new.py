#!/usr/bin/env python3
"""
Quick a_url-only generator for the 5 NEW scenes added in v2.1.

Unlike gen_hero_videos_v2.py (which does a+b+video, ~25 min/scene), this
only does txt2img for the opening frame (a_url). The picker can populate
with these images immediately. b_url/video_url get filled in by a separate
async videos script later.

Output: appends to public/hero_videos.json (preserves the 5 existing entries).
"""

import json, os, ssl, time, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
PUB = os.path.join(HERE, '..', 'public')
IMAGE_API = 'http://aiservice.wdabuliu.com:8019/genl_image'
USER_ID = 618336286

SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE

NEW_SCENES = [
    {
        'id': 'attic',
        'caption': 'the tarp slides off',
        'a': ('cinematic still of a dusty attic with covered furniture under '
              'white sheets, a single bare bulb hanging, motes of dust in '
              'the slanted afternoon light from a small dormer window, '
              'wooden rafters, photoreal, 1:1'),
    },
    {
        'id': 'arcade',
        'caption': 'a machine flickers on',
        'a': ('cinematic still of an empty 1990s arcade after closing, '
              'rows of dim cabinet screens, neon CRT glow on stained '
              'carpet, no people, faded posters on the wall, photoreal, 1:1'),
    },
    {
        'id': 'laundromat',
        'caption': 'a dryer thumps awake',
        'a': ('cinematic still of a 24-hour laundromat at 3am, fluorescent '
              'overhead lights, empty plastic chairs, one dryer door '
              'slightly open, linoleum floor, rain-streaked front window, '
              'photoreal, 1:1'),
    },
    {
        'id': 'phone-booth',
        'caption': 'the phone starts to ring',
        'a': ('cinematic still of a red glass phone booth on an empty '
              'street corner at night, rain falling, the booth lit from '
              'inside, fogged glass, wet asphalt reflections, photoreal, 1:1'),
    },
    {
        'id': 'rooftop',
        'caption': 'the city goes silent',
        'a': ('cinematic still of a quiet city rooftop at golden hour, '
              'rusted water tower, antenna forest in the distance, soft '
              'haze over the skyline, the figure facing the horizon, '
              'photoreal, 1:1'),
    },
]


def log(m):
    print(f"[{time.strftime('%H:%M:%S')}] {m}", flush=True)


def post_json(url, body, timeout=420):
    data = json.dumps(body).encode('utf-8')
    req = urllib.request.Request(
        url, data=data, headers={'Content-Type': 'application/json'}, method='POST'
    )
    with urllib.request.urlopen(req, timeout=timeout, context=SSL_CTX) as r:
        return json.loads(r.read().decode('utf-8'))


def txt2img(prompt):
    log(f"txt2img: {prompt[:60]}...")
    body = {'query': '', 'params': {'prompt': prompt, 'user_id': USER_ID}}
    res = post_json(IMAGE_API, body, timeout=420)
    if res.get('code') != 200:
        raise RuntimeError(f'txt2img failed: {res}')
    return res['url']


def main():
    json_path = os.path.join(PUB, 'hero_videos.json')
    with open(json_path) as f:
        existing = json.load(f)
    have = {e['id'] for e in existing}
    out = list(existing)
    for sc in NEW_SCENES:
        if sc['id'] in have:
            log(f"skip existing: {sc['id']}")
            continue
        try:
            a_url = txt2img(sc['a'])
            log(f"  ✓ {sc['id']} → {a_url}")
            out.append({'id': sc['id'], 'caption': sc['caption'], 'a_url': a_url})
        except Exception as e:
            log(f"  ✗ {sc['id']}: {e}")
            out.append({'id': sc['id'], 'caption': sc['caption'], 'error': str(e)})
        with open(json_path, 'w') as f:
            json.dump(out, f, indent=2, ensure_ascii=False)
        time.sleep(3)  # respect rate limit
    log(f"done, total entries: {len(out)}")


if __name__ == '__main__':
    main()
