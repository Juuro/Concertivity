import { withSentryConfig } from "@sentry/nextjs"
/** @type {import('next').NextConfig} */
const nextConfig = {
  productionBrowserSourceMaps: false,
  reactStrictMode: true,
  serverExternalPackages: [
    "@prisma/client",
    "@prisma/adapter-pg",
    "pg",
    "prisma",
    "@paddle/paddle-node-sdk",
  ],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "upload.wikimedia.org",
      },
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
      },
    ],
  },
  sassOptions: {
    includePaths: ["./src/styles"],
  },
}

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "sebastian-engel",

  project: "concertivity",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Don't serve client source maps in production; upload to Sentry then remove from build output
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: "/monitoring",
})
