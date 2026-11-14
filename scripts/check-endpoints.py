#!/usr/bin/env python3
"""Unauthenticated HTTP reachability probes. Never send credentials or run inference."""
import concurrent.futures
import datetime
import json
from pathlib import Path
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
TARGETS = [
    ('GET', 'https://api.gonkarouter.io/v1/models'),
    ('POST', 'https://api.gonkarouter.io/v1/messages'),
    ('GET', 'https://api.anyapi.ai/v1/models'),
    ('POST', 'https://api.anyapi.ai/v1/chat/completions'),
    ('GET', 'https://api.routeway.ai/v1/models'),
    ('POST', 'https://api.routeway.ai/v1/chat/completions'),
    ('GET', 'https://router.requesty.ai/v1/models'),
    ('GET', 'https://models.github.ai/catalog/models'),
    ('GET', 'https://api.kilo.ai/api/gateway/models'),
    ('GET', 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/models'),
    ('POST', 'https://ch.at/v1/chat/completions'),
    ('GET', 'https://blockrun.ai/api/v1/models'),
    ('POST', 'https://blockrun.ai/api/v1/chat/completions'),
    ('GET', 'https://gateway.vlm.run/v1/openai/models'),
    ('POST', 'https://gateway.vlm.run/v1/openai/chat/completions'),
    ('GET', 'https://oai.aihorde.net/v1/models'),
    ('POST', 'https://oai.aihorde.net/v1/chat/completions'),
    ('POST', 'https://api.kilo.ai/api/gateway/chat/completions'),
    ('POST', 'https://models.github.ai/inference/chat/completions'),
    ('POST', 'https://router.requesty.ai/v1/chat/completions'),
    ('GET', 'https://api.anthropic.com/v1/models'),
    ('GET', 'https://api.openai.com/v1/models'),
    ('GET', 'https://api.deepseek.com/models'),
    ('GET', 'https://api.x.ai/v1/models'),
]

def probe(target):
    method, url = target
    start = time.monotonic()
    row = {'url': url, 'method': method, 'authenticated': False}
    headers = {'User-Agent': 'Horizon-endpoint-check/1.87.1', 'Accept': 'application/json'}
    if method == 'POST':
        headers['Content-Type'] = 'application/json'
        headers['anthropic-version'] = '2023-06-01'
    try:
        request = urllib.request.Request(url, data=b'{}' if method == 'POST' else None, method=method, headers=headers)
        with urllib.request.urlopen(request, timeout=20) as response:
            row.update(status=response.status, contentType=response.headers.get('content-type', ''), preview=response.read(700).decode(errors='replace'))
    except urllib.error.HTTPError as error:
        row.update(status=error.code, contentType=error.headers.get('content-type', ''), preview=error.read(700).decode(errors='replace'))
    except Exception as error:
        row['error'] = str(error)
    row['durationMs'] = round((time.monotonic() - start) * 1000)
    return row

if __name__ == '__main__':
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        results = list(pool.map(probe, TARGETS))
    report = {'dateUTC': datetime.datetime.now(datetime.timezone.utc).date().isoformat(),
              'note': 'No keys, prompts, audio or inference requests. Empty unauthenticated POST checks only. 401/403/405 show a reachable HTTP service but do not prove working authentication, eligibility, inference or CORS. WAF blocks and network errors remain inconclusive.',
              'results': results}
    output = ROOT / 'validation' / 'provider-endpoints.json'
    output.parent.mkdir(exist_ok=True)
    output.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))
