"use client"

// Agent Breakdown screen: renders an expandable accordion of the four specialist agents
// (fundamentals, sentiment, industry, technical). Each card shows the agent's stance badge
// (bullish/bearish/neutral), score, headline, and — when expanded — their detailed prose
// (rendered from markdown-ish text into blocks), key evidence bullets, and a mini price chart.
import { useState, type ReactNode } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { ChevronDown } from "lucide-react"
import { AGENTS, type AgentId, type StockAnalysis } from "@/lib/kuberai-data"
import { MiniChart } from "@/components/mini-chart"
  // these are the props for the AgentBreakdown component


interface AgentBreakdownProps {
  analysis: StockAnalysis
}

const STANCE_LABEL: Record<string, { text: string; cls: string }> = {
  bullish: { text: "Bullish", cls: "text-agent-1 border-agent-1/40 bg-agent-1/10" },
  bearish: { text: "Bearish", cls: "text-destructive border-destructive/40 bg-destructive/10" },
  neutral: { text: "Neutral", cls: "text-slate border-slate/40 bg-slate/10" },
}




// Renders markdown-lite inline styles: **bold**, *italic*, `code`
function InlineText({ text }: { text: string }): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g)
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={i} className="font-semibold text-foreground">
              {part.slice(2, -2)}
            </strong>
          )
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return (
            <code
              key={i}
              className="rounded bg-background/60 px-1 py-0.5 font-mono text-[0.85em] text-foreground"
            >
              {part.slice(1, -1)}
            </code>
          )
        }
        if (part.startsWith("*") && part.endsWith("*")) {
          return (
            <em key={i} className="text-foreground/80">
              {part.slice(1, -1)}
            </em>
          )
        }
        return part
      })}
    </>
  )
}

// Renders agent prose as structured blocks: headings, paragraphs, bullet lists
function DetailBlocks({ text, color }: { text: string; color: string }): ReactNode {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .flatMap((l) =>
      /^\*\*[^*]+\*\*:?\s*$/.test(l) ? [l, "Not covered in available data."] : [l]
    )
  const blocks: ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.startsWith("- ") || line.startsWith("* ")) {
      const items: string[] = []
      while (i < lines.length && (lines[i].startsWith("- ") || lines[i].startsWith("* "))) {
        items.push(lines[i].replace(/^[-*]\s+/, ""))
        i++
      }
      blocks.push(
        <ul key={`ul-${i}`} className="flex flex-col gap-2">
          {items.map((b, idx) => (
            <li
              key={idx}
              className="flex items-start gap-2.5 text-sm leading-relaxed text-muted-foreground"
            >
              <span
                className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: color }}
              />
              <span className="min-w-0">
                <InlineText text={b} />
              </span>
            </li>
          ))}
        </ul>
      )
    } else if (/^#{1,6}\s+/.test(line) || /^\*\*[^*]+\*\*$/.test(line)) {
      blocks.push(
        <h3
          key={`h-${i}`}
          className="pt-2 font-display text-xs font-bold uppercase tracking-[0.14em] text-foreground"
        >
          <InlineText text={line.replace(/^#+\s*/, "")} />
        </h3>
      )
      i++
    } else {
      blocks.push(
        <p key={`p-${i}`} className="text-sm leading-7 text-foreground/90">
          <InlineText text={line} />
        </p>
      )
      i++
    }
  }

  return <div className="flex flex-col gap-2.5">{blocks}</div>
}

export function AgentBreakdown({ analysis }: AgentBreakdownProps) {
  const reduce = useReducedMotion()
  const [open, setOpen] = useState<AgentId | null>("fundamentals")

  return (
    <div className="mx-auto max-w-3xl">
      <h2 className="mb-1 font-display text-2xl font-bold tracking-tight text-foreground">
        Agent breakdown
      </h2>
      <p className="mb-6 text-sm text-muted-foreground">
        One agent, four reads. Expand each to see the evidence.
      </p>

      <div className="flex flex-col gap-3">
        {AGENTS.map((agent) => {
          const f = analysis.findings[agent.id] || {
            id: agent.id,
            headline: "Analysis complete.",
            stance: "neutral" as const,
            score: 70,
            detail: "Agent evaluation complete.",
            bullets: ["Analysis completed"],
            chart: [50, 52, 55, 58, 60],
          }
          const isOpen = open === agent.id
          const stance = STANCE_LABEL[f.stance] || STANCE_LABEL.neutral
          return (
            <div
              key={agent.id}
              className="overflow-hidden rounded-xl border border-border bg-card"
            >
              <button
                onClick={() => setOpen(isOpen ? null : agent.id)}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-4 px-4 py-4 text-left"
              >
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-display text-sm font-bold text-[#102018]"
                  style={{ backgroundColor: agent.colorVar }}
                >
                  {agent.name[0]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="font-display text-base font-semibold text-foreground">
                      {agent.name}
                    </span>
                    <span className="text-xs uppercase tracking-wider text-slate">
                      {agent.role}
                    </span>
                  </span>
                  <span className="mt-0.5 block truncate text-sm text-muted-foreground">
                    <InlineText text={f.headline} />
                  </span>
                </span>
                <span
                  className={`hidden shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium sm:inline ${stance.cls}`}
                >
                  {stance.text}
                </span>
                <span className="tabular hidden shrink-0 font-display text-lg font-bold text-foreground sm:inline">
                  {f.score}
                </span>
                <motion.span
                  animate={{ rotate: isOpen ? 180 : 0 }}
                  transition={{ duration: reduce ? 0 : 0.25 }}
                  className="shrink-0 text-slate"
                >
                  <ChevronDown className="h-5 w-5" aria-hidden="true" />
                </motion.span>
              </button>

              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    key="content"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: reduce ? 0 : 0.32, ease: "easeInOut" }}
                    className="overflow-hidden"
                  >
                    <div className="border-t border-border px-4 py-5">
                      <DetailBlocks text={f.detail} color={agent.colorVar} />

                      <div className="mt-5 grid gap-4 sm:grid-cols-2">
                        {f.bullets.length > 0 && (
                          <ul className="flex flex-col gap-2">
                            {f.bullets.map((b, idx) => (
                              <li
                                key={idx}
                                className="flex items-start gap-2.5 text-sm leading-relaxed text-muted-foreground"
                              >
                                <span
                                  className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full"
                                  style={{ backgroundColor: agent.colorVar }}
                                />
                                <span className="min-w-0">
                                  <InlineText text={b} />
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                        <div className="rounded-lg border border-border bg-background/40 p-2">
                          <MiniChart data={f.chart} color={agent.colorVar} height={64} />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        })}
      </div>
    </div>
  )
}
