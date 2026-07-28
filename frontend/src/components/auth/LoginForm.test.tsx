import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
  useSearchParams: () => new URLSearchParams(),
}));

const signInWithPassword = vi.fn();
const signInWithOtp = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { signInWithPassword, signInWithOtp } }),
}));

const { LoginForm } = await import("./LoginForm");

describe("LoginForm", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows a validation error for a malformed email", async () => {
    render(<LoginForm />);
    await userEvent.type(screen.getByLabelText(/email/i), "not-an-email");
    await userEvent.type(screen.getByLabelText(/password/i), "secret123");
    await userEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

    expect(await screen.findByText(/doesn't look like an email/i)).toBeInTheDocument();
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("never reveals whether the account exists", async () => {
    signInWithPassword.mockResolvedValue({
      error: { message: "Invalid login credentials", status: 400 },
    });

    render(<LoginForm />);
    await userEvent.type(screen.getByLabelText(/email/i), "a@b.co");
    await userEvent.type(screen.getByLabelText(/password/i), "wrongpass");
    await userEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/didn't match an account/i);
    // A message naming the email, or saying "no such user", would let a
    // stranger enumerate accounts.
    expect(alert.textContent).not.toMatch(/no account|not found|a@b\.co/i);
  });

  it("redirects on success", async () => {
    signInWithPassword.mockResolvedValue({ error: null });

    render(<LoginForm />);
    await userEvent.type(screen.getByLabelText(/email/i), "a@b.co");
    await userEvent.type(screen.getByLabelText(/password/i), "secret123");
    await userEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/account"));
  });

  it("explains a rate limit rather than blaming the credentials", async () => {
    signInWithPassword.mockResolvedValue({ error: { message: "rate", status: 429 } });

    render(<LoginForm />);
    await userEvent.type(screen.getByLabelText(/email/i), "a@b.co");
    await userEvent.type(screen.getByLabelText(/password/i), "secret123");
    await userEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/too many attempts/i);
  });

  it("confirms when a magic link is sent", async () => {
    signInWithOtp.mockResolvedValue({ error: null });

    render(<LoginForm />);
    await userEvent.type(screen.getByLabelText(/email/i), "a@b.co");
    await userEvent.click(screen.getByRole("button", { name: /sign-in link/i }));

    expect(await screen.findByText(/check your inbox/i)).toBeInTheDocument();
  });
});
