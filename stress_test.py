"""
AfterQuery stress test — fires 100 concurrent POST /api/ingest requests
to prove the Redis/Celery queue handles high throughput without crashing.

Usage:
    pip install httpx
    python stress_test.py [--url http://localhost:8000] [--n 100]
"""

import asyncio
import argparse
import random
import time
import httpx

API_URL = "http://localhost:8000/api/ingest"
CONCURRENCY = 100


def generate_payload(i: int) -> dict:
    return {
        "task_id": f"stress_{i}_{int(time.time())}",
        "annotator_id": f"tester_{random.randint(1, 10)}",
        "prompt": "Write a Python function to sort a list using merge sort.",
        "model_a_response": "def merge_sort(arr):\n    if len(arr) <= 1:\n        return arr\n    mid = len(arr) // 2\n    return merge(merge_sort(arr[:mid]), merge_sort(arr[mid:]))",
        "model_b_response": "def merge_sort(lst):\n    if len(lst) < 2:\n        return lst[:]\n    mid = len(lst) // 2\n    a = merge_sort(lst[:mid])\n    b = merge_sort(lst[mid:])\n    return merge(a, b)",
        "model_a_ratings": {
            "factuality": random.randint(1, 5),
            "coding_accuracy": random.randint(1, 5),
            "tone": random.randint(1, 5),
        },
        "model_b_ratings": {
            "factuality": random.randint(1, 5),
            "coding_accuracy": random.randint(1, 5),
            "tone": random.randint(1, 5),
        },
        "highlighted_ranges": [],
        "winner": random.choice(["A", "B", "tie"]),
        "time_spent_seconds": round(random.uniform(30, 300), 2),
        "notes": f"stress test request #{i}",
    }


async def send(client: httpx.AsyncClient, i: int, results: list) -> None:
    t0 = time.perf_counter()
    try:
        resp = await client.post(API_URL, json=generate_payload(i), timeout=30)
        elapsed = time.perf_counter() - t0
        ok = resp.status_code == 200
        results.append({"i": i, "status": resp.status_code, "elapsed": elapsed, "ok": ok})
        icon = "✓" if ok else "✗"
        print(f"  {icon} [{i:3d}] HTTP {resp.status_code}  {elapsed*1000:.0f}ms")
    except Exception as exc:
        elapsed = time.perf_counter() - t0
        results.append({"i": i, "status": -1, "elapsed": elapsed, "ok": False})
        print(f"  ✗ [{i:3d}] ERROR: {exc}")


async def main(url: str, n: int) -> None:
    global API_URL
    API_URL = url

    print(f"\n{'='*55}")
    print(f"  AfterQuery Stress Test")
    print(f"  Target : {url}")
    print(f"  Requests: {n} concurrent")
    print(f"{'='*55}\n")

    results: list = []
    t_start = time.perf_counter()

    async with httpx.AsyncClient() as client:
        await asyncio.gather(*[send(client, i, results) for i in range(n)])

    total = time.perf_counter() - t_start
    successes = sum(1 for r in results if r["ok"])
    latencies = [r["elapsed"] for r in results]
    avg_ms = (sum(latencies) / len(latencies)) * 1000
    p99_ms = sorted(latencies)[int(len(latencies) * 0.99)] * 1000

    print(f"\n{'='*55}")
    print(f"  Results   : {successes}/{n} successful ({successes/n*100:.0f}%)")
    print(f"  Wall time : {total:.2f}s")
    print(f"  Throughput: {n/total:.1f} req/s")
    print(f"  Avg latency: {avg_ms:.0f}ms   p99: {p99_ms:.0f}ms")
    print(f"{'='*55}\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://localhost:8000/api/ingest")
    parser.add_argument("--n", type=int, default=100)
    args = parser.parse_args()
    asyncio.run(main(args.url, args.n))
