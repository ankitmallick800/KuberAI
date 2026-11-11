/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async rewrites() {
    // Vercel routes /api to the FastAPI service. Local next dev proxies it.
    if (process.env.VERCEL) return []
    return [
      {
        source: "/api/:path*",
        destination: "http://127.0.0.1:8000/:path*",
      },
    ]
  },
}

export default nextConfig
