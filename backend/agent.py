"""One Groq research agent. Tools gather market data; a single model call writes the report."""

import json
import os
import re
from concurrent.futures import ThreadPoolExecutor, as_completed

from dotenv import load_dotenv
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_groq import ChatGroq

from guardrails.output_guardrails import clean_json_output
from tools.fundamentals import get_fundamentals
from tools.scoring import (
    fundamentals_stance,
    generate_disagreement_payload,
    industry_stance,
    sentiment_stance,
    technical_stance,
)
from tools.search import get_industry_context, get_sentiment
from tools.technical import get_technical_data
from tools.ticker_utils import resolve_ticker_info

load_dotenv()

PROMPTS_DIR = os.path.join(os.path.dirname(__file__), "prompts")
DEFAULT_MODEL = "openai/gpt-oss-20b"
CLIP = 1600

LENSES = (
    ("fundamentals", "Fundamentals", lambda ticker: get_fundamentals.invoke({"ticker": ticker})),
    ("sentiment", "Sentiment", lambda ticker: get_sentiment.invoke({"ticker": ticker})),
    ("industry", "Industry", lambda ticker: get_industry_context.invoke({"ticker": ticker})),
    ("technical", "Technicals", lambda ticker: get_technical_data.invoke({"ticker": ticker})),
)


def scrub(text: str) -> str:
    """Strip anything that looks like a Groq key before it can reach the client."""
    cleaned = re.sub(r"gsk_[A-Za-z0-9_\-]+", "[redacted]", text or "")
    return cleaned[:400]


def server_api_key() -> str:
    key = (os.getenv("GROQ_API_KEY") or "").strip()
    if len(key) < 10:
        raise RuntimeError("GROQ_API_KEY is not set on the server.")
    return key


def _clip(text: str, limit: int = CLIP) -> str:
    text = (text or "").strip()
    if len(text) <= limit:
        return text or "No data returned."
    return text[:limit] + "\n…[truncated]"


def _first_line(text: str, fallback: str) -> str:
    for line in (text or "").splitlines():
        line = line.strip().lstrip("#").strip()
        if line:
            return line[:180]
    return fallback


def _load_prompt() -> str:
    path = os.path.join(PROMPTS_DIR, "analyst.txt")
    with open(path, "r", encoding="utf-8") as handle:
        return handle.read()


def _fetch_lens(ticker: str, label: str, fn) -> str:
    try:
        raw = fn(ticker)
        text = raw if isinstance(raw, str) else str(raw)
        return text.strip() or f"{label}: no data returned."
    except Exception as exc:
        return f"Note: {label} data was unavailable ({scrub(str(exc))})."


def _as_text(content) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for part in content:
            if isinstance(part, str):
                parts.append(part)
            elif isinstance(part, dict):
                parts.append(str(part.get("text") or part.get("content") or ""))
            elif hasattr(part, "text"):
                parts.append(str(getattr(part, "text")))
            else:
                parts.append(str(part))
        return "\n".join(p for p in parts if p)
    return str(content) if content is not None else ""


def _parse_model_json(raw: str) -> dict:
    cleaned = clean_json_output(raw)
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", cleaned, re.DOTALL)
        data = json.loads(match.group(0)) if match else {}
    return data if isinstance(data, dict) else {}


