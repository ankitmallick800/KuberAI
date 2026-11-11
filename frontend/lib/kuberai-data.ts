export type AgentId = "fundamentals" | "sentiment" | "industry" | "technical"

export interface AgentMeta {
  id: AgentId
  name: string
  role: string
  colorVar: string // css var token name
  // angle position around the ring, in degrees (0 = top)
  angle: number
}

export const AGENTS: AgentMeta[] = [
  {
    id: "fundamentals",
    name: "Atlas",
    role: "Fundamentals",
    colorVar: "var(--agent-1)",
    angle: 0,
  },
  {
    id: "sentiment",
    name: "Echo",
    role: "Sentiment",
    colorVar: "var(--agent-2)",
    angle: 90,
  },
  {
    id: "industry",
    name: "Sector",
    role: "Industry",
    colorVar: "var(--agent-4)",
    angle: 180,
  },
  {
    id: "technical",
    name: "Vector",
    role: "Technicals",
    colorVar: "var(--agent-3)",
    angle: 270,
  },
]

export type Verdict = "Buy" | "Hold" | "Watch" | "Sell" | "Accumulate"

export interface AgentFinding {
  id: AgentId
  headline: string // one-line finding revealed on completion
  stance: "bullish" | "bearish" | "neutral"
  score: number // 0-100 conviction
  detail: string
  bullets: string[]
  chart: number[] // mini chart series
}

export interface DebatePoint {
  agentA: AgentId
  agentB: AgentId
  topic: string
  claimA: string
  claimB: string
  reasoning: string[]
  resolution: string
}

export interface StockAnalysis {
  ticker: string
  name: string
  sector: string
  price: number
  change: number // percent
  verdict: Verdict
  confidence: number // 0-100
  thesis: string
  findings: Record<AgentId, AgentFinding>
  debate: DebatePoint | null
  bull: string[]
  bear: string[]
}

