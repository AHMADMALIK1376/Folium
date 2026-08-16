import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const pathname = vi.fn();
vi.mock("next/navigation", () => ({ usePathname: () => pathname() }));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { Sidebar } = await import("./Sidebar");

beforeEach(() => {
  vi.clearAllMocks();
  pathname.mockReturnValue("/dashboard");
});

describe("Sidebar", () => {
  it("offers every section", () => {
    render(<Sidebar />);

    for (const label of ["Documents", "Starred", "Trash"]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
  });

  it("marks the current section with aria-current, not a colour alone", () => {
    // Which section you are in is information, and a screen reader has no other
    // way to learn it.
    pathname.mockReturnValue("/starred");

    render(<Sidebar />);

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

    render(<Sidebar />);

    for (const label of ["Documents", "Starred", "Trash"]) {
      expect(screen.getByRole("link", { name: label })).not.toHaveAttribute("aria-current");
    }
  });

  it("is labelled, so it is reachable as a landmark", () => {
    render(<Sidebar />);

    expect(screen.getByRole("navigation", { name: /sections/i })).toBeInTheDocument();
  });
});
