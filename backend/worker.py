import os
import json
from datetime import datetime, timezone
from celery import Celery

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

celery_app = Celery(
    "afterquery_worker",
    broker=REDIS_URL,
    backend=REDIS_URL,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
)

DATA_DIR = os.getenv("DATA_DIR", "/app/data")
os.makedirs(DATA_DIR, exist_ok=True)


@celery_app.task(bind=True, max_retries=3)
def process_annotation(self, payload: dict):
    """Simulate a serverless cloud function consuming annotation data from the queue."""
    try:
        record = {
            "processed_at": datetime.now(timezone.utc).isoformat(),
            "celery_task_id": self.request.id,
            **payload,
        }

        output_path = os.path.join(DATA_DIR, "annotations.jsonl")
        with open(output_path, "a") as f:
            f.write(json.dumps(record) + "\n")

        print(
            f"[WORKER] ✓ task_id={payload.get('task_id')} "
            f"winner={payload.get('winner')} "
            f"time={payload.get('time_spent_seconds', 0):.1f}s",
            flush=True,
        )
        return {"status": "processed", "task_id": payload.get("task_id")}

    except Exception as exc:
        print(f"[WORKER] ✗ retry {self.request.retries}: {exc}", flush=True)
        raise self.retry(exc=exc, countdown=2 ** self.request.retries)
