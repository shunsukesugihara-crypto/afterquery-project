# Data Capture Engine

A fully containerized RLHF (Reinforcement Learning from Human Feedback) data pipeline. Human annotators compare two model responses side-by-side, rate them across multiple axes, and submit their judgement — all captured asynchronously at high throughput via a Redis/Celery queue.

## What it does

- **Annotation UI** — A Next.js interface where annotators compare Model A vs Model B responses to a coding prompt. They can highlight text, rate each model on Factuality, Coding Accuracy, and Tone (1–5), select a winner, and add notes.
- **Async ingestion** — Submissions POST to a FastAPI endpoint which immediately enqueues the payload to Redis. A Celery worker consumes the queue and writes results to `annotations.jsonl`, keeping the API non-blocking under heavy load.
- **Stress test** — A script fires 100 concurrent requests at the ingestion endpoint to prove the queue handles high throughput without crashing.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, TypeScript, Tailwind CSS |
| API | Python, FastAPI |
| Queue / worker | Celery + Redis |
| Infrastructure | Docker, Docker Compose |

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (includes Docker Compose)

That's it. No local Python or Node install needed.

## Usage

**1. Clone and start everything**

```bash
git clone <repo-url>
cd afterquery-project
docker-compose up --build
```

Wait for all four services to start (`redis`, `api`, `worker`, `frontend`).

**2. Open the annotation UI**

```
http://localhost:3000
```

Enter your annotator ID, rate both models, select a winner, and hit **Submit Annotation**. The payload is queued instantly and processed in the background by the Celery worker.

**3. Check collected annotations**

Completed annotations are written to `backend/data/annotations.jsonl` (one JSON object per line) inside the Docker volume.

**4. Run the stress test** (optional)

In a separate terminal, with the stack already running:

```bash
pip install httpx
python stress_test.py
```

Fires 100 concurrent POST requests and prints throughput, average latency, and p99.

```
# Crank it up
python stress_test.py --n 500
```

## Project structure

```
afterquery-project/
├── docker-compose.yml        # Wires up all four services
├── stress_test.py            # Concurrency benchmark
├── backend/
│   ├── main.py               # FastAPI — POST /api/ingest
│   ├── worker.py             # Celery worker — processes queue
│   ├── requirements.txt
│   └── Dockerfile
└── frontend/
    ├── src/app/page.tsx      # RLHF annotation UI
    └── Dockerfile
```

## API

**`POST /api/ingest`** — accepts an annotation payload, enqueues it, returns immediately.

```json
{
  "task_id": "task_abc123",
  "annotator_id": "alice",
  "prompt": "...",
  "model_a_response": "...",
  "model_b_response": "...",
  "model_a_ratings": { "factuality": 4, "coding_accuracy": 3, "tone": 5 },
  "model_b_ratings": { "factuality": 5, "coding_accuracy": 5, "tone": 4 },
  "highlighted_ranges": [],
  "winner": "B",
  "time_spent_seconds": 87.4,
  "notes": "Model B handles the edge case correctly."
}
```

**`GET /health`** — returns `{"status": "ok"}`.

## Stopping

```bash
docker-compose down
```

To also delete the saved annotations volume:

```bash
docker-compose down -v
```
