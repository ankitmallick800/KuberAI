import re
from typing import Dict, Any, Tuple, Optional
from tools.ticker_utils import resolve_ticker_info
from tools.technical import get_technical_data

_SENTIMENT_PATTERNS = [
    (r"\bstrongly\s+positive\b|\bvery\s+positive\b|\bhighly\s+positive\b|\bstrongly\s+bullish\b", 88),
    (r"\bcautiously\s+positive\b|\bmildly\s+positive\b|\bslightly\s+positive\b|\bcautiously\s+bullish\b|\bmoderately\s+positive\b", 65),
    (r"\bpositive\b|\bbullish\b", 75),
    (r"\bstrongly\s+negative\b|\bvery\s+negative\b|\bhighly\s+negative\b|\bstrongly\s+bearish\b", 15),
    (r"\bcautiously\s+negative\b|\bmildly\s+negative\b|\bslightly\s+negative\b|\bcautiously\s+bearish\b|\bmoderately\s+negative\b", 35),
    (r"\bnegative\b|\bbearish\b", 25),
    (r"\bmixed\b|\bneutral\b", 50),
]

_LABEL_DISPLAY_MAP = {
    88: "Strongly Positive",
    75: "Positive",
    65: "Cautiously Positive",
    15: "Strongly Negative",
    25: "Negative",
    35: "Cautiously Negative",
    50: "Mixed / Neutral",
}

_SENTIMENT_BULLISH_KEYWORDS = [
    "beat", "surge", "record", "growth", "upgrade", "outperform", "bullish", "rally",
    "jump", "positive", "strong", "accelerat", "profit", "optimism", "expansion",
    "partnership", "breakthrough", "momentum", "buyback", "dividend hike"
]

_SENTIMENT_BEARISH_KEYWORDS = [
    "miss", "drop", "plunge", "downgrade", "bearish", "slump", "loss", "negative",
    "weak", "decline", "litigation", "investigation", "probe", "layoff", "warning",
    "headwind", "cut", "lawsuit", "regulatory risk", "margin compression"
]


def extract_sentiment(text) -> dict:
    if isinstance(text, list):
        text = " ".join(str(x) for x in text)
    elif not isinstance(text, str):
        text = str(text) if text is not None else ""

    if not text.strip():
        return {"score": 50, "label": "Mixed / Neutral"}

    text_lower = text.lower()

    # 1. Check for specific **Overall Sentiment** section
    section = re.search(
        r'\*\*overall sentiment\*\*[:\s]*(.+?)(?:\n\s*\*\*|$)',
        text_lower,
        re.DOTALL,
    )
    search_text = section.group(1) if section else text_lower

    for pattern, score in _SENTIMENT_PATTERNS:
        if re.search(pattern, search_text):
            label = _LABEL_DISPLAY_MAP.get(score, "Mixed / Neutral")
            return {"score": score, "label": label}

    # 2. Keyword fallback across entire sentiment text
    bull = sum(text_lower.count(w) for w in _SENTIMENT_BULLISH_KEYWORDS)
    bear = sum(text_lower.count(w) for w in _SENTIMENT_BEARISH_KEYWORDS)

    net_diff = bull - bear
    if net_diff >= 3:
        score, label = 85, "Strongly Positive"
    elif net_diff >= 1:
        score, label = 70, "Positive"
    elif net_diff <= -3:
        score, label = 20, "Strongly Negative"
    elif net_diff <= -1:
        score, label = 35, "Negative"
    else:
        score, label = 50, "Mixed / Neutral"

    return {"score": score, "label": label}


def sentiment_stance(text) -> dict:
    s = extract_sentiment(text)
    score = s["score"]
    stance = "bullish" if score >= 60 else ("bearish" if score <= 40 else "neutral")
    return {"score": score, "stance": stance}


