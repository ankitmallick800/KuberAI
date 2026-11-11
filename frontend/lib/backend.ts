/** URL for a FastAPI path such as `/suggest` or `/analyze`.
 * On Vercel the app and API share one domain under `/api`.
 * Set NEXT_PUBLIC_BACKEND_URL to call a backend on another host.
 */
export function backendPath(path: string): string {
  const configured = process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, "")
  const normalized = path.startsWith("/") ? path : `/${path}`
  if (configured) return `${configured}${normalized}`
  return `/api${normalized}`
}
