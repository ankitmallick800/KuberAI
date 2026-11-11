import os
import json
import time
import urllib.request
import urllib.parse
import pandas as pd
import yfinance as yf
from langchain_core.tools import tool
from tools.ticker_utils import format_currency_symbol, resolve_ticker_info

TWELVEDATA_BASE = "https://api.twelvedata.com"
FINNHUB_BASE = "https://finnhub.io/api/v1"

def _twelve_data_symbol(ticker: str) -> str:
    """Maps yfinance-style suffixes to Twelve Data exchange codes (e.g. RELIANCE.NS -> RELIANCE:NSE)."""
    symbol = ticker.strip().upper()
    if symbol.endswith(".NS"):
        return symbol[:-3] + ":NSE"
    if symbol.endswith(".BO"):
        return symbol[:-3] + ":BSE"
    return symbol

def _fetch_twelvedata(ticker: str):
    """Twelve Data daily OHLCV. Returns (DataFrame with Close/High/Low/Open/Volume, currency)."""
    api_key = os.getenv("TWELVEDATA_API_KEY", "").strip()
    if not api_key:
        raise ValueError("TWELVEDATA_API_KEY is not set in backend/.env")

    symbol = _twelve_data_symbol(ticker)
    url = f"{TWELVEDATA_BASE}/time_series?symbol={urllib.parse.quote(symbol)}&interval=1day&outputsize=260&apikey={api_key}"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})

    with urllib.request.urlopen(req, timeout=12) as response:
        payload = json.loads(response.read().decode())

    if payload.get("status") != "ok" or not payload.get("values"):
        msg = payload.get("message") or payload.get("code") or "unknown error"
        raise ValueError(f"Twelve Data error: {msg}")

    df = pd.DataFrame(payload["values"])
    df = df.rename(columns={"datetime": "Date", "open": "Open", "high": "High", "low": "Low", "close": "Close", "volume": "Volume"})
    df = df[["Date", "Open", "High", "Low", "Close", "Volume"]].astype({
        "Open": float, "High": float, "Low": float, "Close": float, "Volume": float,
    })
    df = df.sort_values("Date").reset_index(drop=True)
    return df, payload.get("meta", {}).get("currency")

def _fetch_finnhub_candles(ticker: str):
    """Finnhub daily candles fallback (covers Indian NSE/BSE symbols). Returns (DataFrame, currency)."""
    api_key = os.getenv("FINNHUB_API_KEY", "").strip()
    if not api_key:
        raise ValueError("FINNHUB_API_KEY is not set in backend/.env")

    symbol = ticker.strip().upper()
    now = int(time.time())
    url = f"{FINNHUB_BASE}/stock/candle?symbol={urllib.parse.quote(symbol)}&resolution=D&from={now - 400 * 86400}&to={now}&token={api_key}"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})

    with urllib.request.urlopen(req, timeout=12) as response:
        payload = json.loads(response.read().decode())

    if payload.get("s") != "ok" or not payload.get("c"):
        raise ValueError(f"Finnhub candles error: {payload.get('s')}")

    df = pd.DataFrame({
        "Date": pd.to_datetime(payload["t"], unit="s"),
        "Open": payload["o"], "High": payload["h"],
        "Low": payload["l"], "Close": payload["c"], "Volume": payload["v"],
    })
    df = df.sort_values("Date").reset_index(drop=True)
    currency = "INR" if symbol.endswith((".NS", ".BO")) else "USD"
    return df, currency

def _fetch_yfinance_history(ticker: str):
    """Yahoo Finance daily OHLCV (free, no key). Returns (DataFrame, currency)."""
    stock, info, _ = resolve_ticker_info(ticker)
    hist = stock.history(period="1y")
    if hist is None or hist.empty:
        raise ValueError(f"yfinance returned no data for {ticker}")

    df = hist.reset_index()[["Date", "Open", "High", "Low", "Close", "Volume"]]
    df = df.astype({
        "Open": float, "High": float, "Low": float, "Close": float, "Volume": float,
    })
    currency = info.get("currency") or getattr(getattr(stock, "fast_info", None), "currency", None)
    return df, currency

def _fetch_price_history(ticker: str):
    """Fetches ~1y of daily OHLCV. Yahoo Finance first, Twelve Data next, Finnhub candles last."""
    try:
        return _fetch_yfinance_history(ticker)
    except Exception as yf_err:
        try:
            return _fetch_twelvedata(ticker)
        except Exception as twelve_err:
            try:
                return _fetch_finnhub_candles(ticker)
            except Exception as finnhub_err:
                raise ValueError(f"Yahoo Finance: {yf_err} | Twelve Data: {twelve_err} | Finnhub fallback: {finnhub_err}")