def compute_fundamental_score(info: dict, text: str = "") -> int:
    """
    Fundamentals conviction score (0-100) calculated from financial statements,
    balance sheet ratios, and the analyst's verified findings.
    """
    score = 50

    # 1. Quantitative Metrics
    fcf = info.get("freeCashflow")
    if fcf is not None:
        try:
            score += 15 if float(fcf) > 0 else -15
        except Exception:
            pass

    dte = info.get("debtToEquity")
    if dte is not None:
        try:
            dte_val = float(dte)
            dte_val = dte_val / 100.0 if dte_val > 10 else dte_val
            score += 15 if dte_val < 1.0 else (8 if dte_val < 2.0 else (-8 if dte_val <= 3.0 else -15))
        except Exception:
            pass

    pm = info.get("profitMargins")
    if pm is not None:
        try:
            pm_val = float(pm)
            score += 12 if pm_val > 0.15 else (6 if pm_val > 0 else -12)
        except Exception:
            pass

    roe = info.get("returnOnEquity")
    if roe is not None:
        try:
            roe_val = float(roe)
            score += 10 if roe_val > 0.15 else (5 if roe_val > 0 else -10)
        except Exception:
            pass

    # 2. Semantic signals from fundamentals text
    if text:
        t_low = text.lower()
        if "revenue growth" in t_low or "revenue is growing" in t_low or "solid cash flow" in t_low:
            score += 5
        if "positive free cash flow" in t_low or "fcf is positive" in t_low:
            score += 5
        if "manageable leverage" in t_low or "low debt" in t_low:
            score += 5
        if "declining revenue" in t_low or "revenue is declining" in t_low or "margin compress" in t_low:
            score -= 5
        if "negative free cash flow" in t_low or "fcf is negative" in t_low or "cash burn" in t_low:
            score -= 5
        if "elevated leverage" in t_low or "high debt" in t_low or "debt-to-equity" in t_low and "exceeds" in t_low:
            score -= 5

    return max(5, min(95, score))


def fundamentals_stance(info: dict, text: str = "") -> dict:
    score = compute_fundamental_score(info, text)
    stance = "bullish" if score >= 55 else ("bearish" if score <= 45 else "neutral")
    return {"score": score, "stance": stance}


_INDUSTRY_BULLISH = [
    "tailwind", "growth", "expand", "strong", "strength", "leader", "robust",
    "momentum", "opportunity", "favorable", "outperform", "market share gain",
    "secular demand", "pricing power", "innovation", "moat"
]

_INDUSTRY_BEARISH = [
    "headwind", "pressure", "weak", "decline", "risk", "sluggish", "challeng",
    "cut", "downside", "volatile", "uncertain", "pricing pressure", "competition",
    "regulatory scrutiny", "tariff", "supply chain disruption", "slowdown"
]


def industry_stance(text) -> dict:
    """
    Industry stance computed from macro tailwinds vs headwinds and sector positioning.
    """
    if isinstance(text, list):
        text = " ".join(str(x) for x in text)
    elif not isinstance(text, str):
        text = str(text) if text is not None else ""

    if not text.strip():
        return {"score": 50, "stance": "neutral"}

    t = text.lower()
    bull = sum(t.count(w) for w in _INDUSTRY_BULLISH)
    bear = sum(t.count(w) for w in _INDUSTRY_BEARISH)

    score = max(5, min(95, 50 + (bull - bear) * 8))
    stance = "bullish" if score >= 55 else ("bearish" if score <= 45 else "neutral")
    return {"score": score, "stance": stance}


def technical_stance(tool_data, text: str = "") -> dict:
    """
    Technical stance derived from moving averages (SMA20/50/200), RSI momentum, and MACD trend.
    """
    combined = ""
    if tool_data:
        combined += "\n".join(str(x) for x in tool_data) if isinstance(tool_data, list) else str(tool_data)
    if text:
        combined += "\n" + ("\n".join(str(x) for x in text) if isinstance(text, list) else str(text))

    trend_m = re.search(r"Overall Technical Trend:\s*([A-Za-z\s/]+)", combined)
    raw_trend = trend_m.group(1).strip().lower() if trend_m else ""

    if "strong bullish" in raw_trend:
        score = 88
        stance = "bullish"
    elif "bullish" in raw_trend or "uptrend" in raw_trend:
        score = 72
        stance = "bullish"
    elif "strong bearish" in raw_trend:
        score = 15
        stance = "bearish"
    elif "bearish" in raw_trend or "downtrend" in raw_trend:
        score = 30
        stance = "bearish"
    else:
        # Evaluate technical indicators directly
        score = 50
        rsi_m = re.search(r"RSI\(14\):\s*([\d.]+)", combined)
        if rsi_m:
            try:
                rsi_val = float(rsi_m.group(1))
                if rsi_val > 55:
                    score += 15
                elif rsi_val < 45:
                    score -= 15
            except Exception:
                pass

        if "bullish momentum" in combined.lower() or "macd histogram: +" in combined.lower():
            score += 12
        elif "bearish momentum" in combined.lower() or "macd histogram: -" in combined.lower():
            score -= 12

        score = max(5, min(95, score))
        stance = "bullish" if score >= 55 else ("bearish" if score <= 45 else "neutral")

    return {"score": score, "stance": stance}


