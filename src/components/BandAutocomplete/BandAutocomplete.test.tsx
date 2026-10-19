import { useState } from "react"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  render,
  screen,
  waitFor,
  within,
  fireEvent,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import BandAutocomplete, {
  type SelectedBand,
  isBandAlreadySelected,
  isDuplicateBandSuggestion,
} from "./BandAutocomplete"
import type { BandSearchResultItem } from "@/types/bandSearch"

const dbBand = (
  overrides: Partial<BandSearchResultItem> = {}
): BandSearchResultItem =>
  ({
    kind: "db",
    id: "b1",
    name: "Radiohead",
    slug: "radiohead",
    url: "/band/radiohead",
    ...overrides,
  }) as BandSearchResultItem

const mbSuggestion = (name: string): BandSearchResultItem => ({
  kind: "suggestion",
  name,
  source: "musicbrainz",
  externalId: "mb-1",
})

const lfSuggestion = (name: string): BandSearchResultItem => ({
  kind: "suggestion",
  name,
  source: "lastfm",
})

function chipElByBandName(name: string): HTMLElement {
  const nameSpan = screen.getByText(name, { selector: ".band-chip__name" })
  const el = nameSpan.closest('[role="option"]')
  if (!el) throw new Error(`No chip option for ${name}`)
  return el as HTMLElement
}

type StatefulAutocompleteProps = Omit<
  React.ComponentProps<typeof BandAutocomplete>,
  "selectedBands" | "onBandsChange"
> & {
  initialBands: SelectedBand[]
  onBandsChange?: (bands: SelectedBand[]) => void
}

function StatefulAutocomplete({
  initialBands,
  onBandsChange: onBandsChangeProp,
  ...props
}: StatefulAutocompleteProps) {
  const [bands, setBands] = useState(initialBands)
  return (
    <BandAutocomplete
      {...props}
      selectedBands={bands}
      onBandsChange={(next) => {
        setBands(next)
        onBandsChangeProp?.(next)
      }}
    />
  )
}

describe("isBandAlreadySelected", () => {
  it("returns true when bandId exists in selection", () => {
    expect(
      isBandAlreadySelected("a", [
        { bandId: "a", name: "A", slug: "a", isHeadliner: true },
      ])
    ).toBe(true)
  })

  it("returns false when bandId is not in selection", () => {
    expect(isBandAlreadySelected("x", [])).toBe(false)
  })
})

describe("isDuplicateBandSuggestion", () => {
  it("returns true when normalized name matches a selected band", () => {
    expect(
      isDuplicateBandSuggestion("Foo Bar", [
        {
          bandId: "1",
          name: "foo  bar",
          slug: "f",
          isHeadliner: true,
        },
      ])
    ).toBe(true)
  })

  it("returns false when no selected band matches normalized name", () => {
    expect(
      isDuplicateBandSuggestion("Unique", [
        { bandId: "1", name: "Other", slug: "o", isHeadliner: true },
      ])
    ).toBe(false)
  })
})

