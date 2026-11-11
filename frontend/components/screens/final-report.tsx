"use client"

// Final Report screen: the printable one-pager summary. Displays the company header with verdict
// and confidence, the investment thesis, side-by-side bull/bear cases, and a grid scorecard of
// every agent's score. The "Export one-pager" button shows a progress animation then triggers
// window.print() so the user can save the report as PDF (the terminal/button are hidden in print).
import { useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { FileDown, Check, Loader2, TrendingUp, TrendingDown } from "lucide-react"
import { AGENTS, type AgentId, type StockAnalysis } from "@/lib/kuberai-data"
import type { AgentStatus } from "@/components/pulse-ring"
import { PulseRing } from "@/components/pulse-ring"

interface FinalReportProps {
  analysis: StockAnalysis
}

const ALL_DONE: Record<AgentId, AgentStatus> = {
  fundamentals: "done",
  sentiment: "done",
  industry: "done",
  technical: "done",
}

type ExportState = "idle" | "generating" | "done"

export function FinalReport({ analysis }: FinalReportProps) {
  const [exportState, setExportState] = useState<ExportState>("idle")

  function handleExport() {
    if (exportState === "generating") return
    setExportState("generating")
    setTimeout(() => {
      setExportState("done")
      window.print()
      setTimeout(() => setExportState("idle"), 2500)
    }, 1600)
  }

  return (
    <div className="mx-auto max-w-3xl">
      {/* report header */}
      <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-6">
          <div className="flex items-center gap-4">
            <PulseRing
              ticker={analysis.ticker}
              statuses={ALL_DONE}
              verdict={analysis.verdict}
              size={64}
              subdued
            />
            <div>
              <h2 className="font-display text-2xl font-bold tracking-tight text-foreground">
                {analysis.name}
              </h2>
              <p className="tabular text-sm text-muted-foreground">
                {analysis.ticker} · {analysis.sector}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate">KuberAI</p>
            <p className="font-display text-2xl font-bold text-signal">{analysis.verdict}</p>
            <p className="tabular text-xs text-muted-foreground">
              {analysis.confidence}% confidence
            </p>
          </div>
        </div>

        <p className="mt-6 text-pretty leading-relaxed text-foreground/90">
          {analysis.thesis}
        </p>

        {/* bull / bear side by side */}
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Case
            title="Bull case"
            tone="bull"
            items={analysis.bull}
            icon={<TrendingUp className="h-4 w-4" aria-hidden="true" />}
          />
          <Case
            title="Bear case"
            tone="bear"
            items={analysis.bear}
            icon={<TrendingDown className="h-4 w-4" aria-hidden="true" />}
          />
        </div>

        {/* agent scorecard */}
        <div className="mt-6">
          <p className="mb-3 text-xs uppercase tracking-[0.2em] text-slate">Agent scorecard</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {AGENTS.map((a) => {
              const f = analysis.findings[a.id] || { score: 70 }
              return (
                <div key={a.id} className="rounded-lg border border-border bg-background/40 p-3">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: a.colorVar }}
                    />
                    <span className="text-xs uppercase tracking-wider text-slate">
                      {a.role}
                    </span>
                  </div>
                  <p className="tabular mt-1 font-display text-xl font-bold text-foreground">
                    {f.score}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* export button */}
      <div className="mt-6 flex flex-col items-center gap-3 print:hidden">
        <button
          onClick={handleExport}
          disabled={exportState === "generating"}
          className="relative flex items-center gap-2 overflow-hidden rounded-lg bg-signal px-6 py-3 text-sm font-semibold text-signal-foreground transition hover:brightness-95 disabled:cursor-wait"
        >
          <AnimatePresence mode="wait" initial={false}>
            {exportState === "generating" ? (
              <motion.span
                key="gen"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="flex items-center gap-2"
              >
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Generating report…
              </motion.span>
            ) : exportState === "done" ? (
              <motion.span
                key="done"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="flex items-center gap-2"
              >
                <Check className="h-4 w-4" aria-hidden="true" />
                Report ready
              </motion.span>
            ) : (
              <motion.span
                key="idle"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="flex items-center gap-2"
              >
                <FileDown className="h-4 w-4" aria-hidden="true" />
                Export one-pager (PDF)
              </motion.span>
            )}
          </AnimatePresence>
          {exportState === "generating" && (
            <motion.span
              className="absolute bottom-0 left-0 h-0.5 bg-signal-foreground/60"
              initial={{ width: "0%" }}
              animate={{ width: "100%" }}
              transition={{ duration: 1.6, ease: "easeInOut" }}
            />
          )}
        </button>
        <p className="text-xs text-slate">Opens your browser print dialog — save as PDF.</p>
      </div>
    </div>
  )
}

function Case({
  title,
  tone,
  items,
  icon,
}: {
  title: string
  tone: "bull" | "bear"
  items: string[]
  icon: React.ReactNode
}) {
  const isBull = tone === "bull"
  return (
    <div
      className={`rounded-xl border p-4 ${
        isBull ? "border-agent-1/30 bg-agent-1/5" : "border-destructive/30 bg-destructive/5"
      }`}
    >
      <div
        className={`flex items-center gap-2 font-display text-sm font-semibold ${
          isBull ? "text-agent-1" : "text-destructive"
        }`}
      >
        {icon}
        {title}
      </div>
      <ul className="mt-3 flex flex-col gap-2">
        {items.map((it, idx) => (
          <li key={idx} className="flex gap-2 text-sm leading-relaxed text-foreground/90">
            <span
              className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                isBull ? "bg-agent-1" : "bg-destructive"
              }`}
            />
            {it}
          </li>
        ))}
      </ul>
    </div>
  )
}
