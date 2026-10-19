import type { DBFieldAttribute } from "better-auth/db"

// Profile fields are written only via validated routes (e.g. PUT /api/user/profile).
// `input: false` stops clients from setting them through better-auth's own
// sign-up / update-user endpoints, which would bypass that validation.
export const userAdditionalFields = {
  username: {
    type: "string",
    required: false,
    input: false,
    unique: true,
  },
  isPublic: {
    type: "boolean",
    required: false,
    input: false,
    defaultValue: false,
  },
  currency: {
    type: "string",
    required: false,
    input: false,
    defaultValue: "EUR",
  },
  hideLocationPublic: {
    type: "boolean",
    required: false,
    input: false,
    defaultValue: true,
  },
  hideCostPublic: {
    type: "boolean",
    required: false,
    input: false,
    defaultValue: true,
  },
  includeUserIdInErrorReports: {
    type: "boolean",
    required: false,
    input: false,
    defaultValue: true,
  },
  // Added by admin plugin, declared here for TypeScript inference
  role: {
    type: "string",
    required: false,
    defaultValue: "user",
  },
  banned: {
    type: "boolean",
    required: false,
    defaultValue: false,
  },
  banReason: {
    type: "string",
    required: false,
  },
  banExpires: {
    type: "date",
    required: false,
  },
} satisfies Record<string, DBFieldAttribute>
