import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const signUp = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { signUp } }),
}));

const { SignupForm } = await import("./SignupForm");

describe("SignupForm", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects a password under 8 characters before calling Supabase", async () => {
    render(<SignupForm />);
    await userEvent.type(screen.getByLabelText(/email/i), "a@b.co");
    await userEvent.type(screen.getByLabelText(/password/i), "short");
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByText(/at least 8 characters/i)).toBeInTheDocument();
    expect(signUp).not.toHaveBeenCalled();
  });

  it("shows the same confirmation for an address that already exists", async () => {
    // Supabase returns success for a duplicate address and emails the existing
    // owner. Surfacing "already registered" would leak the user list.
    signUp.mockResolvedValue({ error: null });

    render(<SignupForm />);
    await userEvent.type(screen.getByLabelText(/email/i), "taken@b.co");
    await userEvent.type(screen.getByLabelText(/password/i), "secret123");
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));

    const message = await screen.findByText(/check your inbox/i);
    expect(message).toBeInTheDocument();
    expect(message.textContent).not.toMatch(/already|exists|taken/i);
  });

  it("explains a rate limit clearly", async () => {
    signUp.mockResolvedValue({ error: { message: "rate", status: 429 } });

    render(<SignupForm />);
    await userEvent.type(screen.getByLabelText(/email/i), "a@b.co");
    await userEvent.type(screen.getByLabelText(/password/i), "secret123");
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/too many sign-up/i);
  });
});
