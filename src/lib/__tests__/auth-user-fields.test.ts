import { describe, it, expect } from "vitest"
import { parseUserInput } from "better-auth/db"
import { userAdditionalFields } from "../auth-user-fields"

const options = { user: { additionalFields: userAdditionalFields } }

// Profile fields must only be written through validated routes (e.g.
// PUT /api/user/profile), never through better-auth's own endpoints.
const CLIENT_BLOCKED_FIELDS: Record<string, unknown> = {
  username: "Not Valid/../Name",
  isPublic: true,
  currency: "XXX",
  hideLocationPublic: false,
  hideCostPublic: false,
  includeUserIdInErrorReports: false,
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
          options as never,
          { [field]: CLIENT_BLOCKED_FIELDS[field] },
          "update"
        )
      } catch {
        return
      }
      expect(result).not.toHaveProperty(field)
    }
  )

  it("returns no fields when none are supplied", () => {
    expect(parseUserInput(options as never, {}, "update")).toEqual({})
  })
})
