"use client"

// Debate View screen: surfaces where two agents materially disagreed. Renders a no-disagreement
// "aligned" state when the debate is absent, otherwise displays the two clashing claims as
// colliding bubbles, the step-by-step reasoning trail that led to the clash, and the lead
// synthesizer's final reconciliation. Includes a small Speaker subcomponent for agent avatars.
import { motion, useReducedMotion } from "motion/react"
import { Zap, Check } from "lucide-react"
import { AGENTS, type StockAnalysis } from "@/lib/kuberai-data"

interface DebateViewProps {
  analysis: StockAnalysis
}

export function DebateView({ analysis }: DebateViewProps) {
  const reduce = useReducedMotion()
  const d = analysis.debate

  if (!d) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 text-center">
          <motion.span
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="inline-flex items-center gap-2 rounded-full border border-signal/50 bg-signal/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-signal"
          >
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            Agents Aligned
          </motion.span>
          <h2 className="mt-4 text-balance font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            No material disagreement found
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            The four reads landed on the same side. Nothing in the evidence was strong enough to surface a debate.
          </p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="grid grid-cols-2 gap-3 sm:grid-cols-4"
        >
          {AGENTS.map((a) => (
            <div
              key={a.id}
              className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-4 text-center"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-signal/15 text-signal">
                <Check className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="font-display text-sm font-semibold text-foreground">
                {a.name}
              </span>
              <span className="text-xs uppercase tracking-wider text-slate">
                {a.role}
              </span>
            </div>
          ))}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mt-6 flex items-start gap-3 rounded-xl border border-signal/40 bg-signal/10 p-5"
        >
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-signal text-signal-foreground">
            <Check className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <p className="font-display text-sm font-semibold text-signal">Synthesizer Consensus</p>
            <p className="mt-1 text-pretty text-sm leading-relaxed text-foreground">
              With no opposing signals to reconcile, the synthesizer folded each specialist's read
              directly into the final verdict without modification.
            </p>
          </div>
        </motion.div>
      </div>
    )
  }
  const agentA = AGENTS.find((a) => a.id === d.agentA) || AGENTS[0]
  const agentB = AGENTS.find((a) => a.id === d.agentB) || AGENTS[3] || AGENTS[1]

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-8 text-center">
        <motion.span
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="inline-flex items-center gap-2 rounded-full border border-cold/50 bg-cold/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-cold"
        >
          <Zap className="h-3.5 w-3.5" aria-hidden="true" />
          Agents Disagreed
        </motion.span>
        <h2 className="mt-4 text-balance font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {d.topic}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {agentA.name} ({agentA.role}) and {agentB.name} ({agentB.role}) evaluated contrasting signals. Here is where their analyses clashed.
        </p>
      </div>

      {/* colliding bubbles */}
      <div className="relative grid gap-4 sm:grid-cols-2">
        <motion.div
          initial={reduce ? { opacity: 0 } : { opacity: 0, x: -60 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ type: "spring", stiffness: 140, damping: 16 }}
          className="relative rounded-2xl rounded-bl-sm border border-cold/50 bg-cold/10 p-5"
        >
          <Speaker agent={agentA} align="left" />
          <p className="mt-3 text-pretty text-sm leading-relaxed text-foreground">{d.claimA}</p>
        </motion.div>

        <motion.div
          initial={reduce ? { opacity: 0 } : { opacity: 0, x: 60 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ type: "spring", stiffness: 140, damping: 16, delay: 0.1 }}
          className="relative rounded-2xl rounded-br-sm border border-border bg-card p-5 sm:mt-10"
        >
          <Speaker agent={agentB} align="right" />
          <p className="mt-3 text-pretty text-sm leading-relaxed text-foreground">{d.claimB}</p>
        </motion.div>

        {/* collision spark */}
        {!reduce && (
          <motion.span
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: [0, 1, 0.7], scale: [0, 1.4, 1] }}
            transition={{ delay: 0.35, duration: 0.6 }}
            className="absolute left-1/2 top-1/2 z-10 hidden h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-cold bg-background sm:flex"
          >
            <Zap className="h-5 w-5 text-cold" aria-hidden="true" />
          </motion.span>
        )}
      </div>

      {/* reasoning trail */}
      <div className="mt-8">
        <p className="mb-4 text-xs uppercase tracking-[0.2em] text-slate">Reasoning trail & metric divergence</p>
        <ol className="relative flex flex-col gap-4 border-l border-cold/40 pl-6">
          {d.reasoning.map((step, i) => (
            <motion.li
              key={i}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5 + i * 0.15 }}
              className="relative"
            >
              <span className="absolute -left-[1.68rem] top-1 flex h-3 w-3 items-center justify-center rounded-full border border-cold bg-background">
                <span className="h-1.5 w-1.5 rounded-full bg-cold" />
              </span>
              <p className="text-sm leading-relaxed text-foreground/90">{step}</p>
            </motion.li>
          ))}
        </ol>
      </div>

      {/* resolution — reconciled, amber (verdict moment) */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 + d.reasoning.length * 0.15 + 0.1 }}
        className="mt-6 flex items-start gap-3 rounded-xl border border-signal/40 bg-signal/10 p-5"
      >
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-signal text-signal-foreground">
          <Check className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <p className="font-display text-sm font-semibold text-signal">Synthesizer Reconciliation</p>
          <p className="mt-1 text-pretty text-sm leading-relaxed text-foreground">{d.resolution}</p>
        </div>
      </motion.div>
    </div>
  )
}

function Speaker({
  agent,
  align,
}: {
  agent: (typeof AGENTS)[number]
  align: "left" | "right"
}) {
  return (
    <div
      className={`flex items-center gap-2 ${align === "right" ? "sm:flex-row-reverse sm:text-right" : ""}`}
    >
      <span
        className="flex h-8 w-8 items-center justify-center rounded-full font-display text-xs font-bold text-[#102018]"
        style={{ backgroundColor: agent.colorVar }}
      >
        {agent.name[0]}
      </span>
      <div className={align === "right" ? "sm:text-right" : ""}>
        <p className="font-display text-sm font-semibold text-foreground">{agent.name}</p>
        <p className="text-xs uppercase tracking-wider text-slate">{agent.role}</p>
      </div>
    </div>
  )
}
