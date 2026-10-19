import { describe, it, expect, vi, beforeEach } from "vitest"
import { prisma } from "@/lib/prisma"
import { syncAppFeedbackGithubState } from "./sync-app-feedback-github"

vi.mock("@/lib/github/fetch-github-issue-state", () => ({
  fetchGithubIssueStateByNumber: vi.fn(),
}))

import { fetchGithubIssueStateByNumber } from "@/lib/github/fetch-github-issue-state"
const mockFetchState = vi.mocked(fetchGithubIssueStateByNumber)

const mockPrisma = vi.mocked(prisma, { deep: true })

const BASE_ROW = {
  id: "fb-1",
  githubIssueNumber: 42,
  triageStatus: "NEW",
  closedAt: null,
} as const

const ADMIN_USER = { id: "admin-1" }

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.FEEDBACK_GITHUB_CLOSE_SETS_DONE

  mockPrisma.appFeedback.findUnique.mockResolvedValue(BASE_ROW as never)
  mockPrisma.user.findFirst.mockResolvedValue(ADMIN_USER as never)

  const updatedRow = {
    ...BASE_ROW,
    githubIssueState: "OPEN",
    githubSyncedAt: new Date(),
  }
  mockPrisma.$transaction.mockImplementation(async (ops: unknown) => {
    if (Array.isArray(ops)) {
      return Promise.all(ops)
    }
    return Promise.resolve(undefined)
  })
  mockPrisma.appFeedback.update.mockResolvedValue(updatedRow as never)
  mockPrisma.adminActivity.create.mockResolvedValue({} as never)
})

describe("syncAppFeedbackGithubState", () => {
  it("maps GitHub OPEN state to OPEN in Prisma", async () => {
    mockFetchState.mockResolvedValue({ state: "OPEN" })

    const result = await syncAppFeedbackGithubState("fb-1", {
      actorUserId: "admin-1",
    })

    expect(mockPrisma.appFeedback.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ githubIssueState: "OPEN" }),
      })
    )
    expect(result.autoDoneApplied).toBe(false)
  })

  it("maps GitHub CLOSED state to CLOSED in Prisma", async () => {
    mockFetchState.mockResolvedValue({ state: "CLOSED" })

    await syncAppFeedbackGithubState("fb-1", { actorUserId: "admin-1" })

    expect(mockPrisma.appFeedback.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ githubIssueState: "CLOSED" }),
      })
    )
  })

  it("does NOT set triageStatus=DONE when FEEDBACK_GITHUB_CLOSE_SETS_DONE is unset", async () => {
    mockFetchState.mockResolvedValue({ state: "CLOSED" })

    const result = await syncAppFeedbackGithubState("fb-1", {
      actorUserId: "admin-1",
    })

    expect(mockPrisma.appFeedback.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ triageStatus: "DONE" }),
      })
    )
    expect(result.autoDoneApplied).toBe(false)
  })

  it('sets triageStatus=DONE when FEEDBACK_GITHUB_CLOSE_SETS_DONE="true" and issue is CLOSED', async () => {
    process.env.FEEDBACK_GITHUB_CLOSE_SETS_DONE = "true"
    mockFetchState.mockResolvedValue({ state: "CLOSED" })

    const result = await syncAppFeedbackGithubState("fb-1", {
      actorUserId: "admin-1",
    })

    expect(mockPrisma.appFeedback.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          triageStatus: "DONE",
          closedAt: expect.any(Date),
        }),
      })
    )
    expect(result.autoDoneApplied).toBe(true)
  })

  it('sets triageStatus=DONE when FEEDBACK_GITHUB_CLOSE_SETS_DONE="1"', async () => {
    process.env.FEEDBACK_GITHUB_CLOSE_SETS_DONE = "1"
    mockFetchState.mockResolvedValue({ state: "CLOSED" })

    const result = await syncAppFeedbackGithubState("fb-1", {
      actorUserId: "admin-1",
    })

    expect(result.autoDoneApplied).toBe(true)
  })

  it('does NOT set triageStatus=DONE when FEEDBACK_GITHUB_CLOSE_SETS_DONE="false"', async () => {
    process.env.FEEDBACK_GITHUB_CLOSE_SETS_DONE = "false"
    mockFetchState.mockResolvedValue({ state: "CLOSED" })

    const result = await syncAppFeedbackGithubState("fb-1", {
      actorUserId: "admin-1",
    })

    expect(result.autoDoneApplied).toBe(false)
  })

  it("does NOT auto-set DONE when row is already DONE", async () => {
    process.env.FEEDBACK_GITHUB_CLOSE_SETS_DONE = "true"
    mockPrisma.appFeedback.findUnique.mockResolvedValue({
      ...BASE_ROW,
      triageStatus: "DONE",
    } as never)
    mockFetchState.mockResolvedValue({ state: "CLOSED" })

    const result = await syncAppFeedbackGithubState("fb-1", {
      actorUserId: "admin-1",
    })

    expect(result.autoDoneApplied).toBe(false)
  })

  it("does NOT auto-set DONE when row is already DISCARDED", async () => {
    process.env.FEEDBACK_GITHUB_CLOSE_SETS_DONE = "true"
    mockPrisma.appFeedback.findUnique.mockResolvedValue({
      ...BASE_ROW,
      triageStatus: "DISCARDED",
    } as never)
    mockFetchState.mockResolvedValue({ state: "CLOSED" })

    const result = await syncAppFeedbackGithubState("fb-1", {
      actorUserId: "admin-1",
    })

    expect(result.autoDoneApplied).toBe(false)
  })

  it("uses explicit actorUserId without querying for an admin", async () => {
    mockFetchState.mockResolvedValue({ state: "OPEN" })

    await syncAppFeedbackGithubState("fb-1", { actorUserId: "explicit-user" })

    expect(mockPrisma.user.findFirst).not.toHaveBeenCalled()
  })

  it("falls back to first admin user when no actorUserId provided", async () => {
    mockFetchState.mockResolvedValue({ state: "OPEN" })

    await syncAppFeedbackGithubState("fb-1", {})

    expect(mockPrisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { role: "admin" } })
    )
  })

  it("throws when feedback is not found", async () => {
    mockPrisma.appFeedback.findUnique.mockResolvedValue(null as never)

    await expect(
      syncAppFeedbackGithubState("fb-missing", { actorUserId: "admin-1" })
    ).rejects.toThrow("Feedback not found")
  })

  it("throws when no GitHub issue is linked", async () => {
    mockPrisma.appFeedback.findUnique.mockResolvedValue({
      ...BASE_ROW,
      githubIssueNumber: null,
    } as never)

    await expect(
      syncAppFeedbackGithubState("fb-1", { actorUserId: "admin-1" })
    ).rejects.toThrow("No GitHub issue linked")
  })

  it("includes autoDoneApplied flag in the audit log details", async () => {
    process.env.FEEDBACK_GITHUB_CLOSE_SETS_DONE = "true"
    mockFetchState.mockResolvedValue({ state: "CLOSED" })

    await syncAppFeedbackGithubState("fb-1", { actorUserId: "admin-1" })

    // The adminActivity.create call is inside the $transaction array
    expect(mockPrisma.adminActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          details: expect.objectContaining({ autoDoneApplied: true }),
        }),
      })
    )
  })
})