def run_analysis(ticker: str, emit) -> dict:
    """
    Fetch the four data lenses, call Groq once, and return the state main.py turns into a report.
    `emit(event_type, payload)` streams progress. The API key never leaves this process.
    """
    api_key = server_api_key()
    model = (os.getenv("GROQ_MODEL") or DEFAULT_MODEL).strip() or DEFAULT_MODEL

    emit("supervisor_start", {"ticker": ticker})

    for lens_id, _label, _fn in LENSES:
        emit("agent_running", {"agent": lens_id})

    tool_text = {}
    had_partial = False
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = {
            pool.submit(_fetch_lens, ticker, label, fn): lens_id
            for lens_id, label, fn in LENSES
        }
        for future in as_completed(futures):
            lens_id = futures[future]
            text = future.result()
            tool_text[lens_id] = text
            if text.startswith("Note:"):
                had_partial = True
            emit("agent_log", {"agent": lens_id, "line": _first_line(text, "Data collected.")})

    _, info, _resolved = resolve_ticker_info(ticker)
    scores = {
        "fundamentals": fundamentals_stance(info, tool_text.get("fundamentals", "")),
        "sentiment": sentiment_stance(tool_text.get("sentiment", "")),
        "industry": industry_stance(tool_text.get("industry", "")),
        "technical": technical_stance(tool_text.get("technical", ""), ""),
    }
    stance_lines = "\n".join(
        f"- {name}: {row['stance']} (score {row['score']})" for name, row in scores.items()
    )

    emit("synthesis_start", {})
    prompt = (
        _load_prompt()
        .replace("<<TICKER>>", ticker)
        .replace("<<STANCES>>", stance_lines)
        .replace("<<FUNDAMENTALS>>", _clip(tool_text.get("fundamentals", "")))
        .replace("<<SENTIMENT>>", _clip(tool_text.get("sentiment", "")))
        .replace("<<INDUSTRY>>", _clip(tool_text.get("industry", "")))
        .replace("<<TECHNICAL>>", _clip(tool_text.get("technical", "")))
    )

    llm = ChatGroq(model=model, api_key=api_key, temperature=0, max_tokens=1400)
    response = llm.invoke([
        SystemMessage(content=prompt),
        HumanMessage(content=f"Write the research note for {ticker}."),
    ])
    content = _as_text(response.content)
    parsed = _parse_model_json(content)

    sections = {}
    for lens_id, label, _fn in LENSES:
        written = parsed.get(lens_id)
        if not isinstance(written, str) or not written.strip():
            written = _first_line(tool_text.get(lens_id, ""), f"{label} data collected.")
            had_partial = True
        sections[lens_id] = written.strip()
        emit("agent_log", {"agent": lens_id, "line": _first_line(written, f"{label} complete.")})
        emit("agent_complete", {"agent": lens_id})

    verdict = parsed.get("verdict") if isinstance(parsed.get("verdict"), dict) else {}
    synthesis = parsed.get("synthesis") if isinstance(parsed.get("synthesis"), dict) else {}
    paragraphs = synthesis.get("paragraphs")
    if not isinstance(paragraphs, list) or not paragraphs:
        paragraphs = [
            sections["fundamentals"],
            sections["sentiment"],
            sections["industry"],
            sections["technical"],
        ]
        synthesis = {**synthesis, "paragraphs": paragraphs}

    disagreement = parsed.get("disagreement")
    if not isinstance(disagreement, dict) or not disagreement.get("has_disagreement"):
        disagreement = generate_disagreement_payload(
            scores,
            {
                "fundamentals_analysis": sections["fundamentals"],
                "sentiment_analysis": sections["sentiment"],
                "industry_analysis": sections["industry"],
                "technical_analysis": sections["technical"],
            },
            ticker,
        )

    headline = str(verdict.get("headline") or "Analysis complete.")
    emit("synthesis_log", {"line": headline})
    reasoning = str(verdict.get("reasoning") or "")
    if reasoning:
        emit("synthesis_log", {"line": reasoning})

    final_report = {
        "verdict": verdict,
        "disagreement": disagreement,
        "synthesis": synthesis,
    }

    return {
        "ticker": ticker,
        "fundamentals_analysis": sections["fundamentals"],
        "sentiment_analysis": sections["sentiment"],
        "industry_analysis": sections["industry"],
        "technical_analysis": sections["technical"],
        "fundamentals_tool": tool_text.get("fundamentals", ""),
        "agent_scores": scores,
        "final_report": json.dumps(final_report),
        "hadPartialFailure": had_partial,
    }
