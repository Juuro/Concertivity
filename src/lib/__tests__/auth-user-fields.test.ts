import { describe, it, expect, vi } from "vitest"

vi.mock("../prisma", () => ({ prisma: {} }))
vi.mock("../email", () => ({
  sendVerificationEmail: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
}))
vi.mock("../ban", () => ({ checkUserBan: vi.fn() }))

import { parseUserInput } from "better-auth/db"
import { auth } from "../auth"

const CLIENT_BLOCKED_FIELDS: Record<string, unknown> = {
  username: "Not Valid/../Name",
  isPublic: true,
  currency: "XXX",
  hideLocationPublic: false,
  hideCostPublic: false,
  includeUserIdInErrorReports: false,
  role: "admin",
  banned: true,
}

describe("better-auth user input", () => {
  // better-auth throws for truthy values on `input: false` fields and silently
  // drops falsy ones; either way the value must never reach the update.
  it.each(Object.keys(CLIENT_BLOCKED_FIELDS))(
    "never applies client-supplied %s on update-user",
    (field) => {
      let result: Record<string, unknown> | undefined
      try {
        result = parseUserInput(
          auth.options,
          { [field]: CLIENT_BLOCKED_FIELDS[field] },
          "update"
        )
      } catch {
        return
      }
      expect(result).not.toHaveProperty(field)
    }
  )

  it("still accepts no profile fields on update (name/image are handled separately)", () => {
    expect(parseUserInput(auth.options, {}, "update")).toEqual({})
  })
})
