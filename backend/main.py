import json
import re
import queue
import asyncio
from datetime import datetime, timezone

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

load_dotenv()

from agent import run_analysis, scrub
from tools.scoring import extract_sentiment, generate_disagreement_payload
from tools.ticker_utils import resolve_ticker_info, search_companies
from guardrails.input_guardrails import validate_ticker_input
from guardrails.output_guardrails import apply_output_guardrails, clean_json_output

app = FastAPI(title="KuberAI Research API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AnalyzeRequest(BaseModel):
    ticker: str


def sse(event_type: str, data: dict):
    return {"event": event_type, "data": json.dumps(data, default=str)}


def _metrics_from_tool(tool_data: str) -> dict:
    def grab(label: str) -> str:
        match = re.search(rf"{label}:\s*([^\n]+)", tool_data or "")
        if match and match.group(1).strip() and match.group(1).strip() != "N/A":
            return match.group(1).strip()
        return "N/A"

    return {
        "revenue": grab("Total Revenue"),
        "netIncome": grab("Net Income"),
        "freeCashFlow": grab("Free Cash Flow"),
        "debtToEquity": grab("Debt-to-Equity Ratio"),
    }


def _safe_str(val) -> str:
    if isinstance(val, list):
        return "\n".join(str(x) for x in val)
    if val is None:
        return ""
    return str(val)


def build_report(state: dict, ticker: str) -> dict:
    _stock, info, resolved_ticker = resolve_ticker_info(ticker)
    company_name = info.get("longName") or info.get("shortName") or resolved_ticker
    sector = info.get("sector") or info.get("industry") or "N/A"
    fund_data = _metrics_from_tool(state.get("fundamentals_tool", ""))

    price = info.get("currentPrice") or info.get("regularMarketPrice") or info.get("previousClose") or 0
    prev_close = info.get("previousClose")
    change_percent = info.get("regularMarketChangePercent")
    if change_percent is None and prev_close:
        change_percent = ((price - prev_close) / prev_close) * 100 if prev_close else 0
    change_percent = round((change_percent or 0), 2)

    final_report_str = _safe_str(state.get("final_report", ""))
    synthesis_data = {}
    if final_report_str:
        cleaned_json = clean_json_output(final_report_str)
        try:
            synthesis_data = json.loads(cleaned_json)
        except json.JSONDecodeError:
            match = re.search(r"\{.*\}", cleaned_json, re.DOTALL)
            if match:
                try:
                    synthesis_data = json.loads(match.group(0))
                except json.JSONDecodeError:
                    synthesis_data = {}

    verdict = synthesis_data.get("verdict", {})
    synthesis = synthesis_data.get("synthesis", {})

    fundamentals_text = _safe_str(state.get("fundamentals_analysis", ""))
    sentiment_text = _safe_str(state.get("sentiment_analysis", ""))
    industry_text = _safe_str(state.get("industry_analysis", ""))
    technical_text = _safe_str(state.get("technical_analysis", ""))

    agent_scores = state.get("agent_scores") or {}
    disagreement = synthesis_data.get("disagreement")
    disagreement_ready = (
        isinstance(disagreement, dict)
        and disagreement.get("has_disagreement")
        and disagreement.get("topic")
        and disagreement.get("claim_a")
        and disagreement.get("claim_b")
    )
    if not disagreement_ready:
        disagreement = generate_disagreement_payload(agent_scores, state, resolved_ticker)

    raw_report = {
        "ticker": resolved_ticker,
        "companyName": company_name,
        "sector": sector,
        "market": {
            "price": round(float(price or 0), 2),
            "change": change_percent,
        },
        "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "verdict": {
            "signal": verdict.get("signal", "Hold"),
            "headline": verdict.get("headline", "Analysis complete."),
            "reasoning": verdict.get("reasoning", ""),
            "confidence": verdict.get("confidence", 50),
        },
        "agentScores": agent_scores,
        "disagreement": disagreement,
        "fundamentals": {
            "revenue": fund_data["revenue"],
            "netIncome": fund_data["netIncome"],
            "freeCashFlow": fund_data["freeCashFlow"],
            "debtToEquity": fund_data["debtToEquity"],
            "revenueHistory": [],
            "summary": fundamentals_text,
        },
        "sentiment": {
            **extract_sentiment(sentiment_text),
            "summary": sentiment_text,
            "headlines": [],
        },
        "industry": {
            "positioning": industry_text,
            "comparables": [],
            "summary": industry_text,
        },
        "technical": {
            "summary": technical_text,
        },
        "synthesis": {
            "paragraphs": synthesis.get("paragraphs", [final_report_str]),
            "contributions": synthesis.get(
                "contributions",
                [
                    {"agent": "fundamentals", "weight": "Primary", "note": "Financial health"},
                    {"agent": "sentiment", "weight": "Reinforcing", "note": "News tone"},
                    {"agent": "industry", "weight": "Calibrating", "note": "Sector context"},
                    {"agent": "technical", "weight": "Reinforcing", "note": "Price trend"},
                ],
            ),
        },
        "hadPartialFailure": bool(state.get("hadPartialFailure")),
    }

    return apply_output_guardrails(raw_report)


_SENTINEL = object()


def _run_sync(ticker: str, event_q: queue.Queue):
    def emit(event_type: str, data: dict):
        event_q.put(sse(event_type, data))

    try:
        state = run_analysis(ticker, emit)
        event_q.put(sse("report_ready", {"report": build_report(state, ticker)}))
    except Exception as exc:
        event_q.put(sse("agent_error", {
            "agent": "analyst",
            "note": f"The analysis failed: {scrub(str(exc))}",
        }))
    finally:
        event_q.put(_SENTINEL)


@app.get("/")
def read_root():
    return {"status": "KuberAI research agent is running."}


@app.get("/suggest")
def suggest(q: str = ""):
    return {"results": search_companies(q)}


@app.post("/analyze")
async def analyze_stock(req: AnalyzeRequest):
    is_valid, sanitized_ticker, ticker_err = validate_ticker_input(req.ticker)
    if not is_valid:
        async def err_generator():
            yield sse("agent_error", {
                "agent": "analyst",
                "note": f"Input rejected: {ticker_err}",
            })
            yield sse("done", {"message": "Stopped."})
        return EventSourceResponse(err_generator())

    event_q: queue.Queue = queue.Queue()

    async def event_generator():
        loop = asyncio.get_event_loop()
        thread_future = loop.run_in_executor(None, _run_sync, sanitized_ticker, event_q)

        while True:
            try:
                item = event_q.get_nowait()
            except queue.Empty:
                await asyncio.sleep(0.05)
                continue

            if item is _SENTINEL:
                break
            yield item

        await thread_future
        yield sse("done", {"message": "Analysis complete."})

    return EventSourceResponse(event_generator())
