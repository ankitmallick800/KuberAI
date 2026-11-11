"use client"

// Verdict summary screen: the first tab after analysis completes. Left column shows a PulseRing
// with the verdict, a RadialMeter of confidence, and per-agent score chips; right column shows the
// verdict headline, the thesis paragraph, price/change/confidence stats, and a button to advance
// to the per-agent breakdown.
import { motion } from "motion/react"
import { ArrowRight } from "lucide-react"
import { AGENTS, type AgentId, type StockAnalysis } from "@/lib/kuberai-data"
import { PulseRing, type AgentStatus } from "@/components/pulse-ring"
import { RadialMeter } from "@/components/radial-meter"

interface VerdictSummaryProps {
  analysis: StockAnalysis
  onNext: () => void
}

const ALL_DONE: Record<AgentId, AgentStatus> = {
  fundamentals: "done",
  sentiment: "done",
  industry: "done",
  technical: "done",
}

const STANCE_TONE: Record<string, string> = {
  bullish: "text-agent-1",
  bearish: "text-destructive",
  neutral: "text-slate",
}

export function VerdictSummary({ analysis, onNext }: VerdictSummaryProps) {
  return (
    <div className="grid items-center gap-10 lg:grid-cols-2">
      <div className="flex flex-col items-center lg:items-start">
        <span className="mb-3 text-xs uppercase tracking-[0.2em] text-slate">
          Consensus reached
        </span>
        <div className="flex items-center gap-6">
          <PulseRing
            ticker={analysis.ticker}
            statuses={ALL_DONE}
            verdict={analysis.verdict}
            size={200}
          />
          <RadialMeter value={analysis.confidence} />
        </div>

        <div className="mt-6 flex flex-wrap justify-center gap-2 lg:justify-start">
          {AGENTS.map((a) => {
            const f = analysis.findings[a.id] || { stance: "neutral", score: 70 }
            const tone = STANCE_TONE[f.stance] || STANCE_TONE.neutral

            return (
              <span
                key={a.id}
                className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs"
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: a.colorVar }}
                />
                <span className="text-foreground">{a.role}</span>
                <span className={`tabular font-semibold ${tone}`}>
                  {f.score}
                </span>
              </span>
            )
          })}
        </div>
      </div>

      <div>
        <motion.h2
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="text-balance font-display text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-4xl"
        >
          KuberAI calls it a{" "}
          <span className="text-signal">{analysis.verdict}</span> on {analysis.ticker}.
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="mt-4 text-pretty leading-relaxed text-muted-foreground text-sm sm:text-base"
        >
          {analysis.thesis}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="mt-6 grid grid-cols-3 gap-3"
        >
          <Stat label="Price" value={`$${analysis.price.toFixed(2)}`} />
          <Stat
            label="Change"
            value={`${analysis.change >= 0 ? "+" : ""}${analysis.change.toFixed(2)}%`}
            tone={analysis.change >= 0 ? "text-agent-1" : "text-destructive"}
          />
          <Stat label="Confidence" value={`${analysis.confidence}%`} tone="text-signal" />
        </motion.div>

        <motion.button
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
          onClick={onNext}
          className="mt-7 flex items-center gap-2 rounded-lg bg-signal px-5 py-3 text-sm font-semibold text-signal-foreground transition hover:brightness-95"
        >
          See the four reads
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </motion.button>
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  tone = "text-foreground",
}: {
  label: string
  value: string
  tone?: string
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-[10px] uppercase tracking-[0.15em] text-slate">{label}</p>
      <p className={`tabular mt-1 font-display text-lg font-bold ${tone}`}>{value}</p>
    </div>
  )
}
