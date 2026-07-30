"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";

import { AuthMessage } from "@/components/auth/AuthMessage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_REDIRECT } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/client";
import {
  newPasswordSchema,
  resetRequestSchema,
  type NewPasswordValues,
  type ResetRequestValues,
} from "@/lib/validation/auth";

/** Shown when a Supabase call throws instead of resolving — a dropped
 * connection, DNS failure, etc. Kept identical across every auth action so it
 * can't be used to tell them apart. */
const NETWORK_FAILURE = "Could not reach the server. Check your connection and try again.";

/** How long to wait for Supabase's PASSWORD_RECOVERY event before assuming
 * this is a direct visit and settling into request-a-link mode. */
const RECOVERY_DETECTION_TIMEOUT_MS = 2000;

/** Shown when the URL carries a recovery `code` — proof the visitor did open
 * a reset link — but no PASSWORD_RECOVERY event arrived in time. Supabase's
 * PKCE exchange needs the code-verifier cookie set by the browser that
 * requested the reset; opening the email in a different browser (or a
 * different profile) leaves no verifier, so the exchange can never
 * complete. Reverting to request mode here would send them into an
 * infinite loop: request a link, open it elsewhere, land back on the
 * request form, repeat. */
const CROSS_BROWSER_FAILURE =
  "This reset link can only be opened in the browser you requested it from. Request a new one here.";

type Mode = "loading" | "recovery" | "request" | "link-error";

/** One component, two modes.
 *
 * Arriving from a reset email fires Supabase's PASSWORD_RECOVERY auth event,
 * so the form asks for a new password. Otherwise it asks where to send the
 * link. A session alone isn't the right signal: an already-signed-in user
 * who simply navigates to /reset-password has a session too, but didn't
 * arrive via a recovery link. */
export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<Mode>("loading");
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // A `code` param proves this visit came from a reset link (Supabase's PKCE
  // flow appends it), even before we know whether the exchange can succeed
  // in this browser.
  const hasRecoveryCode = searchParams.get("code") !== null;

  useEffect(() => {
    const supabase = createClient();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setMode("recovery");
      }
    });

    // A direct visit (no recovery link) never fires PASSWORD_RECOVERY, so
    // fall back to request-a-link mode after a short wait rather than
    // showing "Loading…" forever. But a visit that DOES carry a recovery
    // code and still hasn't gotten the event means the PKCE exchange can't
    // complete here — most likely the link was opened in a different
    // browser than the one that requested it, so the code-verifier cookie
    // is missing. Reverting to request-a-link mode in that case would loop
    // forever: request, open elsewhere, land back on request, repeat.
    const timeout = setTimeout(() => {
      setMode((current) => {
        if (current !== "loading") return current;
        return hasRecoveryCode ? "link-error" : "request";
      });
    }, RECOVERY_DETECTION_TIMEOUT_MS);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [hasRecoveryCode]);

  const requestForm = useForm<ResetRequestValues>({
    resolver: zodResolver(resetRequestSchema),
  });
  const updateForm = useForm<NewPasswordValues>({
    resolver: zodResolver(newPasswordSchema),
  });

  const requestLink = async (values: ResetRequestValues) => {
    setFormError(null);
    const supabase = createClient();

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(values.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error && error.status === 429) {
        setFormError("Too many requests. Wait a few minutes and try again.");
        return;
      }
    } catch {
      // A thrown error must not reveal anything about whether an account
      // exists, so it gets the same generic network message as any other
      // failure here.
      setFormError(NETWORK_FAILURE);
      return;
    }

    // Always report success, even on failure: confirming which addresses are
    // registered would leak the user list.
    setSent(true);
  };

  const updatePassword = async (values: NewPasswordValues) => {
    setFormError(null);
    const supabase = createClient();

    try {
      const { error } = await supabase.auth.updateUser({ password: values.password });
      if (error) {
        setFormError("Could not update the password. Request a new link.");
        return;
      }
    } catch {
      setFormError(NETWORK_FAILURE);
      return;
    }

    router.push(DEFAULT_REDIRECT);
    router.refresh();
  };

  if (sent) {
    return (
      <AuthMessage kind="success">
        If that address has an account, a reset link is on its way.
      </AuthMessage>
    );
  }

  if (mode === "loading") {
    return <p className="text-sm text-neutral-500">Loading…</p>;
  }

  if (mode === "link-error") {
    return <AuthMessage kind="error">{CROSS_BROWSER_FAILURE}</AuthMessage>;
  }

  if (mode === "recovery") {
    return (
      <form onSubmit={updateForm.handleSubmit(updatePassword)} noValidate>
        {formError && <AuthMessage kind="error">{formError}</AuthMessage>}
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="password">New password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              aria-invalid={!!updateForm.formState.errors.password}
              aria-describedby={
                updateForm.formState.errors.password ? "new-password-error" : undefined
              }
              {...updateForm.register("password")}
            />
            {updateForm.formState.errors.password && (
              <p id="new-password-error" className="text-sm text-carmine-700">
                {updateForm.formState.errors.password.message}
              </p>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="confirm">Confirm password</Label>
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              aria-invalid={!!updateForm.formState.errors.confirm}
              aria-describedby={
                updateForm.formState.errors.confirm ? "confirm-password-error" : undefined
              }
              {...updateForm.register("confirm")}
            />
            {updateForm.formState.errors.confirm && (
              <p id="confirm-password-error" className="text-sm text-carmine-700">
                {updateForm.formState.errors.confirm.message}
              </p>
            )}
          </div>
          <Button type="submit" disabled={updateForm.formState.isSubmitting}>
            {updateForm.formState.isSubmitting ? "Saving…" : "Set new password"}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={requestForm.handleSubmit(requestLink)} noValidate>
      {formError && <AuthMessage kind="error">{formError}</AuthMessage>}
      <div className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            aria-invalid={!!requestForm.formState.errors.email}
            aria-describedby={
              requestForm.formState.errors.email ? "reset-email-error" : undefined
            }
            {...requestForm.register("email")}
          />
          {requestForm.formState.errors.email && (
            <p id="reset-email-error" className="text-sm text-carmine-700">
              {requestForm.formState.errors.email.message}
            </p>
          )}
        </div>
        <Button type="submit" disabled={requestForm.formState.isSubmitting}>
          {requestForm.formState.isSubmitting ? "Sending…" : "Email me a reset link"}
        </Button>
      </div>
      <p className="mt-6 text-center text-sm text-neutral-500">
        <Link href="/login" className="text-carmine-500 hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
