"use client"

import { createAuthClient } from "better-auth/react"
import { inferAdditionalFields } from "better-auth/client/plugins"
import { adminClient } from "better-auth/client/plugins"
import type { auth } from "@/lib/auth"

export const authClient = createAuthClient({
  plugins: [inferAdditionalFields<typeof auth>(), adminClient()],
})

// Extended user fields for client-side type safety
interface ExtendedUser {
  id: string
  email: string
  emailVerified: boolean
  name: string
  image?: string | null
  createdAt: Date
  updatedAt: Date
  role?: string
  username?: string | null
  isPublic?: boolean
  currency?: string
  hideLocationPublic?: boolean
  hideCostPublic?: boolean
  includeUserIdInErrorReports?: boolean
  banned?: boolean
  banReason?: string | null
  banExpires?: Date | null
  paddleCustomerId?: string | null
}

export interface ClientSession {
  user: ExtendedUser
  session: {
    id: string
    userId: string
    expiresAt: Date
    token: string
    createdAt: Date
    updatedAt: Date
    ipAddress?: string
    userAgent?: string
  }
}

// Type-safe session hook
export function useTypedSession() {
  const result = authClient.useSession()
  return {
    ...result,
    data: result.data as ClientSession | null,
  }
}

export const { signIn, signOut, signUp, useSession, sendVerificationEmail } =
  authClient