@tool
def get_technical_data(ticker: str) -> str:
    """
    Fetches technical indicators (SMA20, SMA50, SMA200, RSI, MACD, Price Performance)
    for a given stock ticker using Yahoo Finance daily price history (Twelve Data/Finnhub fallback).
    Use this to evaluate price trends, momentum, and key technical levels.
    """
    try:
        hist, curr_code = _fetch_price_history(ticker)
        currency = format_currency_symbol(curr_code)

        if hist is None or hist.empty or len(hist) < 10:
            return f"Error: Insufficient price history for {ticker}."

        close = hist["Close"]
        high = hist["High"]
        low = hist["Low"]
        volume = hist["Volume"]

        price = float(close.iloc[-1])
        prev_price = float(close.iloc[-2]) if len(close) > 1 else price
        change_1d = ((price - prev_price) / prev_price) * 100

        change_1m = ((price - float(close.iloc[-21])) / float(close.iloc[-21])) * 100 if len(close) >= 21 else 0.0
        change_6m = ((price - float(close.iloc[-126])) / float(close.iloc[-126])) * 100 if len(close) >= 126 else 0.0
        change_1y = ((price - float(close.iloc[0])) / float(close.iloc[0])) * 100 if len(close) >= 200 else 0.0

        sma_20 = float(close.rolling(20).mean().iloc[-1]) if len(close) >= 20 else price
        sma_50 = float(close.rolling(50).mean().iloc[-1]) if len(close) >= 50 else None
        sma_200 = float(close.rolling(200).mean().iloc[-1]) if len(close) >= 200 else None

        delta = close.diff()
        gain = delta.where(delta > 0, 0).rolling(14).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(14).mean()
        rs = gain / loss if loss is not None else None
        rsi = 100 - (100 / (1 + float(rs.iloc[-1]))) if rs is not None and pd.notna(rs.iloc[-1]) and (1 + float(rs.iloc[-1])) != 0 else 50.0

        ema_12 = close.ewm(span=12).mean()
        ema_26 = close.ewm(span=26).mean()
        macd = ema_12 - ema_26
        macd_signal = macd.ewm(span=9).mean()
        macd_hist = float(macd.iloc[-1] - macd_signal.iloc[-1])

        high_52w = float(high.max())
        low_52w = float(low.min())
        avg_vol = float(volume.mean()) if not volume.empty else 0.0

        price_vs_sma20 = ((price - sma_20) / sma_20) * 100 if sma_20 else 0.0
        price_vs_sma50 = ((price - sma_50) / sma_50) * 100 if sma_50 and sma_50 != 0 else None
        price_vs_sma200 = ((price - sma_200) / sma_200) * 100 if sma_200 and sma_200 != 0 else None

        bullish_signals = 0
        total_signals = 0
        if price_vs_sma20 > 0: bullish_signals += 1
        total_signals += 1
        if price_vs_sma50 is not None:
            if price_vs_sma50 > 0: bullish_signals += 1
            total_signals += 1
        if price_vs_sma200 is not None:
            if price_vs_sma200 > 0: bullish_signals += 1
            total_signals += 1
        if macd_hist > 0: bullish_signals += 1
        total_signals += 1
        if rsi > 50: bullish_signals += 1
        total_signals += 1

        ratio = bullish_signals / total_signals if total_signals > 0 else 0.5
        if ratio >= 0.8:
            trend_signal = "Strong Bullish"
        elif ratio >= 0.6:
            trend_signal = "Bullish"
        elif ratio <= 0.2:
            trend_signal = "Strong Bearish"
        elif ratio <= 0.4:
            trend_signal = "Bearish"
        else:
            trend_signal = "Neutral / Mixed"

        sma50_str = f"{currency}{sma_50:.2f} (Price is {price_vs_sma50:+.1f}%)" if price_vs_sma50 is not None else "N/A"
        sma200_str = f"{currency}{sma_200:.2f} (Price is {price_vs_sma200:+.1f}%)" if price_vs_sma200 is not None else "N/A"

        return f"""Technical Indicators for {ticker} (1y period, {curr_code or 'unknown'}):
        Overall Technical Trend: {trend_signal}
        Technical Score: {ratio * 100:.0f} (bullish signals / total signals)
        Current Price: {currency}{price:.2f} (1D Change: {change_1d:+.2f}%)
        Performance: 1M: {change_1m:+.1f}% | 6M: {change_6m:+.1f}% | 1Y: {change_1y:+.1f}%
        52-Week Range: {currency}{low_52w:.2f} - {currency}{high_52w:.2f}
        SMA(20): {currency}{sma_20:.2f} (Price is {price_vs_sma20:+.1f}% vs SMA20)
        SMA(50): {sma50_str}
        SMA(200): {sma200_str}
        RSI(14): {rsi:.1f} ({'Overbought' if rsi > 70 else 'Oversold' if rsi < 30 else 'Neutral'})
        MACD Line: {currency}{float(macd.iloc[-1]):.2f}
        MACD Signal: {currency}{float(macd_signal.iloc[-1]):.2f}
        MACD Histogram: {currency}{macd_hist:.2f} ({'Bullish Momentum' if macd_hist > 0 else 'Bearish Momentum'})
        Avg Volume: {avg_vol:,.0f}
        """
    except Exception as e:
        return f"Error fetching technical data for {ticker}: {str(e)}"
