"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import clsx from "clsx";

// ─── Types ────────────────────────────────────────────────────────────────────

type ModelKey = "A" | "B";

interface Highlight {
  model: ModelKey;
  start: number;
  end: number;
  text: string;
}

interface Ratings {
  factuality: number;
  coding_accuracy: number;
  tone: number;
}

const DEFAULT_RATINGS: Ratings = { factuality: 0, coding_accuracy: 0, tone: 0 };

// ─── Sample task data ─────────────────────────────────────────────────────────

const TASK = {
  id: "task_a3f92b1c",
  prompt: `Implement a Python class \`LinkedList\` with the following methods:
  - append(value)   — add a node at the tail
  - prepend(value)  — add a node at the head
  - delete(value)   — remove the first node with this value
  - search(value)   — return True/False

Include proper edge-case handling (empty list, missing element, duplicates) and annotate the time complexity of each operation.`,

  modelA: `class Node:
    def __init__(self, data):
        self.data = data
        self.next = None

class LinkedList:
    def __init__(self):
        self.head = None

    def append(self, value):
        new_node = Node(value)
        if self.head is None:
            self.head = new_node
            return
        current = self.head
        while current.next:
            current = current.next
        current.next = new_node  # O(n)

    def prepend(self, value):
        new_node = Node(value)
        new_node.next = self.head
        self.head = new_node  # O(1)

    def delete(self, value):
        current = self.head
        prev = None
        while current:
            if current.data == value:
                if prev:
                    prev.next = current.next
                current = current.next
                return
            prev = current
            current = current.next
        # silently ignores missing values

    def search(self, value):
        current = self.head
        while current:
            if current.data == value:
                return True
            current = current.next
        return False  # O(n)`,

  modelB: `from __future__ import annotations
from typing import Any, Optional


class _Node:
    __slots__ = ("data", "next")

    def __init__(self, data: Any) -> None:
        self.data = data
        self.next: Optional[_Node] = None


class LinkedList:
    """Singly linked list with O(1) prepend and O(n) append/delete/search."""

    def __init__(self) -> None:
        self._head: Optional[_Node] = None

    # O(n) — must walk to the tail
    def append(self, value: Any) -> None:
        node = _Node(value)
        if self._head is None:
            self._head = node
            return
        cur = self._head
        while cur.next:
            cur = cur.next
        cur.next = node

    # O(1) — update head pointer only
    def prepend(self, value: Any) -> None:
        node = _Node(value)
        node.next = self._head
        self._head = node

    # O(n) — linear scan; raises ValueError on missing element
    def delete(self, value: Any) -> None:
        if self._head is None:
            raise ValueError("delete from empty list")
        if self._head.data == value:
            self._head = self._head.next
            return
        prev, cur = self._head, self._head.next
        while cur:
            if cur.data == value:
                prev.next = cur.next
                return
            prev, cur = cur, cur.next
        raise ValueError(f"{value!r} not found in list")

    # O(n) — linear scan
    def search(self, value: Any) -> bool:
        cur = self._head
        while cur:
            if cur.data == value:
                return True
            cur = cur.next
        return False`,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60)
    .toString()
    .padStart(2, "0");
  const s = (secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function applyHighlights(
  text: string,
  highlights: Highlight[],
  model: ModelKey
): React.ReactNode[] {
  const relevant = highlights
    .filter((h) => h.model === model)
    .sort((a, b) => a.start - b.start);

  const nodes: React.ReactNode[] = [];
  let cursor = 0;

  for (const h of relevant) {
    if (h.start > cursor) nodes.push(text.slice(cursor, h.start));
    nodes.push(
      <mark
        key={`${h.model}-${h.start}-${h.end}`}
        className={model === "A" ? "highlight-a" : "highlight-b"}
        title={`Highlighted: "${h.text}"`}
      >
        {text.slice(h.start, h.end)}
      </mark>
    );
    cursor = h.end;
  }

  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function RatingRow({
  label,
  value,
  model,
  onChange,
}: {
  label: string;
  value: number;
  model: ModelKey;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-xs text-slate-500 w-28 shrink-0">{label}</span>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            onClick={() => onChange(n)}
            className={clsx(
              "rating-btn",
              value === n && (model === "A" ? "selected-a" : "selected-b")
            )}
            aria-label={`${label} ${n}`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AnnotationPage() {
  const [annotatorId, setAnnotatorId] = useState("");
  const [ratingsA, setRatingsA] = useState<Ratings>({ ...DEFAULT_RATINGS });
  const [ratingsB, setRatingsB] = useState<Ratings>({ ...DEFAULT_RATINGS });
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [winner, setWinner] = useState<"A" | "B" | "tie" | "">("");
  const [notes, setNotes] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const startRef = useRef<number>(Date.now());
  const refA = useRef<HTMLDivElement>(null);
  const refB = useRef<HTMLDivElement>(null);

  // Timer
  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      if (e.key === "a" || e.key === "A") setWinner("A");
      if (e.key === "b" || e.key === "B") setWinner("B");
      if (e.key === "t" || e.key === "T") setWinner("tie");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const captureSelection = useCallback((model: ModelKey) => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const container = model === "A" ? refA.current : refB.current;
    if (!container || !container.contains(range.commonAncestorContainer)) return;

    // Calculate char offset from start of container text content
    const preRange = range.cloneRange();
    preRange.selectNodeContents(container);
    preRange.setEnd(range.startContainer, range.startOffset);
    const start = preRange.toString().length;
    const selectedText = sel.toString();
    if (selectedText.trim().length === 0) return;

    const h: Highlight = { model, start, end: start + selectedText.length, text: selectedText };
    setHighlights((prev) => {
      const dup = prev.some((x) => x.model === model && x.start === h.start && x.end === h.end);
      return dup ? prev : [...prev, h];
    });
    sel.removeAllRanges();
  }, []);

  const patchRating = (
    setter: React.Dispatch<React.SetStateAction<Ratings>>,
    key: keyof Ratings,
    val: number
  ) => setter((prev) => ({ ...prev, [key]: val }));

  const ratingsComplete =
    Object.values(ratingsA).every((v) => v > 0) &&
    Object.values(ratingsB).every((v) => v > 0);

  const canSubmit = ratingsComplete && winner !== "" && status === "idle";

  async function handleSubmit() {
    if (!canSubmit) return;
    setStatus("submitting");
    setErrorMsg("");

    const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

    const payload = {
      task_id: TASK.id,
      annotator_id: annotatorId.trim() || "anonymous",
      prompt: TASK.prompt,
      model_a_response: TASK.modelA,
      model_b_response: TASK.modelB,
      model_a_ratings: ratingsA,
      model_b_ratings: ratingsB,
      highlighted_ranges: highlights,
      winner,
      time_spent_seconds: elapsed,
      notes,
    };

    try {
      const res = await fetch(`${API}/api/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus("success");
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Unknown error");
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (status === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-5xl">✓</div>
          <h2 className="text-2xl font-bold text-slate-800">Annotation submitted</h2>
          <p className="text-slate-500">
            Queued to pipeline in {formatTime(elapsed)} · Winner: Model {winner.toUpperCase()}
          </p>
          <button
            onClick={() => {
              setRatingsA({ ...DEFAULT_RATINGS });
              setRatingsB({ ...DEFAULT_RATINGS });
              setHighlights([]);
              setWinner("");
              setNotes("");
              setElapsed(0);
              startRef.current = Date.now();
              setStatus("idle");
            }}
            className="mt-4 px-6 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700 text-sm"
          >
            Next task
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto px-4 pb-12">
      {/* ── Header ── */}
      <header className="sticky top-0 z-20 bg-slate-50/95 backdrop-blur border-b border-slate-200 py-3 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold tracking-widest text-slate-400 uppercase">
              AfterQuery
            </span>
            <span className="h-4 w-px bg-slate-300" />
            <span className="text-xs text-slate-500">RLHF Evaluation</span>
            <span className="h-4 w-px bg-slate-300" />
            <code className="text-xs bg-slate-100 border border-slate-200 px-2 py-0.5 rounded text-slate-600">
              {TASK.id}
            </code>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              {highlights.length > 0 && (
                <span className="text-xs text-slate-500">
                  {highlights.length} highlight{highlights.length > 1 ? "s" : ""}
                </span>
              )}
            </div>
            <div
              className={clsx(
                "font-mono text-sm px-3 py-1 rounded-full border font-semibold",
                elapsed > 600
                  ? "text-amber-700 bg-amber-50 border-amber-200"
                  : "text-slate-600 bg-white border-slate-200"
              )}
            >
              {formatTime(elapsed)}
            </div>
          </div>
        </div>
      </header>

      {/* ── Prompt ── */}
      <section className="mb-6 bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Prompt</p>
        <pre className="text-sm text-slate-800 whitespace-pre-wrap font-sans leading-relaxed">
          {TASK.prompt}
        </pre>
      </section>

      {/* ── Responses ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
        {(["A", "B"] as ModelKey[]).map((model) => {
          const isA = model === "A";
          const text = isA ? TASK.modelA : TASK.modelB;
          const ratings = isA ? ratingsA : ratingsB;
          const ref = isA ? refA : refB;
          const setter = isA ? setRatingsA : setRatingsB;
          const accentBorder = isA ? "border-blue-200" : "border-violet-200";
          const accentHeader = isA
            ? "bg-blue-600 text-white"
            : "bg-violet-600 text-white";

          return (
            <div
              key={model}
              className={clsx(
                "bg-white border rounded-xl shadow-sm overflow-hidden",
                accentBorder
              )}
            >
              {/* panel header */}
              <div className={clsx("px-4 py-2.5 flex items-center justify-between", accentHeader)}>
                <span className="text-sm font-bold tracking-wide">Model {model}</span>
                <span className="text-xs opacity-80">Select text to highlight</span>
              </div>

              {/* response text */}
              <div className="p-4 border-b border-slate-100">
                <div
                  ref={ref}
                  className="response-text text-slate-700"
                  onMouseUp={() => captureSelection(model)}
                >
                  {applyHighlights(text, highlights, model)}
                </div>
              </div>

              {/* ratings */}
              <div className="p-4 space-y-0.5">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">
                  Ratings
                </p>
                <RatingRow
                  label="Factuality"
                  value={ratings.factuality}
                  model={model}
                  onChange={(v) => patchRating(setter, "factuality", v)}
                />
                <RatingRow
                  label="Coding Accuracy"
                  value={ratings.coding_accuracy}
                  model={model}
                  onChange={(v) => patchRating(setter, "coding_accuracy", v)}
                />
                <RatingRow
                  label="Tone"
                  value={ratings.tone}
                  model={model}
                  onChange={(v) => patchRating(setter, "tone", v)}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Footer: winner + notes + submit ── */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-5">
        {/* annotator id */}
        <div>
          <label
            htmlFor="annotator-id"
            className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2"
          >
            Your Annotator ID
          </label>
          <input
            id="annotator-id"
            type="text"
            value={annotatorId}
            onChange={(e) => setAnnotatorId(e.target.value)}
            placeholder="e.g. alice, user_42 (leave blank for anonymous)"
            className="w-full max-w-sm text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>

        {/* winner */}
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">
            Winner <span className="normal-case font-normal text-slate-400">(A / T / B)</span>
          </p>
          <div className="flex items-center gap-3">
            {(["A", "tie", "B"] as const).map((w) => (
              <button
                key={w}
                onClick={() => setWinner(w)}
                className={clsx("winner-btn", `winner-${w}`, winner === w && "active")}
                aria-pressed={winner === w}
              >
                {w === "tie" ? "Tie" : `Model ${w}`}
              </button>
            ))}
          </div>
        </div>

        {/* notes */}
        <div>
          <label
            htmlFor="notes"
            className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2"
          >
            Notes (optional)
          </label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Any observations about this comparison..."
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
          />
        </div>

        {/* submit row */}
        <div className="flex items-center justify-between gap-4 pt-1">
          <div className="text-xs text-slate-400 space-y-0.5">
            {!ratingsComplete && <p>· Complete all ratings for both models</p>}
            {winner === "" && <p>· Select a winner</p>}
          </div>

          <div className="flex items-center gap-3">
            {highlights.length > 0 && (
              <button
                onClick={() => setHighlights([])}
                className="text-xs text-slate-400 hover:text-slate-600 underline"
              >
                Clear highlights
              </button>
            )}

            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className={clsx(
                "px-8 py-2.5 rounded-lg text-sm font-bold tracking-wide transition-all",
                canSubmit
                  ? "bg-slate-900 text-white hover:bg-slate-700 shadow-sm"
                  : "bg-slate-100 text-slate-400 cursor-not-allowed"
              )}
            >
              {status === "submitting" ? "Submitting…" : "Submit Annotation"}
            </button>
          </div>
        </div>

        {status === "error" && (
          <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded px-3 py-2">
            Submission failed: {errorMsg} — is the backend running?
          </p>
        )}
      </div>

      {/* ── Keyboard hint bar ── */}
      <p className="text-center text-xs text-slate-300 mt-4">
        Keyboard: <kbd className="px-1 py-0.5 bg-slate-100 rounded text-slate-400">A</kbd> Model A ·{" "}
        <kbd className="px-1 py-0.5 bg-slate-100 rounded text-slate-400">T</kbd> Tie ·{" "}
        <kbd className="px-1 py-0.5 bg-slate-100 rounded text-slate-400">B</kbd> Model B
      </p>
    </div>
  );
}
