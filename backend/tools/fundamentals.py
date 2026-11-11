import time
import pandas as pd
from langchain_core.tools import tool
from ddgs import DDGS
from tools.ticker_utils import resolve_ticker_info, format_currency_symbol, retry_yf_call

def safe_get_df_metric(df: pd.DataFrame, aliases: list, default=None):
    if df is None or df.empty:
        return default
    for alias in aliases:
        for idx in df.index:
            if str(idx).strip().lower() == alias.lower():
                try:
                    val = df.loc[idx].iloc[0]
                    if pd.notna(val):
                        return float(val)
                except Exception:
                    continue
    return default

def format_number(val, currency="$") -> str:
    if val is None or val == "N/A":
        return "N/A"
    try:
        num = float(val)
        abs_num = abs(num)
        sign = "-" if num < 0 else ""
        if abs_num >= 1e12:
            return f"{sign}{currency}{abs_num / 1e12:.2f}T"
        elif abs_num >= 1e9:
            return f"{sign}{currency}{abs_num / 1e9:.2f}B"
        elif abs_num >= 1e6:
            return f"{sign}{currency}{abs_num / 1e6:.2f}M"
        else:
            return f"{sign}{currency}{abs_num:,.2f}"
    except Exception:
        return "N/A"

def fetch_ddg_fundamental_snippets(query: str) -> str:
    try:
        ddgs = DDGS()
        results = list(ddgs.text(query, max_results=3))
        snippets = []
        for r in results:
            body = r.get("body", "")
            if body:
                snippets.append(body)
        return "\n".join(snippets)
    except Exception:
        return ""

@tool
def get_fundamentals(ticker: str) -> str:
    """
    Fetches key fundamental financial data (Revenue, Net Income, FCF, Debt-to-Equity, 
    Market Cap, P/E ratio, Margins) for a given stock ticker using Yahoo Finance and Search. 
    Use this tool to evaluate the financial health of a company.
    """
    try:
        stock, info, resolved_ticker = resolve_ticker_info(ticker)
        fast_info = getattr(stock, "fast_info", None)
        company_name = info.get("longName") or info.get("shortName") or resolved_ticker

        curr_code = info.get("currency") or getattr(fast_info, "currency", "USD")
        currency = format_currency_symbol(curr_code)

        # 1. Primary Source: stock.info & fast_info
        revenue = info.get("totalRevenue")
        net_income = info.get("netIncomeToCommon") or info.get("netIncome")
        fcf = info.get("freeCashflow")
        total_debt = info.get("totalDebt")
        dte = info.get("debtToEquity")
        market_cap = info.get("marketCap") or getattr(fast_info, "market_cap", None)
        trailing_pe = info.get("trailingPE")
        forward_pe = info.get("forwardPE")
        profit_margins = info.get("profitMargins")
        operating_margins = info.get("operatingMargins")
        roe = info.get("returnOnEquity")

        # 2. Fallback Source: Financial Statements if info metrics missing
        financials = None
        balance_sheet = None
        cashflow = None

        if revenue is None or net_income is None:
            try:
                financials = retry_yf_call(lambda: stock.financials, max_retries=1, delay=0.5)
            except Exception:
                pass

        if total_debt is None:
            try:
                balance_sheet = retry_yf_call(lambda: stock.balance_sheet, max_retries=1, delay=0.5)
            except Exception:
                pass

        if fcf is None:
            try:
                cashflow = retry_yf_call(lambda: stock.cashflow, max_retries=1, delay=0.5)
            except Exception:
                pass

        if revenue is None and financials is not None:
            revenue = safe_get_df_metric(financials, [
                'Total Revenue', 'Operating Revenue', 'Revenue', 'Total Operating Revenue'
            ])

        if net_income is None and financials is not None:
            net_income = safe_get_df_metric(financials, [
                'Net Income', 'Net Income Common Stockholders', 'Net Income Common Stock', 
                'Net Income Applicable To Common Shares', 'Net Income Continuous Operations'
            ])

        if fcf is None and cashflow is not None:
            fcf = safe_get_df_metric(cashflow, ['Free Cash Flow', 'FreeCashFlow'])
            if fcf is None:
                ocf = safe_get_df_metric(cashflow, ['Operating Cash Flow', 'Total Cash From Operating Activities'])
                capex = safe_get_df_metric(cashflow, ['Capital Expenditure', 'Capital Expenditures', 'Capital Impermanent'])
                if ocf is not None and capex is not None:
                    fcf = ocf - abs(capex)

        if total_debt is None and balance_sheet is not None:
            total_debt = safe_get_df_metric(balance_sheet, [
                'Total Debt', 'Total Liabilities Net Minority Interest', 'Long Term Debt', 'Current Debt'
            ])

        # Debt to Equity calculation
        if dte is not None:
            try:
                dte_val = float(dte)
                if dte_val > 10:
                    dte_val = dte_val / 100.0
                dte_str = f"{dte_val:.2f}"
            except Exception:
                dte_str = str(dte)
        elif total_debt is not None and balance_sheet is not None:
            equity = safe_get_df_metric(balance_sheet, [
                'Stockholders Equity', 'Common Stock Equity', 'Total Equity Gross Minority Interest', 'Total Stockholder Equity'
            ])
            if equity and equity != 0:
                dte_str = f"{(total_debt / equity):.2f}"
            else:
                dte_str = "N/A"
        else:
            dte_str = "N/A"

        # 3. Web Search Snippets Fallback if key metrics missing
        ddg_snippets = ""
        if revenue is None or net_income is None or fcf is None or dte_str == "N/A":
            ddg_snippets = fetch_ddg_fundamental_snippets(f"{resolved_ticker} {company_name} financial fundamentals revenue net income market cap P/E ratio debt to equity")

        # Format outputs
        rev_str = format_number(revenue, currency)
        ni_str = format_number(net_income, currency)
        fcf_str = format_number(fcf, currency)
        mcap_str = format_number(market_cap, currency)
        pe_str = f"{trailing_pe:.1f}" if isinstance(trailing_pe, (int, float)) else "N/A"
        fpe_str = f"{forward_pe:.1f}" if isinstance(forward_pe, (int, float)) else "N/A"
        pm_str = f"{profit_margins * 100:.1f}%" if isinstance(profit_margins, (int, float)) else "N/A"
        om_str = f"{operating_margins * 100:.1f}%" if isinstance(operating_margins, (int, float)) else "N/A"
        roe_str = f"{roe * 100:.1f}%" if isinstance(roe, (int, float)) else "N/A"

        result = f"""
        Fundamentals for {company_name} ({resolved_ticker}) (Currency: {curr_code}):
        - Total Revenue: {rev_str}
        - Net Income: {ni_str}
        - Free Cash Flow: {fcf_str}
        - Debt-to-Equity Ratio: {dte_str}
        - Market Capitalization: {mcap_str}
        - Trailing P/E: {pe_str}
        - Forward P/E: {fpe_str}
        - Profit Margin: {pm_str}
        - Operating Margin: {om_str}
        - Return on Equity (ROE): {roe_str}
        """

        if ddg_snippets:
            result += f"\n\nWeb Search Financial References:\n{ddg_snippets[:800]}"

        return result
    except Exception as e:
        return f"Error fetching fundamentals for {ticker}: {str(e)}"