describe("BandAutocomplete", () => {
  let onBandsChange: ReturnType<typeof vi.fn<(bands: SelectedBand[]) => void>>
  let onCreateBand: ReturnType<typeof vi.fn<(name: string) => Promise<void>>>

  beforeEach(() => {
    vi.useRealTimers()
    onBandsChange = vi.fn<(bands: SelectedBand[]) => void>()
    onCreateBand = vi
      .fn<(name: string) => Promise<void>>()
      .mockResolvedValue(undefined)
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve<BandSearchResultItem[]>([]),
      } as Response)
    )
  })

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 60))
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("renders search combobox and does not search below 2 characters", async () => {
    const user = userEvent.setup()
    render(
      <BandAutocomplete selectedBands={[]} onBandsChange={onBandsChange} />
    )

    const input = screen.getByRole("combobox", { name: /search or add bands/i })
    await user.type(input, "r")
    await new Promise((r) => setTimeout(r, 400))

    expect(fetch).not.toHaveBeenCalled()
    expect(
      screen.queryByRole("listbox", { name: /band search results/i })
    ).not.toBeInTheDocument()
  })

  it("debounces search and opens listbox with db results; click adds band as headliner", async () => {
    const user = userEvent.setup()

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve<BandSearchResultItem[]>([
          dbBand({ id: "1", name: "Radiohead", slug: "radiohead" }),
        ]),
    } as Response)

    render(
      <BandAutocomplete selectedBands={[]} onBandsChange={onBandsChange} />
    )
    const input = screen.getByRole("combobox", { name: /search or add bands/i })

    await user.type(input, "ra")

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/bands/search?q=")
      )
    })

    const listbox = await screen.findByRole("listbox", {
      name: /band search results/i,
    })
    const option = within(listbox).getByRole("option", { name: /^Radiohead$/ })
    await user.click(option)

    expect(onBandsChange).toHaveBeenCalledWith([
      expect.objectContaining({
        bandId: "1",
        name: "Radiohead",
        slug: "radiohead",
        isHeadliner: true,
      }),
    ])
    expect(input).toHaveValue("")
  })

  it("filters db rows already in selectedBands and suggestion rows matching selected name", async () => {
    const user = userEvent.setup()

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve<BandSearchResultItem[]>([
          dbBand({ id: "x", name: "Taken", slug: "taken" }),
          dbBand({ id: "y", name: "Other", slug: "other" }),
          mbSuggestion("Taken"),
        ]),
    } as Response)

    const selected: SelectedBand[] = [
      {
        bandId: "x",
        name: "Taken",
        slug: "taken",
        isHeadliner: true,
      },
    ]

    render(
      <BandAutocomplete
        selectedBands={selected}
        onBandsChange={onBandsChange}
      />
    )

    await user.type(screen.getByRole("combobox"), "ta")

    const searchList = await screen.findByRole("listbox", {
      name: /band search results/i,
    })
    expect(
      within(searchList).getByRole("option", { name: /^Other$/ })
    ).toBeInTheDocument()
    expect(
      within(searchList).queryByRole("option", { name: /^Taken$/ })
    ).not.toBeInTheDocument()
  })

  it("ignores non-ok responses and logs on fetch failure", async () => {
    const user = userEvent.setup()
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve([]),
    } as Response)

    render(
      <BandAutocomplete selectedBands={[]} onBandsChange={onBandsChange} />
    )
    await user.type(screen.getByRole("combobox"), "ab")
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(
      screen.queryByRole("listbox", { name: /band search results/i })
    ).not.toBeInTheDocument()

    vi.mocked(fetch).mockRejectedValueOnce(new Error("network"))
    await user.type(screen.getByRole("combobox"), "c")
    await waitFor(() => expect(errSpy).toHaveBeenCalled())

    errSpy.mockRestore()
  })

  it("keyboard: ArrowDown/ArrowUp/Enter selects highlighted db row", async () => {
    const user = userEvent.setup()

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve<BandSearchResultItem[]>([
          dbBand({ id: "a", name: "Alpha", slug: "alpha" }),
          dbBand({ id: "b", name: "Beta", slug: "beta" }),
        ]),
    } as Response)

    render(
      <BandAutocomplete selectedBands={[]} onBandsChange={onBandsChange} />
    )
    const input = screen.getByRole("combobox", { name: /search or add bands/i })
    await user.type(input, "al")
    await screen.findByRole("listbox")

    await user.keyboard("{ArrowDown}")
    await user.keyboard("{ArrowUp}")
    await user.keyboard("{ArrowDown}")
    await user.keyboard("{Enter}")

    expect(onBandsChange).toHaveBeenCalledWith([
      expect.objectContaining({ bandId: "b", name: "Beta" }),
    ])
  })

  it("keyboard: Enter on external suggestion calls onCreateBand", async () => {
    const user = userEvent.setup()

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve<BandSearchResultItem[]>([mbSuggestion("New Artist")]),
    } as Response)

    render(
      <BandAutocomplete
        selectedBands={[]}
        onBandsChange={onBandsChange}
        onCreateBand={onCreateBand}
      />
    )
    const input = screen.getByRole("combobox")
    await user.type(input, "ne")
    await screen.findByRole("listbox")

    await user.keyboard("{ArrowDown}")
    await user.keyboard("{Enter}")

    await waitFor(() => expect(onCreateBand).toHaveBeenCalledWith("New Artist"))
  })

  it("keyboard: Escape clears term when open; Tab closes list without clearing term", async () => {
    const user = userEvent.setup()

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve<BandSearchResultItem[]>([dbBand()]),
    } as Response)

    render(
      <BandAutocomplete selectedBands={[]} onBandsChange={onBandsChange} />
    )
    const input = screen.getByRole("combobox")
    await user.type(input, "ra")
    await screen.findByRole("listbox")

    await user.keyboard("{Escape}")
    expect(input).toHaveValue("")
    expect(
      screen.queryByRole("listbox", { name: /band search results/i })
    ).not.toBeInTheDocument()

    await user.type(input, "ra")
    await screen.findByRole("listbox")
    await user.keyboard("{Tab}")
    expect(input).toHaveValue("ra")
    expect(
      screen.queryByRole("listbox", { name: /band search results/i })
    ).not.toBeInTheDocument()
  })

  it("keyboard: Enter with empty results creates band when onCreateBand provided", async () => {
    const user = userEvent.setup()

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve<BandSearchResultItem[]>([]),
    } as Response)

    render(
      <BandAutocomplete
        selectedBands={[]}
        onBandsChange={onBandsChange}
        onCreateBand={onCreateBand}
      />
    )
    const input = screen.getByRole("combobox")
    await user.type(input, "zz")
    await screen.findByText(/no bands found/i)

    await user.keyboard("{Enter}")
    expect(onCreateBand).toHaveBeenCalledWith("zz")
  })

  it("shows Searching indicator while request in flight", async () => {
    const user = userEvent.setup()

    let resolveJson!: (v: BandSearchResultItem[]) => void
    const jsonPromise = new Promise<BandSearchResultItem[]>((r) => {
      resolveJson = r
    })

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => jsonPromise,
    } as Response)

    render(
      <BandAutocomplete selectedBands={[]} onBandsChange={onBandsChange} />
    )
    await user.type(screen.getByRole("combobox"), "ab")

    await waitFor(() =>
      expect(screen.getByText(/searching/i)).toBeInTheDocument()
    )
    resolveJson([])
    await waitFor(() =>
      expect(screen.queryByText(/searching/i)).not.toBeInTheDocument()
    )
  })

  it("mousedown outside closes dropdown", async () => {
    const user = userEvent.setup()

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve<BandSearchResultItem[]>([dbBand()]),
    } as Response)

    render(
      <div>
        <BandAutocomplete selectedBands={[]} onBandsChange={onBandsChange} />
        <button type="button">Outside</button>
      </div>
    )

    await user.type(screen.getByRole("combobox"), "ra")
    await screen.findByRole("listbox")

    await user.click(screen.getByRole("button", { name: /^outside$/i }))
    expect(
      screen.queryByRole("listbox", { name: /band search results/i })
    ).not.toBeInTheDocument()
  })

  it("no-results create button calls onCreateBand and closes", async () => {
    const user = userEvent.setup()

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve<BandSearchResultItem[]>([]),
    } as Response)

    render(
      <BandAutocomplete
        selectedBands={[]}
        onBandsChange={onBandsChange}
        onCreateBand={onCreateBand}
      />
    )

    await user.type(screen.getByRole("combobox"), "xx")
    await screen.findByText(/no bands found/i)

    await user.click(screen.getByRole("button", { name: /create.*xx/i }))
    expect(onCreateBand).toHaveBeenCalledWith("xx")
    expect(
      screen.queryByRole("listbox", { name: /band search results/i })
    ).not.toBeInTheDocument()
  })

  it("renders backdrop when dropdown open", async () => {
    const user = userEvent.setup()

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve<BandSearchResultItem[]>([dbBand()]),
    } as Response)

    const { container } = render(
      <BandAutocomplete selectedBands={[]} onBandsChange={onBandsChange} />
    )
    await user.type(screen.getByRole("combobox"), "ra")
    await screen.findByRole("listbox")

    expect(container.querySelector(".band-autocomplete__backdrop")).toBeTruthy()
  })

  it("disables input when disabled prop is true", () => {
    render(
      <BandAutocomplete
        selectedBands={[]}
        onBandsChange={onBandsChange}
        disabled
      />
    )
    expect(screen.getByRole("combobox")).toBeDisabled()
  })

  it("limits dropdown to 10 options", async () => {
    const user = userEvent.setup()

    const many = Array.from({ length: 12 }, (_, i) =>
      dbBand({
        id: `id-${i}`,
        name: `Band ${i}`,
        slug: `band-${i}`,
      })
    )

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve<BandSearchResultItem[]>(many),
    } as Response)

    render(
      <BandAutocomplete selectedBands={[]} onBandsChange={onBandsChange} />
    )
    await user.type(screen.getByRole("combobox"), "ba")

    const listbox = await screen.findByRole("listbox")
    expect(within(listbox).getAllByRole("option")).toHaveLength(10)
  })

  it("suggestion options show source labels; predictive match and no-substring branch", async () => {
    const user = userEvent.setup()

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve<BandSearchResultItem[]>([
          dbBand({ name: "Radiohead" }),
          mbSuggestion("Radiohead Tribute"),
          lfSuggestion("Other Last"),
        ]),
    } as Response)

    render(
      <BandAutocomplete selectedBands={[]} onBandsChange={onBandsChange} />
    )
    await user.type(screen.getByRole("combobox"), "radio")

    const listbox = await screen.findByRole("listbox")
    expect(
      within(listbox).getByRole("option", {
        name: /radiohead tribute.*musicbrainz/i,
      })
    ).toBeInTheDocument()
    expect(
      within(listbox).getByRole("option", { name: /other last.*last\.fm/i })
    ).toBeInTheDocument()

    const row = within(listbox).getByRole("option", { name: /^Radiohead$/ })
    expect(row.querySelector(".band-autocomplete__match")).toBeTruthy()

    await user.clear(screen.getByRole("combobox"))
    await user.type(screen.getByRole("combobox"), "zz")

    const listbox2 = await screen.findByRole("listbox")
    const noMatch = within(listbox2).getByRole("option", {
      name: /^Radiohead$/,
    })
    expect(noMatch.querySelector(".band-autocomplete__match")).toBeNull()
    expect(noMatch.querySelector(".band-autocomplete__prediction")).toBeTruthy()
  })

  it("mouseEnter sets highlight; clicking suggestion invokes onCreateBand", async () => {
    const user = userEvent.setup()

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve<BandSearchResultItem[]>([
          dbBand({ id: "1", name: "A", slug: "a" }),
          mbSuggestion("Suggest"),
        ]),
    } as Response)

    render(
      <BandAutocomplete
        selectedBands={[]}
        onBandsChange={onBandsChange}
        onCreateBand={onCreateBand}
      />
    )
    await user.type(screen.getByRole("combobox"), "su")

    const listbox = await screen.findByRole("listbox")
    const sug = within(listbox).getByRole("option", {
      name: /suggest.*musicbrainz/i,
    })
    fireEvent.mouseEnter(sug)
    expect(sug).toHaveAttribute("aria-selected", "true")

    await user.click(sug)
    await waitFor(() => expect(onCreateBand).toHaveBeenCalledWith("Suggest"))
  })

  it("remove and headliner toggle fire onBandsChange", async () => {
    const user = userEvent.setup()

    const selected: SelectedBand[] = [
      {
        bandId: "1",
        name: "Head",
        slug: "head",
        isHeadliner: true,
      },
      {
        bandId: "2",
        name: "Support",
        slug: "support",
        isHeadliner: false,
      },
    ]

    render(
      <BandAutocomplete
        selectedBands={selected}
        onBandsChange={onBandsChange}
      />
    )

    await user.click(screen.getByRole("button", { name: /remove support/i }))
    expect(onBandsChange).toHaveBeenCalledWith([selected[0]])

    onBandsChange.mockClear()
    await user.click(
      screen.getByRole("button", { name: /mark head as headliner/i })
    )
    expect(onBandsChange).toHaveBeenCalled()
  })

  it("chip keyboard: ArrowLeft from start of input focuses last chip", async () => {
    const user = userEvent.setup()
    const selected: SelectedBand[] = [
      {
        bandId: "1",
        name: "Only",
        slug: "only",
        isHeadliner: true,
      },
    ]

    render(
      <BandAutocomplete
        selectedBands={selected}
        onBandsChange={onBandsChange}
      />
    )
    const input = screen.getByRole("combobox") as HTMLInputElement
    input.setSelectionRange(0, 0)
    input.focus()

    await user.keyboard("{ArrowLeft}")
    await waitFor(() => expect(chipElByBandName("Only")).toHaveFocus())
  })

  it("chip keyboard: Home, End, ArrowRight to input, Backspace removes", async () => {
    const user = userEvent.setup()
    const selected: SelectedBand[] = [
      {
        bandId: "1",
        name: "First",
        slug: "first",
        isHeadliner: true,
      },
      {
        bandId: "2",
        name: "Second",
        slug: "second",
        isHeadliner: true,
      },
    ]

    render(
      <BandAutocomplete
        selectedBands={selected}
        onBandsChange={onBandsChange}
      />
    )

    chipElByBandName("Second").focus()

    await user.keyboard("{Home}")
    await waitFor(() => expect(chipElByBandName("First")).toHaveFocus())

    await user.keyboard("{End}")
    await waitFor(() => expect(chipElByBandName("Second")).toHaveFocus())

    await user.keyboard("{ArrowRight}")
    expect(screen.getByRole("combobox")).toHaveFocus()

    chipElByBandName("First").focus()
    await user.keyboard("{Backspace}")
    expect(onBandsChange).toHaveBeenCalled()
  })

  it("chip keyboard: H toggles headliner for non-headliner", async () => {
    const user = userEvent.setup()
    render(
      <BandAutocomplete
        selectedBands={[
          {
            bandId: "1",
            name: "Solo",
            slug: "solo",
            isHeadliner: false,
          },
        ]}
        onBandsChange={onBandsChange}
      />
    )
    chipElByBandName("Solo").focus()
    await user.keyboard("{Shift>}H{/Shift}")
    expect(onBandsChange).toHaveBeenCalled()
  })

  it("chip keyboard: grab, move right, drop reorders headliners (stateful)", async () => {
    const user = userEvent.setup()

    const initial: SelectedBand[] = [
      { bandId: "1", name: "A", slug: "a", isHeadliner: true },
      { bandId: "2", name: "B", slug: "b", isHeadliner: true },
    ]

    render(<StatefulAutocomplete initialBands={initial} />)

    chipElByBandName("A").focus()
    await user.keyboard(" ")
    await user.keyboard("{ArrowRight}")
    await user.keyboard(" ")

    await waitFor(() => {
      expect(
        chipElByBandName("B").compareDocumentPosition(chipElByBandName("A"))
      ).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    })
  })

  it("chip keyboard: Escape after grab restores original order", async () => {
    const user = userEvent.setup()

    const initial: SelectedBand[] = [
      { bandId: "1", name: "A", slug: "a", isHeadliner: true },
      { bandId: "2", name: "B", slug: "b", isHeadliner: true },
    ]

    render(<StatefulAutocomplete initialBands={initial} />)

    chipElByBandName("A").focus()
    await user.keyboard(" ")
    await user.keyboard("{ArrowRight}")
    await user.keyboard("{Escape}")

    const names = screen.getAllByText(/^[AB]$/, {
      selector: ".band-chip__name",
    })
    expect(names.map((n) => n.textContent)).toEqual(["A", "B"])
  })

  it("admin edit button calls onEditBand", async () => {
    const user = userEvent.setup()
    const onEditBand = vi.fn()
    render(
      <BandAutocomplete
        selectedBands={[
          {
            bandId: "1",
            name: "EditMe",
            slug: "edit-me",
            isHeadliner: true,
          },
        ]}
        onBandsChange={onBandsChange}
        isAdmin
        onEditBand={onEditBand}
      />
    )

    await user.click(screen.getByRole("button", { name: /edit editme/i }))
    expect(onEditBand).toHaveBeenCalledWith("edit-me")
  })

  it("input focus clears focused chip roving tabindex", async () => {
    const user = userEvent.setup()
    render(
      <BandAutocomplete
        selectedBands={[
          {
            bandId: "1",
            name: "One",
            slug: "one",
            isHeadliner: true,
          },
        ]}
        onBandsChange={onBandsChange}
      />
    )
    const input = screen.getByRole("combobox") as HTMLInputElement
    input.focus()
    input.setSelectionRange(0, 0)
    await user.keyboard("{ArrowLeft}")
    await waitFor(() =>
      expect(chipElByBandName("One")).toHaveAttribute("tabIndex", "0")
    )

    await user.click(screen.getByRole("combobox"))
    expect(chipElByBandName("One")).toHaveAttribute("tabIndex", "-1")
  })

  it("pointer drag from handle sets dragging class and completes without reorder when alone", async () => {
    const rect = {
      left: 10,
      top: 20,
      width: 100,
      height: 32,
      right: 110,
      bottom: 52,
      x: 10,
      y: 20,
      toJSON: () => "",
    } as DOMRect

    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(rect)

    render(
      <StatefulAutocomplete
        initialBands={[
          { bandId: "1", name: "Solo", slug: "solo", isHeadliner: true },
        ]}
      />
    )

    const handle = screen.getByRole("button", { name: /drag to reorder solo/i })
    fireEvent.pointerDown(handle, {
      clientX: 20,
      clientY: 30,
      pointerId: 1,
      bubbles: true,
    })

    await waitFor(() => {
      expect(document.querySelector(".band-chip--dragging")).toBeTruthy()
    })

    fireEvent.pointerUp(document, { pointerId: 1 })

    await waitFor(() => {
      expect(document.querySelector(".band-chip--dragging")).toBeNull()
    })
  })

  function makeDomRect(
    left: number,
    top: number,
    width: number,
    height: number
  ): DOMRect {
    return {
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
      x: left,
      y: top,
      toJSON: () => "",
    } as DOMRect
  }

  it("pointer drag reorders second headliner before first using drop target math", async () => {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
      function (this: Element) {
        const el = this as HTMLElement
        const idx = el.dataset.bandIndex
        if (el.classList.contains("band-chip") && idx === "0") {
          return makeDomRect(0, 0, 100, 40)
        }
        if (el.classList.contains("band-chip") && idx === "1") {
          return makeDomRect(120, 0, 100, 40)
        }
        return makeDomRect(0, 0, 1, 1)
      }
    )

    render(
      <StatefulAutocomplete
        initialBands={[
          { bandId: "a", name: "A", slug: "a", isHeadliner: true },
          { bandId: "b", name: "B", slug: "b", isHeadliner: true },
        ]}
      />
    )

    const handleA = screen.getByRole("button", { name: /drag to reorder a/i })
    fireEvent.pointerDown(handleA, {
      clientX: 40,
      clientY: 20,
      pointerId: 7,
      bubbles: true,
    })

    await waitFor(() =>
      expect(document.querySelector(".band-chip--dragging")).toBeTruthy()
    )

    fireEvent.pointerMove(document, {
      clientX: 200,
      clientY: 20,
      pointerId: 7,
      bubbles: true,
    })

    fireEvent.pointerUp(document, { pointerId: 7 })

    await waitFor(() => {
      const names = screen.getAllByText(/^[AB]$/, {
        selector: ".band-chip__name",
      })
      expect(names.map((n) => n.textContent)).toEqual(["B", "A"])
    })
  })

  it("pointer down on chip body outside drag handle does not start drag", async () => {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(
      makeDomRect(0, 0, 80, 32)
    )

    render(
      <StatefulAutocomplete
        initialBands={[
          { bandId: "1", name: "Only", slug: "only", isHeadliner: true },
        ]}
      />
    )

    const chip = chipElByBandName("Only")
    fireEvent.pointerDown(chip, {
      clientX: 50,
      clientY: 10,
      pointerId: 3,
      bubbles: true,
    })

    expect(document.querySelector(".band-chip--dragging")).toBeNull()
  })

  it("suggestion click does nothing when onCreateBand is omitted", async () => {
    const user = userEvent.setup()
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve<BandSearchResultItem[]>([mbSuggestion("Orphan")]),
    } as Response)

    render(
      <BandAutocomplete selectedBands={[]} onBandsChange={onBandsChange} />
    )
    await user.type(screen.getByRole("combobox"), "or")
    const listbox = await screen.findByRole("listbox")
    await user.click(
      within(listbox).getByRole("option", { name: /orphan.*musicbrainz/i })
    )
    expect(onBandsChange).not.toHaveBeenCalled()
  })

  it("chip ArrowLeft on first chip does not move focus", async () => {
    const user = userEvent.setup()
    render(
      <BandAutocomplete
        selectedBands={[
          { bandId: "1", name: "Only", slug: "o", isHeadliner: true },
        ]}
        onBandsChange={onBandsChange}
      />
    )
    chipElByBandName("Only").focus()
    await user.keyboard("{ArrowLeft}")
    expect(chipElByBandName("Only")).toHaveFocus()
  })

  it("Delete removes last chip then first chip (stateful list)", async () => {
    const user = userEvent.setup()
    render(
      <StatefulAutocomplete
        initialBands={[
          { bandId: "1", name: "First", slug: "f", isHeadliner: true },
          { bandId: "2", name: "Last", slug: "l", isHeadliner: true },
        ]}
      />
    )
    chipElByBandName("Last").focus()
    await user.keyboard("{Delete}")
    expect(
      screen.getByText("First", { selector: ".band-chip__name" })
    ).toBeInTheDocument()

    chipElByBandName("First").focus()
    await user.keyboard("{Delete}")
    await waitFor(() =>
      expect(
        screen.queryByText("First", { selector: ".band-chip__name" })
      ).not.toBeInTheDocument()
    )
  })

  it("lowercase h toggles headliner", async () => {
    const user = userEvent.setup()
    render(
      <BandAutocomplete
        selectedBands={[
          {
            bandId: "1",
            name: "Solo",
            slug: "s",
            isHeadliner: false,
          },
        ]}
        onBandsChange={onBandsChange}
      />
    )
    chipElByBandName("Solo").focus()
    await user.keyboard("h")
    expect(onBandsChange).toHaveBeenCalled()
  })

  it("grabbed chip: ArrowLeft at first index does not reorder", async () => {
    const user = userEvent.setup()
    render(
      <StatefulAutocomplete
        initialBands={[
          { bandId: "1", name: "A", slug: "a", isHeadliner: true },
          { bandId: "2", name: "B", slug: "b", isHeadliner: true },
        ]}
      />
    )
    chipElByBandName("A").focus()
    await user.keyboard(" ")
    await user.keyboard("{ArrowLeft}")
    await user.keyboard("{Escape}")
    const names = screen.getAllByText(/^[AB]$/, {
      selector: ".band-chip__name",
    })
    expect(names.map((n) => n.textContent)).toEqual(["A", "B"])
  })

  it("grabbed chip: ArrowRight at last index does not reorder", async () => {
    const user = userEvent.setup()
    render(
      <BandAutocomplete
        selectedBands={[
          { bandId: "1", name: "A", slug: "a", isHeadliner: true },
          { bandId: "2", name: "B", slug: "b", isHeadliner: true },
        ]}
        onBandsChange={onBandsChange}
      />
    )
    chipElByBandName("B").focus()
    await user.keyboard(" ")
    onBandsChange.mockClear()
    await user.keyboard("{ArrowRight}")
    expect(onBandsChange).not.toHaveBeenCalled()
  })

  it("Enter with open list and no highlighted option does not select", async () => {
    const user = userEvent.setup()
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve<BandSearchResultItem[]>([
          dbBand({ id: "z", name: "Zed", slug: "zed" }),
        ]),
    } as Response)

    render(
      <BandAutocomplete selectedBands={[]} onBandsChange={onBandsChange} />
    )
    await user.type(screen.getByRole("combobox"), "ze")
    await screen.findByRole("listbox")
    await user.keyboard("{Enter}")
    expect(onBandsChange).not.toHaveBeenCalled()
  })

  it("Escape on open list with results clears via open-branch handler", async () => {
    const user = userEvent.setup()
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve<BandSearchResultItem[]>([
          dbBand({ name: "Zed", slug: "z" }),
        ]),
    } as Response)

    render(
      <BandAutocomplete selectedBands={[]} onBandsChange={onBandsChange} />
    )
    const input = screen.getByRole("combobox")
    await user.type(input, "ze")
    await screen.findByRole("listbox")
    await user.keyboard("{Escape}")
    expect(input).toHaveValue("")
  })

  it("Escape clears search when combobox closed and term under 2 chars", async () => {
    const user = userEvent.setup()
    render(
      <BandAutocomplete selectedBands={[]} onBandsChange={onBandsChange} />
    )
    const input = screen.getByRole("combobox")
    await user.type(input, "x")
    expect(input).toHaveValue("x")
    await user.keyboard("{Escape}")
    expect(input).toHaveValue("")
  })

  it("grabbed second chip: ArrowLeft reorders and announces", async () => {
    const user = userEvent.setup()
    render(<StatefulAutocomplete initialBands={initialTwoHeadliners()} />)

    chipElByBandName("B").focus()
    await user.keyboard(" ")
    await user.keyboard("{ArrowLeft}")
    await user.keyboard(" ")

    await waitFor(() => {
      const names = screen.getAllByText(/^[AB]$/, {
        selector: ".band-chip__name",
      })
      expect(names.map((n) => n.textContent)).toEqual(["B", "A"])
    })
  })

  it("chip keyboard: ArrowLeft moves focus from second to first chip", async () => {
    const user = userEvent.setup()
    render(
      <BandAutocomplete
        selectedBands={initialTwoHeadliners()}
        onBandsChange={onBandsChange}
      />
    )
    chipElByBandName("B").focus()
    await user.keyboard("{ArrowLeft}")
    await waitFor(() => expect(chipElByBandName("A")).toHaveFocus())
  })

  it("chip keyboard: ArrowRight moves focus from first to second of three chips", async () => {
    const user = userEvent.setup()
    const three: SelectedBand[] = [
      { bandId: "1", name: "A", slug: "a", isHeadliner: true },
      { bandId: "2", name: "B", slug: "b", isHeadliner: true },
      { bandId: "3", name: "C", slug: "c", isHeadliner: true },
    ]
    render(
      <BandAutocomplete selectedBands={three} onBandsChange={onBandsChange} />
    )
    chipElByBandName("A").focus()
    await user.keyboard("{ArrowRight}")
    await waitFor(() => expect(chipElByBandName("B")).toHaveFocus())
  })

  it("keyboard reorder across headliner groups is ignored", async () => {
    const user = userEvent.setup()
    const mixed: SelectedBand[] = [
      { bandId: "1", name: "H", slug: "h", isHeadliner: true },
      { bandId: "2", name: "S", slug: "s", isHeadliner: false },
    ]
    render(
      <BandAutocomplete selectedBands={mixed} onBandsChange={onBandsChange} />
    )
    chipElByBandName("H").focus()
    await user.keyboard(" ")
    onBandsChange.mockClear()
    await user.keyboard("{ArrowRight}")
    expect(onBandsChange).not.toHaveBeenCalled()
    await user.keyboard("{Escape}")
  })

  it("solo pointer drag emits pointermove drop fallback when no other chips", async () => {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(
      makeDomRect(0, 0, 100, 40)
    )
    render(
      <StatefulAutocomplete
        initialBands={[
          { bandId: "1", name: "Solo", slug: "solo", isHeadliner: true },
        ]}
      />
    )
    const handle = screen.getByRole("button", { name: /drag to reorder solo/i })
    fireEvent.pointerDown(handle, {
      clientX: 20,
      clientY: 20,
      pointerId: 99,
      bubbles: true,
    })
    await waitFor(() =>
      expect(document.querySelector(".band-chip--dragging")).toBeTruthy()
    )
    fireEvent.pointerMove(document, {
      clientX: 200,
      clientY: 20,
      pointerId: 99,
      bubbles: true,
    })
    fireEvent.pointerUp(document, { pointerId: 99 })
    await waitFor(() =>
      expect(document.querySelector(".band-chip--dragging")).toBeNull()
    )
  })

  it("pointermove skips junk chips and NaN data-band-index in container", async () => {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
      function (this: Element) {
        const el = this as HTMLElement
        const idx = el.dataset.bandIndex
        if (el.classList.contains("band-chip") && idx === "0") {
          return makeDomRect(0, 0, 100, 40)
        }
        if (el.classList.contains("band-chip") && idx === "1") {
          return makeDomRect(120, 0, 100, 40)
        }
        return makeDomRect(0, 0, 1, 1)
      }
    )

    render(<StatefulAutocomplete initialBands={initialTwoHeadliners()} />)

    const handleA = screen.getByRole("button", { name: /drag to reorder a/i })
    fireEvent.pointerDown(handleA, {
      clientX: 40,
      clientY: 20,
      pointerId: 44,
      bubbles: true,
    })
    await waitFor(() =>
      expect(document.querySelector(".band-chip--dragging")).toBeTruthy()
    )

    const chips = document.querySelector(".band-autocomplete__chips")
    expect(chips).toBeTruthy()
    const noAttr = document.createElement("div")
    noAttr.className = "band-chip"
    chips!.appendChild(noAttr)
    const nanIdx = document.createElement("div")
    nanIdx.className = "band-chip"
    nanIdx.dataset.bandIndex = "not-int"
    chips!.appendChild(nanIdx)

    fireEvent.pointerMove(document, {
      clientX: 200,
      clientY: 20,
      pointerId: 44,
      bubbles: true,
    })
    fireEvent.pointerUp(document, { pointerId: 44 })
    await waitFor(() => {
      const names = screen.getAllByText(/^[AB]$/, {
        selector: ".band-chip__name",
      })
      expect(names.map((n) => n.textContent)).toEqual(["B", "A"])
    })
  })

  it("pointermove picks closest row when chips wrap to two rows", async () => {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
      function (this: Element) {
        const el = this as HTMLElement
        const idx = el.dataset.bandIndex
        if (el.classList.contains("band-chip") && idx === "0") {
          return makeDomRect(0, 0, 80, 40)
        }
        if (el.classList.contains("band-chip") && idx === "1") {
          return makeDomRect(0, 80, 80, 40)
        }
        if (el.classList.contains("band-chip") && idx === "2") {
          return makeDomRect(100, 80, 80, 40)
        }
        return makeDomRect(0, 0, 1, 1)
      }
    )

    const three: SelectedBand[] = [
      { bandId: "a", name: "A", slug: "a", isHeadliner: true },
      { bandId: "b", name: "B", slug: "b", isHeadliner: true },
      { bandId: "c", name: "C", slug: "c", isHeadliner: true },
    ]
    render(<StatefulAutocomplete initialBands={three} />)

    const handleC = screen.getByRole("button", { name: /drag to reorder c/i })
    fireEvent.pointerDown(handleC, {
      clientX: 140,
      clientY: 100,
      pointerId: 55,
      bubbles: true,
    })
    await waitFor(() =>
      expect(document.querySelector(".band-chip--dragging")).toBeTruthy()
    )
    fireEvent.pointerMove(document, {
      clientX: 35,
      clientY: 95,
      pointerId: 55,
      bubbles: true,
    })
    fireEvent.pointerUp(document, { pointerId: 55 })
    await waitFor(() => {
      const names = screen.getAllByText(/^[ABC]$/, {
        selector: ".band-chip__name",
      })
      expect(names.map((n) => n.textContent)).toEqual(["A", "C", "B"])
    })
  })

  it("drop target uses mouse past last chip on row (after side)", async () => {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
      function (this: Element) {
        const el = this as HTMLElement
        const idx = el.dataset.bandIndex
        if (el.classList.contains("band-chip") && idx === "0") {
          return makeDomRect(0, 0, 100, 40)
        }
        if (el.classList.contains("band-chip") && idx === "1") {
          return makeDomRect(120, 0, 100, 40)
        }
        return makeDomRect(0, 0, 1, 1)
      }
    )
    render(<StatefulAutocomplete initialBands={initialTwoHeadliners()} />)

    fireEvent.pointerDown(
      screen.getByRole("button", { name: /drag to reorder a/i }),
      { clientX: 40, clientY: 20, pointerId: 66, bubbles: true }
    )
    await waitFor(() =>
      expect(document.querySelector(".band-chip--dragging")).toBeTruthy()
    )
    fireEvent.pointerMove(document, {
      clientX: 400,
      clientY: 20,
      pointerId: 66,
      bubbles: true,
    })
    fireEvent.pointerUp(document, { pointerId: 66 })
    await waitFor(() => {
      const names = screen.getAllByText(/^[AB]$/, {
        selector: ".band-chip__name",
      })
      expect(names.map((n) => n.textContent)).toEqual(["B", "A"])
    })
  })

  it("drop target past last chip when row has multiple candidates", async () => {
    const three: SelectedBand[] = [
      { bandId: "a", name: "A", slug: "a", isHeadliner: true },
      { bandId: "b", name: "B", slug: "b", isHeadliner: true },
      { bandId: "c", name: "C", slug: "c", isHeadliner: true },
    ]
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
      function (this: Element) {
        const el = this as HTMLElement
        const idx = el.dataset.bandIndex
        if (el.classList.contains("band-chip") && idx === "0") {
          return makeDomRect(0, 0, 100, 40)
        }
        if (el.classList.contains("band-chip") && idx === "1") {
          return makeDomRect(110, 0, 100, 40)
        }
        if (el.classList.contains("band-chip") && idx === "2") {
          return makeDomRect(220, 0, 100, 40)
        }
        return makeDomRect(0, 0, 1, 1)
      }
    )
    render(<StatefulAutocomplete initialBands={three} />)

    fireEvent.pointerDown(
      screen.getByRole("button", { name: /drag to reorder a/i }),
      { clientX: 40, clientY: 20, pointerId: 67, bubbles: true }
    )
    await waitFor(() =>
      expect(document.querySelector(".band-chip--dragging")).toBeTruthy()
    )
    fireEvent.pointerMove(document, {
      clientX: 350,
      clientY: 20,
      pointerId: 67,
      bubbles: true,
    })
    fireEvent.pointerUp(document, { pointerId: 67 })
    await waitFor(() => {
      const names = screen.getAllByText(/^[ABC]$/, {
        selector: ".band-chip__name",
      })
      expect(names.map((n) => n.textContent)).toEqual(["B", "C", "A"])
    })
  })

  it("pointermove hits inner center loop (before chip) while dragging first chip", async () => {
    const three: SelectedBand[] = [
      { bandId: "a", name: "A", slug: "a", isHeadliner: true },
      { bandId: "b", name: "B", slug: "b", isHeadliner: true },
      { bandId: "c", name: "C", slug: "c", isHeadliner: true },
    ]
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
      function (this: Element) {
        const el = this as HTMLElement
        const idx = el.dataset.bandIndex
        if (el.classList.contains("band-chip") && idx === "0") {
          return makeDomRect(0, 0, 100, 40)
        }
        if (el.classList.contains("band-chip") && idx === "1") {
          return makeDomRect(110, 0, 100, 40)
        }
        if (el.classList.contains("band-chip") && idx === "2") {
          return makeDomRect(220, 0, 100, 40)
        }
        return makeDomRect(0, 0, 1, 1)
      }
    )
    render(<StatefulAutocomplete initialBands={three} />)

    fireEvent.pointerDown(
      screen.getByRole("button", { name: /drag to reorder a/i }),
      { clientX: 40, clientY: 20, pointerId: 88, bubbles: true }
    )
    await waitFor(() =>
      expect(document.querySelector(".band-chip--dragging")).toBeTruthy()
    )
    fireEvent.pointerMove(document, {
      clientX: 155,
      clientY: 20,
      pointerId: 88,
      bubbles: true,
    })
    fireEvent.pointerUp(document, { pointerId: 88 })
    await waitFor(() =>
      expect(document.querySelector(".band-chip--dragging")).toBeNull()
    )
  })

  it("pointer drag before third chip exercises pendingDrop before-branch", async () => {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
      function (this: Element) {
        const el = this as HTMLElement
        const idx = el.dataset.bandIndex
        if (el.classList.contains("band-chip") && idx === "0") {
          return makeDomRect(0, 0, 100, 40)
        }
        if (el.classList.contains("band-chip") && idx === "1") {
          return makeDomRect(110, 0, 100, 40)
        }
        if (el.classList.contains("band-chip") && idx === "2") {
          return makeDomRect(220, 0, 100, 40)
        }
        return makeDomRect(0, 0, 1, 1)
      }
    )
    const three: SelectedBand[] = [
      { bandId: "a", name: "A", slug: "a", isHeadliner: true },
      { bandId: "b", name: "B", slug: "b", isHeadliner: true },
      { bandId: "c", name: "C", slug: "c", isHeadliner: true },
    ]
    render(<StatefulAutocomplete initialBands={three} />)

    fireEvent.pointerDown(
      screen.getByRole("button", { name: /drag to reorder a/i }),
      { clientX: 40, clientY: 20, pointerId: 101, bubbles: true }
    )
    await waitFor(() =>
      expect(document.querySelector(".band-chip--dragging")).toBeTruthy()
    )
    fireEvent.pointerMove(document, {
      clientX: 240,
      clientY: 20,
      pointerId: 101,
      bubbles: true,
    })
    fireEvent.pointerUp(document, { pointerId: 101 })
    await waitFor(() => {
      const names = screen.getAllByText(/^[ABC]$/, {
        selector: ".band-chip__name",
      })
      expect(names.map((n) => n.textContent)).toEqual(["B", "A", "C"])
    })
  })

  it("headliner drag skips support chip in candidate loop", async () => {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
      function (this: Element) {
        const el = this as HTMLElement
        const idx = el.dataset.bandIndex
        if (el.classList.contains("band-chip") && idx === "0") {
          return makeDomRect(0, 0, 100, 40)
        }
        if (el.classList.contains("band-chip") && idx === "1") {
          return makeDomRect(120, 0, 100, 40)
        }
        return makeDomRect(0, 0, 1, 1)
      }
    )
    const mixed: SelectedBand[] = [
      { bandId: "h", name: "H", slug: "h", isHeadliner: true },
      { bandId: "s", name: "S", slug: "s", isHeadliner: false },
    ]
    render(<StatefulAutocomplete initialBands={mixed} />)

    fireEvent.pointerDown(
      screen.getByRole("button", { name: /drag to reorder h/i }),
      { clientX: 40, clientY: 20, pointerId: 202, bubbles: true }
    )
    await waitFor(() =>
      expect(document.querySelector(".band-chip--dragging")).toBeTruthy()
    )
    fireEvent.pointerMove(document, {
      clientX: 200,
      clientY: 20,
      pointerId: 202,
      bubbles: true,
    })
    fireEvent.pointerUp(document, { pointerId: 202 })
    await waitFor(() =>
      expect(document.querySelector(".band-chip--dragging")).toBeNull()
    )
  })
})

function initialTwoHeadliners(): SelectedBand[] {
  return [
    { bandId: "1", name: "A", slug: "a", isHeadliner: true },
    { bandId: "2", name: "B", slug: "b", isHeadliner: true },
  ]
}
