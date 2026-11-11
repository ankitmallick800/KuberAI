"use client"

import { useCallback, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { type StockAnalysis } from "@/lib/kuberai-data"
import { AppShell } from "@/components/app-shell"
import { SearchScreen } from "@/components/screens/search-screen"
import { LiveScreen } from "@/components/screens/live-screen"
import { ResultsScreen } from "@/components/screens/results-screen"

export type Stage = "search" | "live" | "results"

export function KuberAIFlow() {
  const [stage, setStage] = useState<Stage>("search")
  const [activeTicker, setActiveTicker] = useState<string>("")
  const [analysis, setAnalysis] = useState<StockAnalysis | null>(null)

  const startAnalysis = useCallback((ticker: string) => {
    setActiveTicker(ticker)
    setStage("live")
  }, [])

  const onAnalysisComplete = useCallback((realAnalysis: StockAnalysis) => {
    setAnalysis(realAnalysis)
    setStage("results")
  }, [])

  const onError = useCallback((msg: string) => {
    setStage("search")
  }, [])

  const reset = useCallback(() => {
    setStage("search")
    setAnalysis(null)
    setActiveTicker("")
  }, [])

  return (
    <AppShell stage={stage} analysis={analysis} onReset={reset}>
      <AnimatePresence mode="wait">
        {stage === "search" && (
          <motion.div
            key="search"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          >
            <SearchScreen onSelect={startAnalysis} />
          </motion.div>
        )}

        {stage === "live" && activeTicker && (
          <motion.div
            key="live"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          >
            <LiveScreen
              ticker={activeTicker}
              onComplete={onAnalysisComplete}
              onError={onError}
            />
          </motion.div>
        )}

        {stage === "results" && analysis && (
          <motion.div
            key="results"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          >
            <ResultsScreen analysis={analysis} onReset={reset} />
          </motion.div>
        )}
      </AnimatePresence>
    </AppShell>
  )
}
