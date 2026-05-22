from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional
from worker import process_annotation

app = FastAPI(title="AfterQuery Data Ingestion API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class HighlightedRange(BaseModel):
    model: str
    start: int
    end: int
    text: str


class ModelRatings(BaseModel):
    factuality: int = Field(..., ge=1, le=5)
    coding_accuracy: int = Field(..., ge=1, le=5)
    tone: int = Field(..., ge=1, le=5)


class AnnotationPayload(BaseModel):
    task_id: str
    annotator_id: Optional[str] = "anonymous"
    prompt: str
    model_a_response: str
    model_b_response: str
    model_a_ratings: ModelRatings
    model_b_ratings: ModelRatings
    highlighted_ranges: list[HighlightedRange] = []
    winner: str
    time_spent_seconds: float
    notes: Optional[str] = ""


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/api/ingest")
async def ingest_annotation(payload: AnnotationPayload):
    try:
        task = process_annotation.delay(payload.model_dump())
        return {
            "status": "queued",
            "task_id": task.id,
            "message": "Annotation enqueued successfully",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