export function convertBackendReportToAnalysis(report: any): StockAnalysis {
  const ticker = report.ticker || "STOCK"
  const verdictSignal = (report.verdict?.signal || "Hold") as Verdict
  const confidence = report.verdict?.confidence || 75

  const fund = report.fundamentals || {}
  const sent = report.sentiment || {}
  const ind = report.industry || {}
  const tech = report.technical || {}
  const synth = report.synthesis || {}
  const disag = report.disagreement || {}
  const scores = report.agentScores || {}

  const fundBullets = [
    `Total Revenue: ${fund.revenue || "N/A"}`,
    `Net Income: ${fund.netIncome || "N/A"}`,
    `Free Cash Flow: ${fund.freeCashFlow || "N/A"}`,
    `Debt to Equity: ${fund.debtToEquity || "N/A"}`,
  ]

  const sentBullets = [
    `Overall Sentiment: ${sent.label || "Neutral"}`,
    `Sentiment Score: ${sent.score || 0}`,
  ]

  const indBullets = [
    `Industry Context: ${ind.positioning || "Analysis complete."}`,
  ]

  const techBullets = [
    `Technical Indicators: ${tech.summary ? tech.summary.slice(0, 120) + "..." : "Analysis complete."}`,
  ]

  // Clean headlines
  const fundHeadline = fund.summary ? fund.summary.split("\n")[0].replace(/^#+\s*/, "") : "Fundamental valuation & financial metrics analyzed."
  const sentHeadline = sent.summary ? sent.summary.split("\n")[0].replace(/^#+\s*/, "") : `Market sentiment evaluates to ${sent.label || "Neutral"}.`
  const indHeadline = ind.summary ? ind.summary.split("\n")[0].replace(/^#+\s*/, "") : "Industry competitive structure evaluated."
  const techHeadline = tech.summary ? tech.summary.split("\n")[0].replace(/^#+\s*/, "") : "Technical trend analysis complete."

  const synthParagraphs: string[] = synth.paragraphs || []
  const bullCases = synthParagraphs.filter((p) => p.toLowerCase().includes("positive") || p.toLowerCase().includes("growth") || p.toLowerCase().includes("strong")).slice(0, 3)
  const bearCases = synthParagraphs.filter((p) => p.toLowerCase().includes("risk") || p.toLowerCase().includes("caution") || p.toLowerCase().includes("bearish") || p.toLowerCase().includes("downside")).slice(0, 3)

  if (bullCases.length === 0) {
    bullCases.push("Solid balance sheet and core operation stability.", "Positive strategic positioning within sector.")
  }
  if (bearCases.length === 0) {
    bearCases.push("Potential macroeconomic and valuation volatility.", "Monitored execution and margin pressure risks.")
  }

  // Parse Disagreement (only when the synthesizer reports a genuine clash)
  let debatePoint: DebatePoint | null = null
  if (disag.has_disagreement && disag.topic && disag.claim_a && disag.claim_b) {
    const validAgents: AgentId[] = ["fundamentals", "sentiment", "industry", "technical"]
    let rawAgentA = (disag.agent_a || "fundamentals").toLowerCase()
    let rawAgentB = (disag.agent_b || "technical").toLowerCase()
    if (!validAgents.includes(rawAgentA as AgentId)) rawAgentA = "fundamentals"
    if (!validAgents.includes(rawAgentB as AgentId)) rawAgentB = "technical"

    debatePoint = {
      agentA: rawAgentA as AgentId,
      agentB: rawAgentB as AgentId,
      topic: disag.topic || "Specialist Agent Perspectives & Valuation Clash",
      claimA: disag.claim_a || "Fundamental metrics highlight underlying financial strength and balance sheet valuation.",
      claimB: disag.claim_b || "Market momentum and technical indicators caution short-term entry timing.",
      reasoning: disag.reasoning && Array.isArray(disag.reasoning) && disag.reasoning.length > 0
        ? disag.reasoning
        : [
            "Specialist agents evaluated multi-source financial and market signals.",
            "Different metrics yielded contrasting short-term vs long-term signals.",
            "Synthesizer reconciled the risk/reward profile into the final verdict."
          ],
      resolution: disag.resolution || report.verdict?.reasoning || "Reconciled into one call."
    }
  }

  return {
    ticker,
    name: report.companyName || ticker,
    sector: report.sector || "General",
    price: report.market?.price ?? 0,
    change: report.market?.change ?? 0,
    verdict: verdictSignal,
    confidence,
    thesis: report.verdict?.reasoning || report.verdict?.headline || "Multi-agent due diligence complete.",
    findings: {
      fundamentals: {
        id: "fundamentals",
        headline: fundHeadline,
        stance: scores.fundamentals?.stance || "neutral",
        score: scores.fundamentals?.score ?? 50,
        detail: fund.summary || "Fundamentals analysis completed.",
        bullets: fundBullets,
        chart: series(1, (scores.fundamentals?.stance ?? "neutral") !== "bearish"),
      },
      sentiment: {
        id: "sentiment",
        headline: sentHeadline,
        stance: scores.sentiment?.stance || ((sent.score || 0) >= 0 ? "bullish" : "bearish"),
        score: scores.sentiment?.score ?? Math.max(10, Math.min(95, Math.round(((sent.score || 0) + 100) / 2))),
        detail: sent.summary || "Sentiment analysis completed.",
        bullets: sentBullets,
        chart: series(2, (scores.sentiment?.stance ?? (sent.score || 0)) !== "bearish"),
      },
      industry: {
        id: "industry",
        headline: indHeadline,
        stance: scores.industry?.stance || "neutral",
        score: scores.industry?.score ?? 50,
        detail: ind.summary || "Industry positioning analysis completed.",
        bullets: indBullets,
        chart: series(4, (scores.industry?.stance ?? "neutral") !== "bearish"),
      },
      technical: {
        id: "technical",
        headline: techHeadline,
        stance: scores.technical?.stance || "neutral",
        score: scores.technical?.score ?? 50,
        detail: tech.summary || "Technical analysis completed.",
        bullets: techBullets,
        chart: series(3, (scores.technical?.stance ?? "neutral") !== "bearish"),
      },
    },
    debate: debatePoint,
    bull: bullCases,
    bear: bearCases,
  }
}


export interface TrendingTicker {
  ticker: string
  name: string
  sector: string
  price: number
  change: number
}

export const TRENDING: TrendingTicker[] = [
  { ticker: "NVDA", name: "NVIDIA Corp.", sector: "Semiconductors", price: 132.41, change: 2.85 },
  { ticker: "AAPL", name: "Apple Inc.", sector: "Consumer Tech", price: 227.18, change: 0.62 },
  { ticker: "TSLA", name: "Tesla Inc.", sector: "Autos / Energy", price: 251.09, change: -3.14 },
  { ticker: "AMZN", name: "Amazon.com Inc.", sector: "E-commerce / Cloud", price: 186.4, change: 1.12 },
  { ticker: "MSFT", name: "Microsoft Corp.", sector: "Software / Cloud", price: 421.33, change: 0.44 },
  { ticker: "META", name: "Meta Platforms", sector: "Social / Ads", price: 512.2, change: -1.05 },
  { ticker: "AMD", name: "Advanced Micro Devices", sector: "Semiconductors", price: 158.77, change: 4.21 },
  { ticker: "GOOGL", name: "Alphabet Inc.", sector: "Search / Cloud", price: 168.9, change: -0.38 },
]

function series(seed: number, up: boolean): number[] {
  const out: number[] = []
  let v = 50
  for (let i = 0; i < 24; i++) {
    const drift = up ? 0.9 : -0.7
    v += Math.sin((i + seed) * 0.7) * 6 + drift + (((seed * (i + 3)) % 7) - 3)
    out.push(Math.max(8, Math.min(96, v)))
  }
  return out
}

export function searchTickers(query: string): TrendingTicker[] {
  const q = query.trim().toUpperCase()
  if (!q) return []
  return TRENDING.filter(
    (t) => t.ticker.includes(q) || t.name.toUpperCase().includes(q),
  ).slice(0, 6)
}
