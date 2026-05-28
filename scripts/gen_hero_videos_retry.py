#!/usr/bin/env python3
"""
Retry hero video gen after 5/5 fail. Reuses surviving Frame A/B URLs from
the first run; only re-runs the missing steps. Simpler prompts (no camera
direction), longer rate-limit sleep (180s between calls).
"""

import json, os, ssl, time, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '_hero')
os.makedirs(OUT, exist_ok=True)

IMAGE_API = 'http://aiservice.wdabuliu.com:8019/genl_image'
VIDEO_SUBMIT = 'https://u545921-b746-8a491f44.westc.seetacloud.com:8443/video'
VIDEO_POLL = 'https://u545921-b746-8a491f44.westc.seetacloud.com:8443/video_task'
USER_ID = 618336286
SLEEP = 180

SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE

# Resume state — from first run's log. Includes spike's known-good cabin pair
# (which generated a working video on 2026-05-27 morning), so we have at
# minimum one definite usable hero. The other 4 are fresh tries.
SCENES = [
    {
        'id': 'cabin',
        'caption': 'a cabin in the snow',
        'a_url': 'https://cdn.aiwaves.tech/prod/telegram/avatar/618336286/1779827243649029.webp',  # spike
        'b_url': 'https://cdn.aiwaves.tech/prod/telegram/avatar/618336286/1779859812186600.webp',  # spike
        'v_prompt': 'snow falls, smoke rises',
    },
    {
        'id': 'beach',
        'caption': 'low tide on a quiet shore',
        'a_url': 'https://cdn.aiwaves.tech/prod/telegram/avatar/618336286/1779864848152428.webp',
        'b_url': None,
        'b_prompt': (
            'same beach same camera angle but a flock of seabirds rises into the sky, '
            'shafts of warm sun break through, wet sand reflects light, photoreal, 1:1'
        ),
        'v_prompt': 'seabirds rise, sunlight breaks through',
    },
    {
        'id': 'alley',
        'caption': 'a quiet alley meets the rain',
        'a_url': 'https://cdn.aiwaves.tech/prod/telegram/avatar/618336286/1779865007698654.webp',
        'b_url': None,
        'b_prompt': (
            'same alley same angle but heavy rain now falls, neon signs blaze brighter '
            'and reflect in puddles, steam rises from a vent, photoreal, 1:1'
        ),
        'v_prompt': 'rain pours, neon flickers, puddles ripple',
    },
    {
        'id': 'greenhouse',
        'caption': 'morning finds the greenhouse',
        'a_url': 'https://cdn.aiwaves.tech/prod/telegram/avatar/618336286/1779865167403308.webp',
        'b_url': 'https://cdn.aiwaves.tech/prod/telegram/avatar/618336286/1779865255984122.webp',
        'v_prompt': 'sunbeams break through, dust drifts up',
    },
    {
        'id': 'desert',
        'caption': 'the desert holds its breath',
        'a_url': 'https://cdn.aiwaves.tech/prod/telegram/avatar/618336286/1779865530315397.webp',
        'b_url': 'https://cdn.aiwaves.tech/prod/telegram/avatar/618336286/1779865617887591.webp',
        'v_prompt': 'dust storm rolls in, sky darkens',
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
    req = urllib.request.Request(url, headers={'User-Agent': 'hero/2.0'})
    with urllib.request.urlopen(req, timeout=120, context=SSL_CTX) as r, open(dest, 'wb') as f:
        f.write(r.read())


def img2img(ref_url, prompt):
    log(f"img2img: {prompt[:60]}...")
    body = {'query': '', 'params': {'url': ref_url, 'prompt': prompt, 'user_id': USER_ID}}
    res = post_json(IMAGE_API, body, timeout=420)
    if res.get('code') != 200:
        raise RuntimeError(f'img2img failed: {res}')
    return res['url']


def gen_video(a_url, b_url, prompt):
    log(f"video submit: {prompt!r}")
    body = {
        'query': '',
        'params': {
            'image_url': a_url, 'end_image_url': b_url, 'prompt': prompt, 'env': 'prod',
        },
    }
    res = post_json(VIDEO_SUBMIT, body, timeout=60)
    task_id = res.get('task_id')
    if not task_id:
        raise RuntimeError(f'submit failed: {res}')
    log(f"  task_id={task_id}")
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
            b_url = sc.get('b_url')
            if not b_url:
                if sc.get('b_prompt'):
                    b_url = img2img(sc['a_url'], sc['b_prompt'])
                    log(f"  B={b_url}")
                    log(f"  sleeping {SLEEP}s before video")
                    time.sleep(SLEEP)
                else:
                    raise RuntimeError('no b_url and no b_prompt')
            v_url = gen_video(sc['a_url'], b_url, sc['v_prompt'])
            log(f"  V={v_url}")
            download(v_url, os.path.join(OUT, f"{sc['id']}.mp4"))
            results.append({
                'id': sc['id'], 'caption': sc['caption'],
                'a_url': sc['a_url'], 'b_url': b_url, 'video_url': v_url,
            })
        except Exception as e:
            log(f"  ✗ {sc['id']} failed: {e}")
            results.append({'id': sc['id'], 'error': str(e), 'a_url': sc['a_url'], 'b_url': sc.get('b_url')})

        with open(os.path.join(HERE, 'hero_videos.json'), 'w') as f:
            json.dump(results, f, indent=2, ensure_ascii=False)
        log(f"  sleeping {SLEEP}s before next scene")
        time.sleep(SLEEP)

    log("=== ALL DONE ===")
    succ = sum(1 for r in results if 'video_url' in r)
    log(f"success: {succ}/{len(SCENES)}")
    log(json.dumps(results, indent=2, ensure_ascii=False))


if __name__ == '__main__':
    main()
