import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

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

  it("shows the same confirmation when Supabase reports the address already exists", async () => {
    // With email confirmations off, Supabase returns an error (not the
    // obfuscated success it returns when confirmations are on) for a
    // duplicate address. Surfacing that distinctly would make sign-up an
    // oracle for discovering who already has an account.
    signUp.mockResolvedValue({
      error: { message: "User already registered", status: 422, code: "user_already_exists" },
    });

    render(<SignupForm />);
    await userEvent.type(screen.getByLabelText(/email/i), "taken@b.co");
    await userEvent.type(screen.getByLabelText(/password/i), "secret123");
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));

    const message = await screen.findByText(/check your inbox/i);
    expect(message).toBeInTheDocument();
    expect(message.textContent).not.toMatch(/already|exists|taken/i);
  });

  it("sends a newly signed-in user straight to their account", async () => {
    // With confirmations off, signUp returns a live session immediately —
    // there is no confirmation email coming, so the user should land in the
    // app instead of being told to check an inbox that stays empty.
    signUp.mockResolvedValue({
      data: { session: { access_token: "token" } },
      error: null,
    });

    render(<SignupForm />);
    await userEvent.type(screen.getByLabelText(/email/i), "fresh@b.co");
    await userEvent.type(screen.getByLabelText(/password/i), "secret123");
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/account"));
    expect(screen.queryByText(/check your inbox/i)).not.toBeInTheDocument();
  });
});
