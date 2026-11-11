"use client"

import { motion, useReducedMotion } from "motion/react"

interface MiniChartProps {
  data: number[]
  color?: string
  height?: number
  className?: string
}

export function MiniChart({
  data,
  color = "var(--slate)",
  height = 56,
  className,
}: MiniChartProps) {
  const reduce = useReducedMotion()
  const width = 240
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  const step = width / (data.length - 1)

  const points = data.map((v, i) => {
    const x = i * step
    const y = height - ((v - min) / range) * (height - 8) - 4
    return [x, y] as const
  })

  const line = points.map(([x, y]) => `${x},${y}`).join(" ")
  const area = `0,${height} ${line} ${width},${height}`
  const gradId = `g-${color.replace(/[^a-z0-9]/gi, "")}`

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={className}
      style={{ width: "100%", height }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.22} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gradId})`} />
      <motion.polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={reduce ? { pathLength: 1 } : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: reduce ? 0 : 1, ease: "easeInOut" }}
      />
    </svg>
  )
}
