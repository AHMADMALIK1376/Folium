import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Folder } from "@/lib/api/types";

const pathname = vi.fn();
const searchParams = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => pathname(),
  useSearchParams: () => searchParams(),
  useRouter: () => ({ refresh: vi.fn() }),
}));

// The folder rail's dialog talks to the API on submit. Nothing here submits,
// but importing the real module would build a Supabase browser client in jsdom.
vi.mock("@/lib/api/documents", () => ({
  createFolder: vi.fn(),
  renameFolder: vi.fn(),
  deleteFolder: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    // Swallowed rather than spread: React warns about a boolean `prefetch` on a
    // plain anchor, and every link in this rail sets it.
    prefetch: _prefetch,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
    prefetch?: boolean;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { Sidebar } = await import("./Sidebar");

function folder(id: string, name: string, count = 0): Folder {
  return { id, name, created_at: "2026-01-01T00:00:00Z", document_count: count };
}

beforeEach(() => {
  vi.clearAllMocks();
  pathname.mockReturnValue("/dashboard");
  searchParams.mockReturnValue(new URLSearchParams());
});

describe("Sidebar", () => {
  it("offers every section", () => {
    render(<Sidebar folders={[]} />);

    for (const label of ["Documents", "Starred", "Trash"]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
  });

  it("marks the current section with aria-current, not a colour alone", () => {
    // Which section you are in is information, and a screen reader has no other
    // way to learn it.
    pathname.mockReturnValue("/starred");

    render(<Sidebar folders={[]} />);

    expect(screen.getByRole("link", { name: "Starred" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Documents" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("marks nothing when the route is not a section", () => {
    // The editor lives at /documents/{id}, which is none of these.
    pathname.mockReturnValue("/documents/abc-123");

    render(<Sidebar folders={[]} />);

    for (const label of ["Documents", "Starred", "Trash"]) {
      expect(screen.getByRole("link", { name: label })).not.toHaveAttribute("aria-current");
    }
  });

  it("is labelled, so it is reachable as a landmark", () => {
    render(<Sidebar folders={[]} />);

    expect(screen.getByRole("navigation", { name: /sections/i })).toBeInTheDocument();
  });

  it("lists folders with their counts", () => {
    render(<Sidebar folders={[folder("f1", "Clients", 3)]} />);

    const link = screen.getByRole("link", { name: /Clients/ });
    expect(link).toHaveAttribute("href", "/dashboard?folder=f1");
    expect(link).toHaveTextContent("3");
  });

  it("leaves an empty folder's count off rather than showing a zero", () => {
    render(<Sidebar folders={[folder("f1", "Clients", 0)]} />);

    expect(screen.getByRole("link", { name: /Clients/ })).not.toHaveTextContent("0");
  });

  it("does not mark Documents as current while a folder filters it", () => {
    // /dashboard?folder=f1 is still /dashboard, so a plain pathname check would
    // report two current sections at once.
    searchParams.mockReturnValue(new URLSearchParams("folder=f1"));

    render(<Sidebar folders={[folder("f1", "Clients")]} />);

    expect(screen.getByRole("link", { name: "Documents" })).not.toHaveAttribute(
      "aria-current",
    );
    expect(screen.getByRole("link", { name: /Clients/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("offers Unfiled only once there is a folder to file into", () => {
    render(<Sidebar folders={[]} />);
    expect(screen.queryByRole("link", { name: /Unfiled/ })).not.toBeInTheDocument();

    render(<Sidebar folders={[folder("f1", "Clients")]} />);
    expect(screen.getByRole("link", { name: /Unfiled/ })).toHaveAttribute(
      "href",
      "/dashboard?folder=unfiled",
    );
  });

  it("ignores a folder filter on another page", () => {
    // Search params are global; the rail is only a filter on the dashboard.
    pathname.mockReturnValue("/starred");
    searchParams.mockReturnValue(new URLSearchParams("folder=f1"));

    render(<Sidebar folders={[folder("f1", "Clients")]} />);

    expect(screen.getByRole("link", { name: /Clients/ })).not.toHaveAttribute(
      "aria-current",
    );
  });
});
