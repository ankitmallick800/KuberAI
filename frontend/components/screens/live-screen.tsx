"use client"

// Live screen: shown while the single research agent runs. POSTs the ticker only
// and consumes the Server-Sent Events stream. The API key stays on the server.
import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Check, Loader2, AlertTriangle, Terminal, ArrowRight } from "lucide-react"
import {
  AGENTS,
  convertBackendReportToAnalysis,
  type AgentId,
  type StockAnalysis,
} from "@/lib/kuberai-data"
import { PulseRing, type AgentStatus } from "@/components/pulse-ring"
import { backendPath } from "@/lib/backend"

interface LiveScreenProps {
  ticker: string
  onComplete: (analysis: StockAnalysis) => void
  onError: (msg: string) => void
}

const INITIAL: Record<AgentId, AgentStatus> = {
  fundamentals: "thinking",
  sentiment: "thinking",
  industry: "thinking",
  technical: "thinking",
}

export function LiveScreen({ ticker, onComplete, onError }: LiveScreenProps) {
  const reduce = useReducedMotion()
  const [statuses, setStatuses] = useState<Record<AgentId, AgentStatus>>(INITIAL)
  const [logs, setLogs] = useState<Record<AgentId, string[]>>({
    fundamentals: [],
    sentiment: [],
    industry: [],
    technical: [],
  })
  const [activeLogs, setActiveLogs] = useState<string[]>([])
  const [statusMsg, setStatusMsg] = useState("Starting the research agent...")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [readyReport, setReadyReport] = useState<StockAnalysis | null>(null)
  
  const finalAnalysisRef = useRef<StockAnalysis | null>(null)

  useEffect(() => {
    let isCancelled = false
    const abortController = new AbortController()

    async function streamAnalysis() {
      try {
        const res = await fetch(backendPath("/analyze"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ticker }),
          signal: abortController.signal,
        })

        if (!res.ok) {
          throw new Error(`Server returned status ${res.status}`)
        }

        const reader = res.body?.getReader()
        if (!reader) throw new Error("ReadableStream not supported by response")

        const decoder = new TextDecoder()
        let buffer = ""

        while (!isCancelled) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n")
          const events = buffer.split("\n\n")
          buffer = events.pop() || ""

          for (const rawEvent of events) {
            if (!rawEvent.trim()) continue
            
            let eventType = "message"
            const dataLines: string[] = []

            const lines = rawEvent.split("\n")
            for (const line of lines) {
              if (line.startsWith("event:")) {
                eventType = line.slice(6).trim()
              } else if (line.startsWith("data:")) {
                dataLines.push(line.slice(5).trimStart())
              }
            }

            if (dataLines.length === 0) continue
            const dataStr = dataLines.join("\n")

            try {
              const data = JSON.parse(dataStr)

              if (eventType === "supervisor_start") {
                setStatusMsg(`Reading the market for ${data.ticker || ticker}...`)
              } else if (eventType === "agent_queued" || eventType === "agent_running") {
                const agentId = data.agent as AgentId
                if (agentId) {
                  setStatuses((s) => ({ ...s, [agentId]: "thinking" }))
                  setStatusMsg(`Pulling ${agentId}...`)
                }
              } else if (eventType === "agent_log") {
                const agentId = data.agent as AgentId
                if (agentId && data.line) {
                  setLogs((prev) => ({
                    ...prev,
                    [agentId]: [...(prev[agentId] || []).slice(-5), data.line],
                  }))
                  setActiveLogs((prev) => [...prev.slice(-10), `[${agentId}] ${data.line}`])
                }
              } else if (eventType === "agent_complete") {
                const agentId = data.agent as AgentId
                if (agentId) {
                  setStatuses((s) => ({ ...s, [agentId]: "done" }))
                }
              } else if (eventType === "synthesis_start") {
                setStatusMsg("Writing the verdict...")
              } else if (eventType === "synthesis_log") {
                if (data.line) {
                  setActiveLogs((prev) => [...prev.slice(-10), `[Synthesizer] ${data.line}`])
                }
              } else if (eventType === "report_ready") {
                if (data.report) {
                  const parsed = convertBackendReportToAnalysis(data.report)
                  finalAnalysisRef.current = parsed
                  setReadyReport(parsed)
                }
              } else if (eventType === "agent_error") {
                setErrorMessage(data.note || "Analysis encountered a server error.")
                return
              } else if (eventType === "done") {
                setStatuses({
                  fundamentals: "done",
                  sentiment: "done",
                  industry: "done",
                  technical: "done",
                })
                const finalData = finalAnalysisRef.current
                if (finalData) {
                  if (!isCancelled) onComplete(finalData)
                } else {
                  setErrorMessage("Backend analysis finished but report payload was incomplete.")
                  return
                }
              }
            } catch (err: any) {
              console.error("SSE JSON parsing error:", err, "raw data:", dataStr)
            }
          }
        }
      } catch (err: any) {
        if (err.name === "AbortError" || isCancelled) return
        setErrorMessage(err.message || `Failed to connect to backend server at ${backendUrl}`)
      }
    }

    streamAnalysis()

    return () => {
      isCancelled = true
      abortController.abort()
    }
  }, [ticker, onComplete])

  const doneCount = AGENTS.filter((a) => statuses[a.id] === "done").length

  return (
    <div className="flex flex-col items-center">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate"
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin text-signal" aria-hidden="true" />
        Researching · {doneCount}/{AGENTS.length} lenses
      </motion.div>

      <h2 className="mb-1 text-center font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
        {ticker.toUpperCase()}
      </h2>
      <p className="tabular mb-6 text-sm text-muted-foreground">
        {statusMsg}
      </p>

      {errorMessage ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="my-6 max-w-md rounded-xl border border-destructive/50 bg-destructive/10 p-5 text-center"
        >
          <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-destructive" />
          <h3 className="font-display text-base font-bold text-destructive">Analysis Failed</h3>
          <p className="mt-1 text-xs text-foreground/90">{errorMessage}</p>
          <button
            onClick={() => onError(errorMessage)}
            className="mt-4 rounded-lg bg-destructive px-4 py-2 text-xs font-semibold text-destructive-foreground hover:brightness-95"
          >
            Back to Search
          </button>
        </motion.div>
      ) : (
        <>
          <PulseRing
            ticker={ticker}
            statuses={statuses}
            size={300}
            verdict={readyReport?.verdict || null}
          />

          {readyReport && (
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={() => onComplete(readyReport)}
              className="mt-4 flex items-center gap-2 rounded-lg bg-signal px-6 py-2.5 text-sm font-semibold text-signal-foreground shadow-lg hover:brightness-95"
            >
              View Full Verdict & Disagreement Analysis
              <ArrowRight className="h-4 w-4" />
            </motion.button>
          )}

          {/* agent finding cards */}
          <div className="mt-8 grid w-full max-w-3xl gap-3 sm:grid-cols-2">
            {AGENTS.map((agent) => {
              const done = statuses[agent.id] === "done"
              const agentLogs = logs[agent.id] || []
              const latestLog = agentLogs.length > 0 ? agentLogs[agentLogs.length - 1] : null

              return (
                <div
                  key={agent.id}
                  className="relative overflow-hidden rounded-xl border border-border bg-card p-4"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                      style={{
                        backgroundColor: done ? agent.colorVar : "var(--secondary)",
                        color: done ? "#102018" : "var(--slate)",
                      }}
                    >
                      {done ? (
                        <Check className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="font-display text-sm font-semibold text-foreground">
                        {agent.name}
                      </p>
                      <p className="text-xs uppercase tracking-wider text-slate">
                        {agent.role}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 min-h-[2.5rem]">
                    <AnimatePresence mode="wait">
                      {done ? (
                        <motion.p
                          key="finding"
                          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.4, ease: "easeOut" }}
                          className="text-xs leading-relaxed text-foreground/90"
                        >
                          {latestLog || "Analysis completed successfully."}
                        </motion.p>
                      ) : (
                        <motion.div
                          key="thinking"
                          exit={{ opacity: 0 }}
                          className="flex flex-col gap-1 pt-1"
                          aria-label="thinking"
                        >
                          <div className="flex gap-1.5">
                            {[0, 1, 2].map((d) => (
                              <motion.span
                                key={d}
                                className="h-1.5 w-1.5 rounded-full bg-slate"
                                animate={reduce ? undefined : { opacity: [0.3, 1, 0.3] }}
                                transition={{
                                  duration: 1.2,
                                  repeat: Infinity,
                                  delay: d * 0.2,
                                }}
                              />
                            ))}
                          </div>
                          {latestLog && (
                            <p className="truncate text-[11px] text-muted-foreground">
                              {latestLog}
                            </p>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Live Streaming Log Terminal */}
          {activeLogs.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6 w-full max-w-3xl overflow-hidden rounded-xl border border-border/80 bg-background/80 p-3 font-mono text-[11px] text-signal backdrop-blur-md shadow-xl"
            >
              <div className="mb-2 flex items-center gap-2 border-b border-white/10 pb-1 text-slate">
                <Terminal className="h-3.5 w-3.5 text-signal" />
                <span className="text-[10px] font-sans uppercase tracking-widest">Live research</span>
              </div>
              <div className="flex max-h-24 flex-col gap-1 overflow-y-auto">
                {activeLogs.slice(-4).map((log, idx) => (
                  <p key={idx} className="truncate">
                    {log}
                  </p>
                ))}
              </div>
            </motion.div>
          )}
        </>
      )}
    </div>
  )
}
