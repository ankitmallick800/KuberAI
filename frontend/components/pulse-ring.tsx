"use client"

import { motion, useReducedMotion } from "motion/react"
import { AGENTS, type AgentId, type Verdict } from "@/lib/kuberai-data"

export type AgentStatus = "idle" | "thinking" | "done"

interface PulseRingProps {
  ticker: string
  statuses: Record<AgentId, AgentStatus>
  size?: number
  verdict?: Verdict | null
  /** compact hides the ticker label styling weight; used in nav */
  subdued?: boolean
}

const VERDICT_COPY: Record<Verdict, string> = {
  Buy: "Buy",
  Hold: "Hold",
  Watch: "Watch",
  Sell: "Sell",
  Accumulate: "Accumulate",
}

export function PulseRing({
  ticker,
  statuses,
  size = 260,
  verdict = null,
  subdued = false,
}: PulseRingProps) {
  const reduce = useReducedMotion()
  const cx = size / 2
  const cy = size / 2
  const radius = size / 2 - size * 0.11
  const nodeSize = Math.max(14, size * 0.075)

  const allDone = AGENTS.every((a) => statuses[a.id] === "done")
  const isMini = size < 90
  const showVerdict = Boolean(verdict) && allDone && !isMini

  return (
    <div
      className="relative"
      style={{ width: size, height: size }}
      role="img"
      aria-label={
        showVerdict
          ? `${ticker} verdict: ${verdict}`
          : `${ticker} analysis in progress`
      }
    >
      {/* base track ring */}
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="absolute inset-0"
        aria-hidden="true"
      >
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="var(--border)"
          strokeWidth={1.5}
          strokeDasharray="2 6"
          className="opacity-60"
        />
        {/* converging arcs drawn to each node when done */}
        {AGENTS.map((agent) => {
          const rad = (agent.angle - 90) * (Math.PI / 180)
          const x = cx + radius * Math.cos(rad)
          const y = cy + radius * Math.sin(rad)
          const done = statuses[agent.id] === "done"
          return (
            <motion.line
              key={agent.id}
              x1={cx}
              y1={cy}
              x2={x}
              y2={y}
              stroke={showVerdict ? "var(--signal)" : agent.colorVar}
              strokeWidth={1.25}
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{
                pathLength: done ? 1 : 0,
                opacity: done ? (showVerdict ? 0.55 : 0.3) : 0,
              }}
              transition={{ duration: reduce ? 0 : 0.6, ease: "easeOut" }}
            />
          )
        })}
      </svg>

      {/* center: ticker or verdict badge */}
      <div className="absolute inset-0 flex items-center justify-center">
        {showVerdict && verdict ? (
          <motion.div
            key="verdict"
            initial={reduce ? { scale: 1, opacity: 0 } : { scale: 0.3, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={
              reduce
                ? { duration: 0.15 }
                : { type: "spring", stiffness: 420, damping: 16, mass: 0.9 }
            }
            className="flex flex-col items-center justify-center rounded-full border-2 border-signal bg-signal/10"
            style={{ width: radius * 1.25, height: radius * 1.25 }}
          >
            <span className="font-display text-xs uppercase tracking-[0.2em] text-signal/70">
              KuberAI
            </span>
            <span className="font-display text-2xl font-bold text-signal sm:text-3xl">
              {VERDICT_COPY[verdict] || verdict}
            </span>
            <span className="tabular text-xs text-muted-foreground">{ticker}</span>
          </motion.div>
        ) : isMini ? (
          <span
            className="rounded-full"
            style={{
              width: size * 0.22,
              height: size * 0.22,
              backgroundColor: allDone && verdict ? "var(--signal)" : "var(--slate)",
            }}
          />
        ) : (
          <div className="flex flex-col items-center justify-center">
            <span
              className={`font-display font-bold tracking-tight text-foreground ${
                subdued ? "text-lg" : "text-2xl sm:text-3xl"
              }`}
            >
              {ticker}
            </span>
            {!subdued && (
              <span className="mt-0.5 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                deliberating
              </span>
            )}
          </div>
        )}
      </div>

      {/* orbiting agent nodes */}
      {AGENTS.map((agent) => {
        const rad = (agent.angle - 90) * (Math.PI / 180)
        const x = cx + radius * Math.cos(rad) - nodeSize / 2
        const y = cy + radius * Math.sin(rad) - nodeSize / 2
        const status = statuses[agent.id]
        const active = status === "thinking"
        const done = status === "done"
        const color = done || active ? agent.colorVar : "var(--slate)"

        return (
          <div
            key={agent.id}
            className="absolute"
            style={{ left: x, top: y, width: nodeSize, height: nodeSize }}
          >
            {/* pulse halo while thinking */}
            {active && !reduce && (
              <motion.span
                className="absolute inset-0 rounded-full"
                style={{ backgroundColor: agent.colorVar }}
                initial={{ scale: 1, opacity: 0.5 }}
                animate={{ scale: 2.4, opacity: 0 }}
                transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
              />
            )}
            <motion.span
              className="absolute inset-0 rounded-full border"
              style={{ backgroundColor: color, borderColor: color }}
              animate={{
                opacity: done ? 1 : active ? 1 : 0.4,
                scale: done ? 1 : active && !reduce ? [1, 1.18, 1] : 1,
              }}
              transition={
                active && !reduce
                  ? { duration: 1.4, repeat: Infinity, ease: "easeInOut" }
                  : { duration: 0.3 }
              }
            />
          </div>
        )
      })}
    </div>
  )
}
