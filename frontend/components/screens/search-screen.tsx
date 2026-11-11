"use client"

// Search screen: ticker box, autocomplete, and trending chips. The Groq key stays on the server.
import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Search, TrendingUp, TrendingDown, CornerDownLeft } from "lucide-react"
import { backendPath } from "@/lib/backend"
import { TRENDING, searchTickers } from "@/lib/kuberai-data"

interface SearchScreenProps {
  onSelect: (ticker: string) => void
}

interface Suggestion {
  ticker: string
  name: string
  exchange?: string
}

export function SearchScreen({ onSelect }: SearchScreenProps) {
  const reduce = useReducedMotion()
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [results, setResults] = useState<Suggestion[]>([])
  const [searching, setSearching] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    localStorage.removeItem("verdikt_api_key")
    localStorage.removeItem("verdikt_llm_provider")
    localStorage.removeItem("verdikt_model")
    localStorage.removeItem("kuberai_api_key")
    localStorage.removeItem("kuberai_llm_provider")
    localStorage.removeItem("kuberai_model")
  }, [])

  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setResults([])
      setSearching(false)
      return
    }

    const local = searchTickers(q).map((item) => ({
      ticker: item.ticker,
      name: item.name,
    }))
    setResults(local)
    setActive(0)

    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(`${backendPath("/suggest")}?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        })
        if (!res.ok || controller.signal.aborted) return
        const data = await res.json()
        const remote: Suggestion[] = Array.isArray(data.results)
          ? data.results.filter((item: Suggestion) => item?.ticker && item?.name)
          : []
        if (controller.signal.aborted) return
        if (remote.length > 0) {
          setResults(remote)
          setActive(0)
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setResults(local)
        }
      } finally {
        if (!controller.signal.aborted) setSearching(false)
      }
    }, 180)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query])

  function submit(ticker: string) {
    if (!ticker) return
    onSelect(ticker.toUpperCase())
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return
    if (!open || results.length === 0) {
      if (e.key === "Enter" && query.trim()) submit(query.trim())
      return
    }
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActive((a) => (a + 1) % results.length)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActive((a) => (a - 1 + results.length) % results.length)
    } else if (e.key === "Enter") {
      e.preventDefault()
      submit(results[active]?.ticker ?? query.trim())
    } else if (e.key === "Escape") {
      setOpen(false)
    }
  }

  return (
    <div className="flex flex-col items-center pt-6 text-center sm:pt-14">
      <motion.span
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs uppercase tracking-[0.2em] text-slate"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-signal" />
        One agent. One verdict.
      </motion.span>

      <motion.h1
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.05 }}
        className="max-w-2xl text-balance font-display text-4xl font-bold leading-[1.05] tracking-tight text-foreground sm:text-6xl"
      >
        Watch AI research a stock{" "}
        <span className="text-signal">in real time.</span>
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.12 }}
        className="mt-4 max-w-lg text-pretty leading-relaxed text-muted-foreground"
      >
        One research agent reads fundamentals, sentiment, technicals and industry position,
        then returns a single call.
      </motion.p>

      {/* search input */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.18 }}
        className="relative z-20 mt-9 w-full max-w-xl"
      >
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate"
            aria-hidden="true"
          />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setOpen(true)
              setActive(0)
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
            onKeyDown={handleKeyDown}
            placeholder="Type a company or ticker — try Reliance, Apple, AAPL…"
            aria-label="Search a stock ticker or company"
            aria-expanded={open && results.length > 0}
            role="combobox"
            aria-controls="ticker-listbox"
            autoComplete="off"
            className="tabular h-14 w-full rounded-xl border border-border bg-card pl-12 pr-28 text-base text-foreground placeholder:text-slate focus:border-signal focus:outline-none"
          />
          <button
            onClick={() => submit(results[active]?.ticker ?? query.trim())}
            disabled={!query.trim()}
            className="absolute right-2 top-1/2 flex h-10 -translate-y-1/2 items-center gap-1.5 rounded-lg bg-signal px-4 text-sm font-semibold text-signal-foreground transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Analyze
            <CornerDownLeft className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <AnimatePresence>
          {open && (results.length > 0 || searching) && (
            <motion.ul
              id="ticker-listbox"
              role="listbox"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: reduce ? 0 : 0.18 }}
              className="absolute left-0 right-0 top-16 z-30 overflow-hidden rounded-xl border border-border bg-popover shadow-2xl shadow-black/40"
            >
              {searching && results.length === 0 && (
                <li className="px-4 py-3 text-left text-sm text-muted-foreground">
                  Looking up companies…
                </li>
              )}
              {results.map((r, i) => (
                <li key={r.ticker} role="option" aria-selected={i === active}>
                  <button
                    onMouseEnter={() => setActive(i)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => submit(r.ticker)}
                    className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition ${
                      i === active ? "bg-secondary" : "bg-transparent"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {r.name}
                      </span>
                      {r.exchange && (
                        <span className="block truncate text-xs text-slate">{r.exchange}</span>
                      )}
                    </span>
                    <span className="tabular shrink-0 rounded-md border border-border bg-background px-2 py-1 font-display text-xs font-bold text-foreground">
                      {r.ticker}
                    </span>
                  </button>
                </li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>

      </motion.div>

      {/* trending chips */}
      <div className="mt-8 w-full max-w-2xl">
        <p className="mb-3 text-xs uppercase tracking-[0.2em] text-slate">Trending now</p>
        <motion.div
          className="flex flex-wrap items-center justify-center gap-2"
          initial="hidden"
          animate="show"
          variants={{
            hidden: {},
            show: { transition: { staggerChildren: reduce ? 0 : 0.05 } },
          }}
        >
          {TRENDING.map((t) => {
            const up = t.change >= 0
            return (
              <motion.button
                key={t.ticker}
                variants={{
                  hidden: { opacity: 0, y: 10, scale: 0.96 },
                  show: { opacity: 1, y: 0, scale: 1 },
                }}
                whileHover={reduce ? undefined : { y: -2 }}
                onClick={() => submit(t.ticker)}
                className="group flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 transition hover:border-signal/60"
              >
                <span className="tabular font-display text-sm font-bold text-foreground">
                  {t.ticker}
                </span>
                <span
                  className={`flex items-center gap-1 text-xs ${
                    up ? "text-agent-1" : "text-slate"
                  }`}
                >
                  {up ? (
                    <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <TrendingDown className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {up ? "+" : ""}
                  {t.change.toFixed(2)}%
                </span>
              </motion.button>
            )
          })}
        </motion.div>
      </div>
    </div>
  )
}
