import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const { prismaClientInstances, prismaPgConfigs, PrismaClient, PrismaPg } =
  vi.hoisted(() => {
    const prismaClientInstances: Array<{
      opts: {
        accelerateUrl?: string
        adapter?: unknown
        log: string[]
      }
      user: { findMany: ReturnType<typeof vi.fn> }
      $connect: ReturnType<typeof vi.fn>
    }> = []
    const prismaPgConfigs: Array<Record<string, unknown>> = []

    class MockPrismaClient {
      opts: { accelerateUrl?: string; adapter?: unknown; log: string[] }
      user = { findMany: vi.fn() }
      $connect = vi.fn()

      constructor(opts: {
        accelerateUrl?: string
        adapter?: unknown
        log: string[]
      }) {
        this.opts = opts
        prismaClientInstances.push(this)
      }
    }

    class MockPrismaPg {
      config: Record<string, unknown>

      constructor(config: Record<string, unknown>) {
        this.config = config
        prismaPgConfigs.push(config)
      }
    }

    return {
      prismaClientInstances,
      prismaPgConfigs,
      PrismaClient: vi.fn(MockPrismaClient),
      PrismaPg: vi.fn(MockPrismaPg),
    }
  })

vi.mock("@/generated/prisma/client", () => ({ PrismaClient }))
vi.mock("@prisma/adapter-pg", () => ({ PrismaPg }))
vi.unmock("@/lib/prisma")

const RUNTIME_ENV_KEYS = [
  "PRISMA_DATABASE_URL",
  "DATABASE_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL",
  "POSTGRES_URL_NON_POOLING",
  "NODE_ENV",
] as const

const ACCELERATE_URL = "prisma+postgres://accelerate.prisma-data.net/?api_key=x"
const DIRECT_URL = "postgresql://user@localhost:5432/concertivity"

function clearRuntimeEnv(): void {
  for (const key of RUNTIME_ENV_KEYS) {
    delete process.env[key]
  }
}

function clearPrismaGlobals(): void {
  const globalForPrisma = globalThis as { prisma?: unknown }
  delete globalForPrisma.prisma
}

function resetTestState(): void {
  vi.unstubAllEnvs()
  clearRuntimeEnv()
  clearPrismaGlobals()
  prismaClientInstances.length = 0
  prismaPgConfigs.length = 0
  vi.clearAllMocks()
}

async function importPrismaModule() {
  return import("@/lib/prisma")
}

describe("resolveAccelerateUrl", () => {
  let resolveAccelerateUrl: () => string | undefined

  beforeEach(async () => {
    resetTestState()
    ;({ resolveAccelerateUrl } = await importPrismaModule())
  })

  afterEach(resetTestState)

  test("prefers PRISMA_DATABASE_URL", () => {
    process.env.PRISMA_DATABASE_URL = ACCELERATE_URL
    process.env.DATABASE_URL = "prisma+postgres://other/?api_key=y"
    expect(resolveAccelerateUrl()).toBe(ACCELERATE_URL)
  })

  test("accepts an accelerate DATABASE_URL", () => {
    process.env.DATABASE_URL = ACCELERATE_URL
    expect(resolveAccelerateUrl()).toBe(ACCELERATE_URL)
  })

  test("returns undefined for a direct postgres DATABASE_URL", () => {
    process.env.DATABASE_URL = DIRECT_URL
    expect(resolveAccelerateUrl()).toBeUndefined()
  })

  test("returns undefined when nothing is set", () => {
    expect(resolveAccelerateUrl()).toBeUndefined()
  })
})

describe("resolveDirectDatabaseUrl", () => {
  let resolveDirectDatabaseUrl: () => string | undefined

  beforeEach(async () => {
    resetTestState()
    ;({ resolveDirectDatabaseUrl } = await importPrismaModule())
  })

  afterEach(resetTestState)

  test("returns a direct postgres url", () => {
    process.env.DATABASE_URL = DIRECT_URL
    expect(resolveDirectDatabaseUrl()).toBe(DIRECT_URL)
  })

  test("ignores an accelerate url", () => {
    process.env.DATABASE_URL = ACCELERATE_URL
    process.env.POSTGRES_URL = "postgres://user@localhost:5432/db"
    expect(resolveDirectDatabaseUrl()).toBe("postgres://user@localhost:5432/db")
  })

  test("returns undefined when only an accelerate url is set", () => {
    process.env.PRISMA_DATABASE_URL = ACCELERATE_URL
    expect(resolveDirectDatabaseUrl()).toBeUndefined()
  })
})

describe("prisma lazy initialization (Accelerate mode)", () => {
  let prisma: Awaited<ReturnType<typeof importPrismaModule>>["prisma"]

  beforeEach(async () => {
    resetTestState()
    process.env.PRISMA_DATABASE_URL = ACCELERATE_URL
    ;({ prisma } = await importPrismaModule())
  })

  afterEach(resetTestState)

  test("creates one client with accelerateUrl and no adapter", () => {
    const userModel = prisma.user
    const connect = prisma.$connect

    expect(PrismaClient).toHaveBeenCalledTimes(1)
    expect(PrismaPg).not.toHaveBeenCalled()
    expect(prismaClientInstances[0]?.opts.accelerateUrl).toBe(ACCELERATE_URL)
    expect(prismaClientInstances[0]?.opts.adapter).toBeUndefined()
    expect(userModel).toBe(prismaClientInstances[0]?.user)
    expect(typeof connect).toBe("function")
    expect(connect).not.toBe(prismaClientInstances[0]?.$connect)
  })

  test("reuses the cached client", () => {
    void prisma.user
    void prisma.$connect
    expect(PrismaClient).toHaveBeenCalledTimes(1)
  })

  test("verbose logging in development", () => {
    vi.stubEnv("NODE_ENV", "development")
    void prisma.user
    expect(prismaClientInstances[0]?.opts.log).toEqual([
      "query",
      "error",
      "warn",
    ])
  })

  test("error-only logging outside development", () => {
    vi.stubEnv("NODE_ENV", "production")
    void prisma.user
    expect(prismaClientInstances[0]?.opts.log).toEqual(["error"])
  })
})

describe("prisma lazy initialization (direct adapter mode)", () => {
  let prisma: Awaited<ReturnType<typeof importPrismaModule>>["prisma"]

  beforeEach(async () => {
    resetTestState()
    process.env.DATABASE_URL = DIRECT_URL
    ;({ prisma } = await importPrismaModule())
  })

  afterEach(resetTestState)

  test("creates a client with a PrismaPg adapter built from the config", () => {
    void prisma.user

    expect(PrismaClient).toHaveBeenCalledTimes(1)
    expect(PrismaPg).toHaveBeenCalledTimes(1)
    // PrismaPg must receive a config object with connectionString, never a Pool.
    expect(prismaPgConfigs[0]).toEqual({ connectionString: DIRECT_URL })
    expect(prismaClientInstances[0]?.opts.adapter).toBeDefined()
    expect(prismaClientInstances[0]?.opts.accelerateUrl).toBeUndefined()
  })
})

describe("prisma lazy initialization (misconfigured)", () => {
  beforeEach(resetTestState)
  afterEach(resetTestState)

  test("throws when neither an accelerate nor a direct url is set", async () => {
    const { prisma } = await importPrismaModule()
    expect(() => prisma.user).toThrow(/Missing database URL/)
  })
})
