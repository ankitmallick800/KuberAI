const pages = process.env.GITHUB_PAGES === "true"

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

// GitHub Pages is a static host under /KuberAI. Vercel routes /api itself.
if (pages) {
  nextConfig.output = "export"
  nextConfig.basePath = "/KuberAI"
  nextConfig.trailingSlash = true
} else if (!process.env.VERCEL) {
  nextConfig.rewrites = async () => [
    {
      source: "/api/:path*",
      destination: "http://127.0.0.1:8000/:path*",
    },
  ]
}

export default nextConfig
