import time
import os
import json
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
from langchain_core.tools import tool
import yfinance as yf
from ddgs import DDGS
from tools.ticker_utils import resolve_ticker_info

FINNHUB_BASE = "https://finnhub.io/api/v1"

def _finnhub_get(path: str, params: dict) -> dict:
    api_key = os.getenv("FINNHUB_API_KEY", "").strip()
    if not api_key:
        raise ValueError("FINNHUB_API_KEY is not set in backend/.env")
    url = f"{FINNHUB_BASE}{path}?{urllib.parse.urlencode({**params, 'token': api_key})}"
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"}
    )
    with urllib.request.urlopen(req, timeout=8) as response:
        return json.loads(response.read().decode())

def _fetch_google_news_rss(search_query: str) -> str:
    """Fetch recent news from Google News RSS feed."""
    encoded_query = urllib.parse.quote(search_query)
    url = f"https://news.google.com/rss/search?q={encoded_query}&hl=en-US&gl=US&ceid=US:en"
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"}
    )
    with urllib.request.urlopen(req, timeout=6) as response:
        xml_data = response.read()

    root = ET.fromstring(xml_data)
    items = root.findall(".//item")
    if not items:
        return ""

    context = ""
    for item in items[:6]:
        title = item.find("title").text if item.find("title") is not None else ""
        pub_date = item.find("pubDate").text if item.find("pubDate") is not None else ""
        source = item.find("source").text if item.find("source") is not None else ""
        link = item.find("link").text if item.find("link") is not None else ""
        if title:
            context += f"- Headline: {title} | Source: {source} | Date: {pub_date}\n"
    return context

def _fetch_ddg_news(query: str) -> str:
    """Fetch recent news using DuckDuckGo News."""
    try:
        ddgs = DDGS()
        news = list(ddgs.news(query, max_results=5))
        if not news:
            return ""
        context = ""
        for article in news:
            title = article.get("title", "")
            source = article.get("source", "")
            date = article.get("date", "")
            if title:
                context += f"- Headline: {title} | Source: {source} | Date: {date}\n"
        return context
    except Exception:
        return ""

@tool
def get_sentiment(ticker: str) -> str:
    """
    Fetches recent news headlines and articles for a stock ticker.
    Use this to gauge market mood and recent press coverage.
    """
    stock, info, resolved_ticker = resolve_ticker_info(ticker)
    company_name = info.get("shortName") or info.get("longName") or resolved_ticker

    queries = [
        f"{company_name} stock news",
        f"{resolved_ticker} stock news",
        f"{company_name} news"
    ]

    # 1. Try Google News RSS
    for q in queries:
        try:
            rss_news = _fetch_google_news_rss(q)
            if rss_news:
                return f"Top Recent News for {company_name} ({resolved_ticker}):\n" + rss_news
        except Exception:
            continue

    # 2. Try Yahoo Finance news
    try:
        news = stock.news
        if news and len(news) > 0:
            context = f"Top Recent News for {company_name} ({resolved_ticker}):\n"
            for article in news[:5]:
                c = article.get("content", {})
                title = c.get("title", "")
                provider = c.get("provider", {})
                publisher = provider.get("displayName", "")
                pub_date = c.get("pubDate", "")
                if title:
                    context += f"- Headline: {title} | Source: {publisher} | Date: {pub_date}\n"
            if len(context.strip().split("\n")) > 1:
                return context
    except Exception:
        pass

    # 3. Fallback to DuckDuckGo News
    for q in queries:
        ddg_news = _fetch_ddg_news(q)
        if ddg_news:
            return f"Top Recent News for {company_name} ({resolved_ticker}) (DuckDuckGo):\n" + ddg_news

    return f"No recent news found for {company_name} ({resolved_ticker})."

def _profile_from_yfinance(ticker: str) -> dict:
    """Fallback company profile from yfinance (free, no key)."""
    stock, info, resolved = resolve_ticker_info(ticker)
    return {
        "name": info.get("longName") or info.get("shortName") or resolved,
        "finnhubIndustry": info.get("sector") or info.get("industry") or "N/A",
        "exchange": info.get("fullExchangeName") or "N/A",
        "currency": info.get("currency") or "N/A",
        "marketCapitalization": round(info.get("marketCap", 0) / 1e6, 1) if info.get("marketCap") else "N/A",
    }

@tool
def get_industry_context(ticker: str) -> str:
    """
    Fetches industry/sector classification, business summary, and market context for a stock
    (Finnhub company profile + web search, with yfinance profile fallback and Google News RSS).
    Use this to understand the company's competitive landscape.
    """
    try:
        try:
            profile = _finnhub_get("/stock/profile2", {"symbol": ticker})
            if not profile or profile.get("error") or not profile.get("name"):
                raise ValueError("no profile")
        except Exception:
            profile = _profile_from_yfinance(ticker)

        company_name = profile.get("name", ticker)
        sector = profile.get("finnhubIndustry") or "N/A"
        exchange = profile.get("exchange") or "N/A"
        currency = profile.get("currency") or "N/A"
        market_cap_usd_m = profile.get("marketCapitalization") or "N/A"

        # Finnhub profile2 has no business description; get it via web search
        summary = ""
        try:
            ddgs = DDGS()
            results = list(ddgs.text(
                f"{ticker} {company_name} company business profile sector industry",
                max_results=4,
            ))
            summary = "\n".join(r.get("body", "") for r in results if r.get("body"))
        except Exception:
            summary = ""

        # Recent industry & company news via Google News RSS (free, no key)
        news = ""
        try:
            news = _fetch_google_news_rss(f"{company_name} {ticker} industry news")
        except Exception:
            news = ""

        # Macro factors search so the industry agent has grounded material for the macro section
        macro = ""
        if sector != "N/A":
            try:
                ddgs = DDGS()
                results = list(ddgs.text(
                    f"{sector} sector outlook interest rates inflation regulation",
                    max_results=3,
                ))
                macro = "\n".join(r.get("body", "") for r in results if r.get("body"))
            except Exception:
                macro = ""

        # Competitor / competitive dynamics search
        competitors = ""
        try:
            ddgs = DDGS()
            results = list(ddgs.text(
                f"{ticker} {company_name} main competitors market share competition",
                max_results=3,
            ))
            competitors = "\n".join(r.get("body", "") for r in results if r.get("body"))
        except Exception:
            competitors = ""

        text = f"""
Company: {company_name} ({ticker})
Sector: {sector}
Exchange: {exchange}
Currency: {currency}
Market Cap (USD M): {market_cap_usd_m}
"""
        if summary:
            text += f"\nBusiness & Sector Summary:\n{summary[:1000]}"
        if news:
            text += f"\n\nRecent Industry & Company News:\n{news}"
        if macro:
            text += f"\n\nMacro Factors:\n{macro[:800]}"
        if competitors:
            text += f"\n\nCompetitive Landscape:\n{competitors[:800]}"
        return text.strip()
    except Exception as e:
        return f"Error fetching industry context for {ticker}: {str(e)}"