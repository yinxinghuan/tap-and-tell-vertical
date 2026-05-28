#!/usr/bin/env python3
"""
Generate 5 NEW diverse hero showcase videos for tap-and-tell-vertical.

Different from v1's outdoor-dusk-environment-only set:
  - kitchen   (indoor / small / warm yellow / intimate)
  - diner     (urban / neon / vivid / with implied people)
  - garden    (outdoor / golden hour / social)
  - bookstore (indoor / vertical / brown wood) ← 3:4 native fit
  - music     (indoor / sunbeam / serene)

Video API gets target_image_ratio=9x16 so output is 768×1024 portrait.
"""

import json, os, ssl, time, urllib.request, uuid

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '_hero')
os.makedirs(OUT, exist_ok=True)

IMAGE_API = 'http://aiservice.wdabuliu.com:8019/genl_image'
VIDEO_SUBMIT = 'https://u545921-b746-8a491f44.westc.seetacloud.com:8443/video'
VIDEO_POLL = 'https://u545921-b746-8a491f44.westc.seetacloud.com:8443/video_task'
USER_ID = 618336286
SLEEP = 90

SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE

SCENES = [
    {
        'id': 'kitchen',
        'caption': 'the kettle starts to whistle',
        'a': ('cinematic still of a small kitchen at midnight, single warm pendant light '
              'over the counter, kettle on the stove just starting to steam softly, '
              'dark wood cabinets, condensation on the window, photoreal, 1:1'),
        'b': ('same kitchen same camera angle but the kettle is now whistling with thick '
              'steam pouring out, the window fully fogged up, the pendant light flickers '
              'slightly, photoreal, 1:1'),
        'v': 'the kettle starts whistling, steam billows out, the window fogs over',
    },
    {
        'id': 'diner',
        'caption': 'neon flickers on the rain',
        'a': ('cinematic still of an empty red vinyl booth in a 1950s diner at night, '
              'rain streaks on the window, neon sign reflection in the glass, '
              'jukebox glowing dimly in the corner, fluorescent lighting, photoreal, 1:1'),
        'b': ('same diner same angle but the jukebox glows much brighter, neon outside '
              'flickers more vividly, rain intensifies on the window, hopper noir mood, '
              'photoreal, 1:1'),
        'v': 'neon flickers brighter, jukebox lights up, rain pounds the window',
    },
    {
        'id': 'garden',
        'caption': 'fireflies find the table',
        'a': ('cinematic still of a garden table set with mismatched china and wildflowers, '
              'string lights overhead but not yet lit, golden hour sunlight through trees, '
              'warm summer afternoon, photoreal, 1:1'),
        'b': ('same garden table same angle but fireflies are now appearing in the air, '
              'string lights are now glowing warmly, golden light has dimmed to soft dusk, '
              'photoreal, 1:1'),
        'v': 'string lights turn on, fireflies begin to glow, golden hour fades to dusk',
    },
    {
        'id': 'bookstore',
        'caption': 'a book slides out on its own',
        'a': ('cinematic still inside a narrow used bookstore aisle, tall shelves of '
              'weathered books, a single pendant light, dust in the air, deep brown wood, '
              'photoreal, 1:1'),
        'b': ('same aisle same angle but a single book has slid forward off the shelf '
              'as if pushed, dust motes swirl in the light, the pendant flickers, '
              'photoreal, 1:1'),
        'v': 'a book slides forward off the shelf, dust motes swirl in the light',
    },
    {
        'id': 'music',
        'caption': 'a key presses by itself',
        'a': ('cinematic still of an old upright piano in a sunlit music room, dust motes '
              'floating in a shaft of light through tall windows, sheet music open on the '
              'stand, polished wood floor, photoreal, 1:1'),
        'b': ('same piano same angle but a single white key has been pressed down (visible '
              'depressed), more dust motes swirl, light shifts slightly warmer, photoreal, 1:1'),
        'v': 'a piano key presses down on its own, dust motes swirl, light warms',
    },
]


def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def post_json(url, body, timeout=420):
    data = json.dumps(body).encode('utf-8')
    req = urllib.request.Request(
        url, data=data, headers={'Content-Type': 'application/json'}, method='POST'
    )
    with urllib.request.urlopen(req, timeout=timeout, context=SSL_CTX) as r:
        return json.loads(r.read().decode('utf-8'))


def download(url, dest):
    log(f"  download -> {dest}")
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=120, context=SSL_CTX) as r, open(dest, 'wb') as f:
        f.write(r.read())


def txt2img(prompt):
    log(f"txt2img: {prompt[:80]}...")
    body = {'query': '', 'params': {'prompt': prompt, 'user_id': USER_ID}}
    res = post_json(IMAGE_API, body, timeout=420)
    if res.get('code') != 200:
        raise RuntimeError(f'txt2img failed: {res}')
    return res['url']


def img2img(ref_url, prompt):
    log(f"img2img: {prompt[:60]}...")
    body = {'query': '', 'params': {'url': ref_url, 'prompt': prompt, 'user_id': USER_ID}}
    res = post_json(IMAGE_API, body, timeout=420)
    if res.get('code') != 200:
        raise RuntimeError(f'img2img failed: {res}')
    return res['url']


def gen_video(a_url, b_url, prompt):
    log(f"video submit (9x16): {prompt!r}")
    body = {
        'query': '',
        'params': {
            'image_url': a_url, 'end_image_url': b_url, 'prompt': prompt, 'env': 'prod',
            'target_image_ratio': '9x16',
        },
    }
    res = post_json(VIDEO_SUBMIT, body, timeout=60)
    task_id = res.get('task_id')
    if not task_id:
        raise RuntimeError(f'submit failed: {res}')
    log(f"  task_id={task_id}, polling...")
    t0 = time.time()
    while time.time() - t0 < 1800:
        time.sleep(8)
        r = post_json(VIDEO_POLL, {'query': '', 'params': {'task_id': task_id}}, timeout=60)
        status = r.get('status')
        if status == 'success':
            log(f"  ✓ done in {time.time()-t0:.0f}s")
            return r['url']
        if status == 'failed':
            raise RuntimeError(f'video failed: {r}')
    raise TimeoutError('poll timeout')


def main():
    results = []
    for i, sc in enumerate(SCENES):
        log(f"=== {i+1}/{len(SCENES)} · {sc['id']} ===")
        try:
            a_url = txt2img(sc['a'])
            log(f"  A={a_url}")
            time.sleep(SLEEP)
            b_url = img2img(a_url, sc['b'])
            log(f"  B={b_url}")
            time.sleep(SLEEP)
            v_url = gen_video(a_url, b_url, sc['v'])
            log(f"  V={v_url}")
            download(v_url, os.path.join(OUT, f"{sc['id']}.mp4"))
            results.append({
                'id': sc['id'], 'caption': sc['caption'],
                'a_url': a_url, 'b_url': b_url, 'video_url': v_url,
            })
            with open(os.path.join(HERE, 'hero_videos.json'), 'w') as f:
                json.dump(results, f, indent=2, ensure_ascii=False)
            time.sleep(SLEEP)
        except Exception as e:
            log(f"  ✗ {sc['id']} failed: {e}")
            results.append({'id': sc['id'], 'error': str(e)})
            with open(os.path.join(HERE, 'hero_videos.json'), 'w') as f:
                json.dump(results, f, indent=2, ensure_ascii=False)
            time.sleep(SLEEP)
    log("=== ALL DONE ===")
    succ = sum(1 for r in results if 'video_url' in r)
    log(f"success: {succ}/{len(SCENES)}")


if __name__ == '__main__':
    main()
