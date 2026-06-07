"""Stock Tracker backend.

A thin backend-for-frontend: it holds the OpenAI API key server-side, proxies the
AI calls the frontend makes (POST /api/complete), and serves the static frontend.

The key is read from the environment (see .env.example) and is NEVER sent to the
browser. Only the `frontend/` directory is served as static files, so secrets in
the project root (.env, this file) are not reachable over HTTP.

Run:  uvicorn main:app --reload --port 8000
"""

import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

load_dotenv()

# --- configuration (override in .env) -------------------------------------
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
# Model for structured text (AI Insight, Daily Digest). Confirm the exact ID
# against OpenAI's current model list before relying on it.
TEXT_MODEL = os.environ.get("OPENAI_MODEL", "gpt-5.4-nano-2026-03-17")
# Web search needs a reasoning-capable model; OpenAI recommends gpt-5.5.
WEB_SEARCH_MODEL = os.environ.get("OPENAI_WEB_SEARCH_MODEL", "gpt-5.5")
# Web search result context: low | medium | high (cost/latency vs. detail).
SEARCH_CONTEXT_SIZE = os.environ.get("OPENAI_SEARCH_CONTEXT_SIZE", "low")

app = FastAPI(title="Stock Tracker API")

_client = None


def get_client():
    """Lazily build the OpenAI client; returns None if no key is configured."""
    global _client
    if not OPENAI_API_KEY:
        return None
    if _client is None:
        from openai import OpenAI

        _client = OpenAI(api_key=OPENAI_API_KEY)
    return _client


class CompleteRequest(BaseModel):
    prompt: str
    web_search: bool = False


class CompleteResponse(BaseModel):
    text: str


@app.get("/api/health")
def health():
    return {
        "ok": True,
        "openai_configured": bool(OPENAI_API_KEY),
        "text_model": TEXT_MODEL,
        "web_search_model": WEB_SEARCH_MODEL,
    }


@app.post("/api/complete", response_model=CompleteResponse)
def complete(req: CompleteRequest):
    """Single LLM completion. Uses the web_search tool when requested.

    On any failure (no key, OpenAI error) we return a non-2xx status; the frontend
    catches it and renders its deterministic local fallback, so the UI never breaks.
    """
    client = get_client()
    if client is None:
        raise HTTPException(status_code=503, detail="OPENAI_API_KEY not configured")

    # Build the Responses API call. Web search runs as a hosted tool.
    kwargs = {"model": TEXT_MODEL, "input": req.prompt}
    if req.web_search:
        kwargs["model"] = WEB_SEARCH_MODEL
        kwargs["tools"] = [
            {"type": "web_search", "search_context_size": SEARCH_CONTEXT_SIZE}
        ]
        # web_search needs a reasoning model; keep effort low for latency/cost.
        kwargs["reasoning"] = {"effort": "low"}

    try:
        resp = client.responses.create(**kwargs)
    except Exception as exc:  # noqa: BLE001 - surface a clean 502 to the client
        raise HTTPException(status_code=502, detail=f"OpenAI request failed: {exc}")

    return CompleteResponse(text=resp.output_text or "")


# Serve the static frontend. Mounted last so /api/* routes take precedence.
# Only `frontend/` is exposed — the project root (with .env) stays private.
_FRONTEND_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "frontend")
app.mount("/", StaticFiles(directory=_FRONTEND_DIR, html=True), name="static")
