#!/usr/bin/env python3
"""
Generate 5 hero showcase videos for tap-and-tell opening.
Each scene: txt2img Frame A -> img2img Frame B -> video(A,B,prompt).

Outputs: scripts/hero_videos.json  + downloaded mp4s + still frames in scripts/_hero/
"""

import json, os, ssl, time, urllib.request, uuid

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '_hero')
os.makedirs(OUT, exist_ok=True)

IMAGE_API = 'http://aiservice.wdabuliu.com:8019/genl_image'
VIDEO_SUBMIT = 'https://u545921-b746-8a491f44.westc.seetacloud.com:8443/video'
VIDEO_POLL = 'https://u545921-b746-8a491f44.westc.seetacloud.com:8443/video_task'
USER_ID = 618336286

SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE

SCENES = [
    {
        'id': 'cabin',
        'caption': 'a cabin warms in winter',
        'a_prompt': (
            'cinematic still of a small wooden cabin alone in a snowy pine forest, '
            'soft warm light from one window, dusk, atmospheric, photoreal, 1:1'
        ),
        'b_prompt': (
            'same cabin in same snowy pine forest but heavy snow falling thick, '
            'chimney smoke rising visibly, warmer window glow, same composition, photoreal, 1:1'
        ),
        'v_prompt': (
            'snow begins falling heavier, gentle wind sways pine branches, '
            'smoke rises from chimney, slow cinematic camera push-in'
        ),
    },
    {
        'id': 'beach',
        'caption': 'low tide on a quiet shore',
        'a_prompt': (
            'cinematic still, wide grey beach at low tide, overcast sky, '
            'soft diffuse light, distant lone lighthouse, scattered driftwood, '
            'desaturated palette, photoreal, 1:1'
        ),
        'b_prompt': (
            'same beach same camera angle but a flock of seabirds rises into the sky, '
            'shafts of warm afternoon sun break through the clouds, '
            'wet sand reflects the light, photoreal, 1:1'
        ),
        'v_prompt': (
            'a flock of seabirds takes off across the beach, '
            'clouds part to let warm shafts of sun through, slow cinematic wide shot'
        ),
    },
    {
        'id': 'alley',
        'caption': 'a quiet alley meets the rain',
        'a_prompt': (
            'cinematic still of a narrow neon-lit alley at night, '
            'wet pavement reflecting one pink neon sign, fog drifting, '
            'cinematic noir lighting, photoreal, 1:1'
        ),
        'b_prompt': (
            'same alley same angle but heavy rain is now falling, '
            'every neon sign blazes brighter and reflects in puddles, '
            'steam rises from a manhole, photoreal, 1:1'
        ),
        'v_prompt': (
            'rain begins pouring, neon signs flicker brighter, '
            'puddles ripple, steam curls up from a vent, slow noir camera dolly'
        ),
    },
    {
        'id': 'greenhouse',
        'caption': 'morning finds the greenhouse',
        'a_prompt': (
            'cinematic still inside a humid tropical greenhouse, '
            'large monstera leaves, dim early morning light through fogged glass, '
            'photoreal, atmospheric, 1:1'
        ),
        'b_prompt': (
            'same greenhouse same camera angle but bright golden sunbeams now break through, '
            'the fog has lifted, dust motes float in the rays, leaves glow translucent, '
            'photoreal, 1:1'
        ),
        'v_prompt': (
            'morning sun breaks through the fogged glass roof, '
            'dust motes drift upward, leaves catch the light, gentle camera reveal'
        ),
    },
    {
        'id': 'desert',
        'caption': 'the desert holds its breath',
        'a_prompt': (
            'cinematic still of a straight empty desert highway vanishing into a '
            'heat-shimmered horizon, dusty mesas in distance, golden hour, '
            'warm tones, photoreal, 1:1'
        ),
        'b_prompt': (
            'same desert highway same camera angle but a dust storm now rolls in from the horizon, '
            'orange and umber wall of dust, sky darkens dramatically, '
            'wind whips loose tumbleweeds across the road, photoreal, 1:1'
        ),
        'v_prompt': (
            'a dust storm rolls in across the desert highway, '
            'the sky darkens, tumbleweeds skitter across the asphalt, '
            'slow cinematic wide shot'
        ),
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
    req = urllib.request.Request(url, headers={'User-Agent': 'hero/1.0'})
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
    log(f"img2img ref + {prompt[:60]}...")
    body = {'query': '', 'params': {'url': ref_url, 'prompt': prompt, 'user_id': USER_ID}}
    res = post_json(IMAGE_API, body, timeout=420)
    if res.get('code') != 200:
        raise RuntimeError(f'img2img failed: {res}')
    return res['url']


def gen_video(a_url, b_url, prompt):
    log(f"video submit...")
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
            a_url = txt2img(sc['a_prompt'])
            log(f"  A={a_url}")
            time.sleep(78)  # rate limit
            b_url = img2img(a_url, sc['b_prompt'])
            log(f"  B={b_url}")
            v_url = gen_video(a_url, b_url, sc['v_prompt'])
            log(f"  V={v_url}")
            download(v_url, os.path.join(OUT, f"{sc['id']}.mp4"))
            results.append({
                'id': sc['id'], 'caption': sc['caption'],
                'a_url': a_url, 'b_url': b_url, 'video_url': v_url,
            })
            with open(os.path.join(HERE, 'hero_videos.json'), 'w') as f:
                json.dump(results, f, indent=2, ensure_ascii=False)
            time.sleep(78)
        except Exception as e:
            log(f"  ✗ {sc['id']} failed: {e}")
            results.append({'id': sc['id'], 'error': str(e)})
            with open(os.path.join(HERE, 'hero_videos.json'), 'w') as f:
                json.dump(results, f, indent=2, ensure_ascii=False)
            time.sleep(78)
    log("=== ALL DONE ===")
    log(json.dumps(results, indent=2, ensure_ascii=False))


if __name__ == '__main__':
    main()
