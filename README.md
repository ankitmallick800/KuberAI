# KuberAI

One research agent reads a stock and returns a single call: **Buy / Accumulate / Hold / Watch / Sell**.

The screen still walks through search, a live read, and the verdict report. Fundamentals, sentiment, industry, and technicals are four lenses inside that one agent, not four models. Market numbers come from data tools. Groq writes the note in one request.

The Groq key lives only in `backend/.env`. The browser never sees it and never sends one.

## Run it

Backend:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Put your key in `backend/.env`:

```bash
GROQ_API_KEY=your_key_here
GROQ_MODEL=openai/gpt-oss-20b
```

`openai/gpt-oss-20b` is the lighter default. Set `GROQ_MODEL` if you want a different Groq model.

```bash
uvicorn main:app --reload --port 8000
```

Frontend:

```bash
cd frontend
pnpm install
```

```bash
pnpm dev
```

The app calls `/api`, and Next.js forwards that to `http://127.0.0.1:8000` while you develop. Set `NEXT_PUBLIC_BACKEND_URL` only when the API is on another host.

Open http://localhost:3000 and search a ticker.

## Vercel

`vercel.json` deploys the Next.js app and the FastAPI API as one project. Browser calls to `/api/suggest` and `/api/analyze` reach the API. `GROQ_API_KEY` is a Vercel environment variable, not a frontend variable.

After this repo is on GitHub, connect that repository to the existing Vercel project instead of creating a second one.

GitHub Pages publishes the static app from `.github/workflows/pages.yml`. That site calls the Vercel API at `/api`. The Pages URL is https://ankitmallick800.github.io/KuberAI/.

## Request

`POST /analyze` returns a Server-Sent Events stream.

```json
{ "ticker": "AAPL" }
```

The body is the ticker only. Events are `supervisor_start`, `agent_running`, `agent_log`, `agent_complete`, `synthesis_start`, `synthesis_log`, `report_ready`, `done`, and `agent_error`.

## Layout

```
backend/
  main.py            FastAPI + SSE
  agent.py           one Groq call
  prompts/analyst.txt
  tools/             market data and scores
  guardrails/        ticker checks and output checks
frontend/            search → live → results
```

Optional `TWELVEDATA_API_KEY` and `FINNHUB_API_KEY` only help when yfinance is missing data.

This is research software, not investment advice.
