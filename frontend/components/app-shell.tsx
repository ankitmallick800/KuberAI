"use client"

import type { ReactNode } from "react"
import { motion } from "motion/react"
import { type AgentId, type StockAnalysis } from "@/lib/kuberai-data"
import type { AgentStatus } from "@/components/pulse-ring"
import { PulseRing } from "@/components/pulse-ring"
import type { Stage } from "@/components/kuberai-flow"

interface AppShellProps {
  children: ReactNode
  stage: Stage
  analysis: StockAnalysis | null
  onReset: () => void
}

const ALL_DONE: Record<AgentId, AgentStatus> = {
  fundamentals: "done",
  sentiment: "done",
  industry: "done",
  technical: "done",
}

export function AppShell({ children, stage, analysis, onReset }: AppShellProps) {
  const showNavRing = stage === "results" && analysis

  return (
    <div className="relative flex min-h-dvh flex-col">
      {/* ambient background texture */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 opacity-[0.55]"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 0%, rgba(125,222,196,0.08), transparent 70%), radial-gradient(40% 40% at 85% 15%, rgba(126,182,232,0.06), transparent 70%)",
        }}
      />

      <header className="relative z-10 border-b border-border/70 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-4">
          <button
            onClick={onReset}
            className="group flex items-center gap-3 rounded-md"
            aria-label="KuberAI home"
          >
            <span className="font-display text-lg font-bold tracking-tight text-foreground">
              KuberAI
            </span>
          </button>

          <div className="flex items-center gap-4">
            {showNavRing && analysis && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="hidden items-center gap-2 sm:flex"
              >
                <PulseRing
                  ticker={analysis.ticker}
                  statuses={ALL_DONE}
                  verdict={analysis.verdict}
                  size={40}
                  subdued
                />
                <span className="tabular text-sm text-muted-foreground">
                  {analysis.ticker}
                </span>
              </motion.div>
            )}
            <span className="hidden text-xs uppercase tracking-[0.2em] text-slate md:inline">
              One agent · four lenses
            </span>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col px-5 py-8 sm:py-12">
        {children}
      </main>

      <footer className="relative z-10 border-t border-border/70">
        <div className="mx-auto w-full max-w-6xl px-5 py-4">
          <p className="text-xs text-slate">
            KuberAI is a research visualization. Not investment advice. Figures are illustrative.
          </p>
        </div>
      </footer>
    </div>
  )
}
