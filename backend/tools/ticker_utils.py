import time
import yfinance as yf
from typing import Dict, Any, Tuple, Optional
from ddgs import DDGS

def search_companies(query: str, limit: int = 8) -> list:
    """Match a typed name or ticker to company name + symbol."""
    cleaned = " ".join((query or "").split())
    if not cleaned or len(cleaned) > 80 or any(ord(ch) < 32 for ch in cleaned):
        return []

    try:
        found = yf.Search(cleaned, max_results=max(limit, 8))
        quotes = found.quotes or []
    except Exception:
        return []

    results = []
    seen = set()
    for quote in quotes:
        if not isinstance(quote, dict):
            continue
        if quote.get("quoteType") not in (None, "EQUITY"):
            continue
        symbol = str(quote.get("symbol") or "").strip().upper()
        name = str(quote.get("longname") or quote.get("shortname") or "").strip()
        if not symbol or not name or symbol in seen:
            continue
        seen.add(symbol)
        results.append({
            "ticker": symbol,
            "name": name,
            "exchange": str(quote.get("exchDisp") or "").strip(),
        })
        if len(results) >= limit:
            break
    return results


def retry_yf_call(fn, max_retries=2, delay=0.5):
    for attempt in range(max_retries):
        try:
            return fn()
        except Exception as e:
            if attempt < max_retries - 1:
                time.sleep(delay)
                continue
            raise e

def resolve_ticker_info(ticker: str) -> Tuple[Optional[yf.Ticker], Dict[str, Any], str]:
    """
    Resolves yfinance Ticker object, info dict, and the verified ticker string.
    Auto-detects exchange suffixes (e.g. .NS for Indian stocks if base ticker yields no data).
    Uses native yfinance session management for zero rate-limiting errors.
    """
    clean_ticker = ticker.strip().upper()
    
    candidates = [clean_ticker]
    if "." not in clean_ticker and not clean_ticker.endswith("-USD"):
        candidates.append(f"{clean_ticker}.NS")

    for cand in candidates:
        try:
            stock = yf.Ticker(cand)
            fast_info = getattr(stock, "fast_info", None)
            
            # Check fast_info first
            last_price = None
            if fast_info:
                try:
                    last_price = fast_info.last_price
                except Exception:
                    last_price = None

            if last_price is not None and last_price > 0:
                info = {}
                try:
                    info = stock.info or {}
                except Exception:
                    info = {}

                # Enrich info with fast_info defaults if missing
                if not info.get("currency") and getattr(fast_info, "currency", None):
                    info["currency"] = fast_info.currency
                if not info.get("marketCap") and getattr(fast_info, "market_cap", None):
                    info["marketCap"] = fast_info.market_cap

                return stock, info, cand
        except Exception:
            continue

    # Fallback for base ticker
    stock = yf.Ticker(clean_ticker)
    info = {}
    try:
        info = stock.info or {}
    except Exception:
        info = {}
    return stock, info, clean_ticker

def format_currency_symbol(curr_code: Optional[str]) -> str:
    if not curr_code:
        return "$"
    code = str(curr_code).upper()
    symbols = {
        "USD": "$",
        "INR": "₹",
        "EUR": "€",
        "GBP": "£",
        "JPY": "¥",
        "CAD": "CA$",
        "AUD": "A$",
    }
    return symbols.get(code, f"{code} ")
