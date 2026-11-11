"use client"

// Results screen: top-level container shown after analysis completes. Holds a tab bar (Verdict,
// Breakdown, Disagreement, Report) plus a "New analysis" reset button, and renders the active
// section inside a motion crossfade. Dispatches to VerdictSummary, AgentBreakdown, DebateView,
// and FinalReport based on the selected tab.
import { useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { RotateCcw } from "lucide-react"
import type { StockAnalysis } from "@/lib/kuberai-data"
import { VerdictSummary } from "@/components/screens/verdict-summary"
import { AgentBreakdown } from "@/components/screens/agent-breakdown"
import { DebateView } from "@/components/screens/debate-view"
import { FinalReport } from "@/components/screens/final-report"

interface ResultsScreenProps {
  analysis: StockAnalysis
  onReset: () => void
}

type Section = "verdict" | "breakdown" | "debate" | "report"

const SECTIONS: { id: Section; label: string }[] = [
  { id: "verdict", label: "Verdict" },
  { id: "breakdown", label: "Breakdown" },
  { id: "debate", label: "Disagreement" },
  { id: "report", label: "Report" },
]

export function ResultsScreen({ analysis, onReset }: ResultsScreenProps) {
  const [section, setSection] = useState<Section>("verdict")

  return (
    <div className="flex flex-col">
      {/* section nav */}
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div
          role="tablist"
          aria-label="Analysis sections"
          className="flex flex-wrap gap-1 rounded-xl border border-border bg-card p-1"
        >
          {SECTIONS.map((s) => {
            const isDebate = s.id === "debate"
            const activeCls = isDebate
              ? "bg-cold text-cold-foreground"
              : "bg-signal text-signal-foreground"
            return (
              <button
                key={s.id}
                role="tab"
                aria-selected={section === s.id}
                onClick={() => setSection(s.id)}
                className={`relative rounded-lg px-4 py-2 text-sm font-medium transition ${
                  section === s.id
                    ? activeCls
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {s.label}
              </button>
            )
          })}
        </div>

        <button
          onClick={onReset}
          className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm text-muted-foreground transition hover:border-signal/60 hover:text-foreground"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          New analysis
        </button>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={section}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        >
          {section === "verdict" && (
            <VerdictSummary analysis={analysis} onNext={() => setSection("breakdown")} />
          )}
          {section === "breakdown" && <AgentBreakdown analysis={analysis} />}
          {section === "debate" && <DebateView analysis={analysis} />}
          {section === "report" && <FinalReport analysis={analysis} />}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
