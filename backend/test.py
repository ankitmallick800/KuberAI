"""Smoke test for the single research agent. Prints no API key."""

import os
from dotenv import load_dotenv

load_dotenv()

from agent import run_analysis, scrub

print(f"GROQ_API_KEY loaded: {'yes' if os.getenv('GROQ_API_KEY') else 'no'}")


def emit(event_type, data):
    print(f"{event_type}: {data}")


if not os.getenv("GROQ_API_KEY"):
    print("Set GROQ_API_KEY in backend/.env, then run this again.")
else:
    try:
        state = run_analysis("AAPL", emit)
        print("\n--- REPORT ---")
        print((state.get("final_report") or "")[:1200])
    except Exception as exc:
        print(f"Failed: {scrub(str(exc))}")
