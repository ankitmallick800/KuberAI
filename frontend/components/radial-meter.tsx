"use client"

import { motion, useReducedMotion } from "motion/react"

interface RadialMeterProps {
  value: number // 0-100
  size?: number
  label?: string
}

export function RadialMeter({ value, size = 132, label = "Confidence" }: RadialMeterProps) {
  const reduce = useReducedMotion()
  const stroke = 9
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const offset = c - (value / 100) * c

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--secondary)"
          strokeWidth={stroke}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--signal)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: reduce ? offset : c }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: reduce ? 0 : 1.1, ease: "easeOut", delay: 0.2 }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span
          className="tabular font-display text-3xl font-bold text-foreground"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          {Math.round(value)}
          <span className="text-lg text-muted-foreground">%</span>
        </motion.span>
        <span className="text-[10px] uppercase tracking-[0.2em] text-slate">{label}</span>
      </div>
    </div>
  )
}