def agent_stances(ticker: str, state: dict) -> dict:
    """Derives the 4 agent stances (0-100 score + bullish/bearish/neutral) from real evidence."""
    stock, info, resolved_ticker = resolve_ticker_info(ticker)
    tech_tool = get_technical_data.invoke({"ticker": resolved_ticker})

    fund_text = state.get("fundamentals_analysis", "")
    sent_text = state.get("sentiment_analysis", "")
    ind_text = state.get("industry_analysis", "")
    tech_text = state.get("technical_analysis", "")

    return {
        "fundamentals": fundamentals_stance(info, fund_text),
        "sentiment": sentiment_stance(sent_text),
        "industry": industry_stance(ind_text),
        "technical": technical_stance(tech_tool, tech_text),
    }


def stance_split(agent_scores: dict):
    """Returns the most opposed (bullish, bearish) agent pair, or (None, None) if no split exists."""
    bulls = [k for k, v in agent_scores.items() if v.get("stance") == "bullish"]
    bears = [k for k, v in agent_scores.items() if v.get("stance") == "bearish"]
    if bulls and bears:
        # Pick the most extreme pair
        best_bull = max(bulls, key=lambda k: agent_scores[k].get("score", 50))
        best_bear = min(bears, key=lambda k: agent_scores[k].get("score", 50))
        return best_bull, best_bear
    return None, None


def generate_disagreement_payload(agent_scores: dict, state: dict, ticker: str) -> dict:
    """
    Constructs a structured debate point when specialists have conflicting stances.
    """
    agent_a, agent_b = stance_split(agent_scores)
    if not agent_a or not agent_b:
        return {"has_disagreement": False}

    titles = {
        "fundamentals": "Fundamentals (Atlas)",
        "sentiment": "Sentiment (Echo)",
        "industry": "Industry (Sector)",
        "technical": "Technicals (Vector)",
    }

    topic = f"{titles.get(agent_a, agent_a)} vs. {titles.get(agent_b, agent_b)} Valuation & Timing Conflict"

    claims = {
        "fundamentals": "Fundamental financial metrics and balance sheet strength indicate high intrinsic value.",
        "sentiment": "Media coverage and market narrative show strong momentum and positive near-term catalysts.",
        "industry": "Sector tailwinds and competitive market dynamics support continued expansion.",
        "technical": "Price momentum, moving averages, and technical indicators signal strong upward trend.",
    }

    bear_claims = {
        "fundamentals": "Elevated leverage or compressed margins suggest caution on long-term risk/reward.",
        "sentiment": "Recent news flow highlights negative press coverage, litigation, or demand concerns.",
        "industry": "Competitive pressures, regulatory risks, and macro headwinds threaten sector profitability.",
        "technical": "Overbought conditions or trend resistance indicate potential short-term pullback risks.",
    }

    score_a = agent_scores[agent_a].get("score", 75)
    score_b = agent_scores[agent_b].get("score", 35)

    return {
        "has_disagreement": True,
        "agent_a": agent_a,
        "agent_b": agent_b,
        "topic": topic,
        "claim_a": claims.get(agent_a, f"{agent_a.capitalize()} agent signals bullish positioning."),
        "claim_b": bear_claims.get(agent_b, f"{agent_b.capitalize()} agent signals cautious downside risk."),
        "reasoning": [
            f"{titles.get(agent_a, agent_a)} registered a conviction score of {score_a}/100 based on positive core drivers.",
            f"{titles.get(agent_b, agent_b)} registered a conviction score of {score_b}/100 emphasizing near-term frictions.",
            "The research agent weighed the stronger read against the weaker one.",
        ],
        "resolution": "Reconciled into one call, with confidence lowered where the lenses conflict.",
    }
