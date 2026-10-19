// Prisma configuration
// Supports both local development and Vercel Postgres
import "dotenv/config"
import { defineConfig } from "prisma/config"

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Use POSTGRES_PRISMA_URL for connection pooling on Vercel
    // Falls back to DATABASE_URL for local development
    url:
      process.env["POSTGRES_PRISMA_URL"] ||
      process.env["DATABASE_URL"] ||
      process.env["POSTGRES_URL"],
  },
})
