import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useTypedSession } from "@/lib/auth-client"
import { openPaddleCheckout } from "@/lib/paddle-client"
import { setPaddleConsentState } from "@/lib/paddle-consent"
import { PaddleCheckoutButton } from "./PaddleCheckoutButton"

const push = vi.fn()

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }))
vi.mock("@/lib/auth-client", () => ({ useTypedSession: vi.fn() }))
vi.mock("@/lib/paddle-client", () => ({ openPaddleCheckout: vi.fn() }))
vi.mock("@/lib/paddle-consent", () => ({ setPaddleConsentState: vi.fn() }))

const session = vi.mocked(useTypedSession) as unknown as ReturnType<
  typeof vi.fn
>
const open = vi.mocked(openPaddleCheckout)
const consent = vi.mocked(setPaddleConsentState)
const fetchMock = vi.fn()

function renderButton(
  props: Partial<React.ComponentProps<typeof PaddleCheckoutButton>> = {}
) {
  return render(
    <PaddleCheckoutButton
      planKey="monthly"
      label="Subscribe"
      paywallEnabled
      {...props}
    />
  )
}

const click = () => fireEvent.click(screen.getByRole("button"))

function respond(status: number, body: unknown) {
  fetchMock.mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal("fetch", fetchMock)
  session.mockReturnValue({ data: { user: { id: "u1" } }, isPending: false })
})

describe("PaddleCheckoutButton", () => {
  it("renders its label as an accessible button", () => {
    renderButton({ label: "Jetzt abonnieren" })
    expect(
      screen.getByRole("button", { name: "Jetzt abonnieren" })
    ).toBeEnabled()
  })

  it("sends visitors to sign in and back to pricing without calling the API", () => {
    session.mockReturnValue({ data: null, isPending: false })
    renderButton()
    click()
    expect(push).toHaveBeenCalledWith("/login?callbackUrl=%2Fpricing")
    expect(fetchMock).not.toHaveBeenCalled()
    expect(consent).not.toHaveBeenCalled()
  })

  it("is disabled while the session loads", () => {
    session.mockReturnValue({ data: null, isPending: true })
    renderButton()
    expect(screen.getByRole("button")).toBeDisabled()
  })

  it("explains when checkout is switched off", () => {
    renderButton({ paywallEnabled: false })
    click()
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Checkout is not available."
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("creates a transaction for the plan and opens the Paddle overlay", async () => {
    respond(200, { transactionId: "txn_1" })
    open.mockResolvedValue(undefined)
    renderButton({ planKey: "yearly" })
    click()
    await waitFor(() => expect(open).toHaveBeenCalledWith("txn_1"))
    expect(consent).toHaveBeenCalledWith("granted")
    expect(fetchMock).toHaveBeenCalledWith("/api/paddle/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planKey: "yearly" }),
    })
    await waitFor(() => expect(screen.getByRole("button")).toBeEnabled())
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })

  describe("trial notice", () => {
    it("tells the user the trial was not applied and still opens the overlay", async () => {
      respond(200, { transactionId: "txn_1", trial: false })
      open.mockResolvedValue(undefined)
      renderButton({ trialOffered: true })
      click()
      expect(await screen.findByRole("status")).toHaveTextContent(
        "A free trial is not available for this account. You will be charged at checkout."
      )
      await waitFor(() => expect(open).toHaveBeenCalledWith("txn_1"))
      expect(screen.getByRole("button", { name: "Subscribe" })).toBeEnabled()
    })

    it("uses German wording on the German site", async () => {
      respond(200, { transactionId: "txn_1", trial: false })
      open.mockResolvedValue(undefined)
      renderButton({ trialOffered: true, localeDe: true })
      click()
      expect(await screen.findByRole("status")).toHaveTextContent(
        "Für dieses Konto ist keine kostenlose Testphase verfügbar. Du zahlst beim Checkout."
      )
    })

    it("stays silent when the trial was applied", async () => {
      respond(200, { transactionId: "txn_1", trial: true })
      open.mockResolvedValue(undefined)
      renderButton({ trialOffered: true })
      click()
      await waitFor(() => expect(open).toHaveBeenCalledWith("txn_1"))
      expect(screen.queryByRole("status")).not.toBeInTheDocument()
    })

    it("stays silent when no trial was promised", async () => {
      respond(200, { transactionId: "txn_1", trial: false })
      open.mockResolvedValue(undefined)
      renderButton()
      click()
      await waitFor(() => expect(open).toHaveBeenCalledWith("txn_1"))
      expect(screen.queryByRole("status")).not.toBeInTheDocument()
    })

    it("clears the notice on the next attempt", async () => {
      respond(200, { transactionId: "txn_1", trial: false })
      open.mockResolvedValue(undefined)
      renderButton({ trialOffered: true })
      click()
      await screen.findByRole("status")
      respond(502, { error: "checkout_failed" })
      click()
      await screen.findByRole("alert")
      expect(screen.queryByRole("status")).not.toBeInTheDocument()
    })
  })

  it("shows a busy state while the request is in flight", async () => {
    let resolve!: (v: unknown) => void
    fetchMock.mockReturnValue(new Promise((r) => (resolve = r)))
    renderButton()
    click()
    const button = await screen.findByRole("button", { name: "Starting…" })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute("aria-busy", "true")
    resolve({ ok: false, status: 500, json: async () => ({}) })
    await waitFor(() => expect(screen.getByRole("button")).toBeEnabled())
  })

  it("tells users who already have a plan", async () => {
    respond(409, { error: "already_subscribed" })
    renderButton()
    click()
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You already have an active Superfan plan."
    )
    expect(open).not.toHaveBeenCalled()
  })

  it.each([
    ["a server error", 502, { error: "checkout_failed" }],
    ["a response without a transaction id", 200, {}],
    ["a 409 with another reason", 409, { error: "other" }],
  ])("shows a generic error for %s", async (_label, status, body) => {
    respond(status, body)
    renderButton()
    click()
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not start checkout. Please try again."
    )
    expect(open).not.toHaveBeenCalled()
  })

  it("survives an unreadable response body", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error("not json")
      },
    })
    renderButton()
    click()
    expect(await screen.findByRole("alert")).toBeInTheDocument()
  })

  it("shows an error when the network fails or Paddle.js cannot open", async () => {
    fetchMock.mockRejectedValue(new Error("offline"))
    const { unmount } = renderButton()
    click()
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not start checkout"
    )
    unmount()

    respond(200, { transactionId: "txn_1" })
    open.mockRejectedValue(new Error("paddle_not_configured"))
    renderButton()
    click()
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not start checkout"
    )
  })

  it("clears an old error on the next attempt", async () => {
    respond(502, {})
    renderButton()
    click()
    await screen.findByRole("alert")
    respond(200, { transactionId: "txn_2" })
    open.mockResolvedValue(undefined)
    click()
    await waitFor(() => expect(open).toHaveBeenCalledWith("txn_2"))
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })

  it("applies the primary variant and custom class", () => {
    renderButton({ variant: "primary", className: "extra" })
    expect(screen.getByRole("button").className).toContain("extra")
  })
})
