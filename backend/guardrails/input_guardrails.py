import re
from typing import Tuple

INJECTION_PATTERNS = [
    r"ignore\s+(all\s+)?(previous\s+)?instructions",
    r"system\s+prompt",
    r"you\s+are\s+now",
    r"forget\s+(all\s+)?rules",
    r"act\s+as\s+a",
    r"jailbreak",
    r"override\s+safety",
    r"disregard\s+prior",
    r"developer\s+mode",
    r"dan\s+mode",
    r"bypass\s+filters",
]

SQL_HTML_PATTERNS = [
    r"<\s*script",
    r"select\s+.*\s+from",
    r"drop\s+table",
    r"insert\s+into",
    r"delete\s+from",
    r"union\s+select",
    r"--",
    r"/\*",
]

def validate_ticker_input(raw_ticker: str) -> Tuple[bool, str, str]:
    """
    Validates and sanitizes incoming ticker string against injection attacks,
    malicious scripts, invalid length, and malformed characters.
    
    Returns: (is_valid, sanitized_ticker, error_message)
    """
    if not raw_ticker or not raw_ticker.strip():
        return False, "", "Ticker symbol cannot be empty."

    cleaned = raw_ticker.strip()

    # 1. Length Guardrail
    if len(cleaned) > 15:
        return False, "", f"Invalid ticker length ({len(cleaned)} chars). Tickers must be under 15 characters."

    cleaned_lower = cleaned.lower()

    # 2. Prompt Injection Guardrail
    for pattern in INJECTION_PATTERNS:
        if re.search(pattern, cleaned_lower):
            return False, "", "Security Violation: Adversarial prompt injection detected in input."

    # 3. Malicious Code / Injection Guardrail
    for pattern in SQL_HTML_PATTERNS:
        if re.search(pattern, cleaned_lower):
            return False, "", "Security Violation: Malicious characters or code detected."

    # 4. Allowed Characters Guardrail: Alphanumeric, dot, hyphen, space
    if not re.match(r"^[A-Za-z0-9.\-\s]+$", cleaned):
        return False, "", "Invalid ticker format. Ticker can only contain letters, numbers, dots, and hyphens."

    sanitized = cleaned.upper().replace(" ", "")
    return True, sanitized, ""
