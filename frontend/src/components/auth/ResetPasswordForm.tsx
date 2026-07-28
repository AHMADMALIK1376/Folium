"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";

import { AuthMessage } from "@/components/auth/AuthMessage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import {
  newPasswordSchema,
  resetRequestSchema,
  type NewPasswordValues,
  type ResetRequestValues,
} from "@/lib/validation/auth";

/** One component, two modes.
 *
 * Arriving from a reset email leaves an active recovery session, so the form
 * asks for a new password. Otherwise it asks where to send the link. */
export function ResetPasswordForm() {
  const router = useRouter();
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      setHasRecoverySession(!!data.session);
    });
  }, []);

  const requestForm = useForm<ResetRequestValues>({
    resolver: zodResolver(resetRequestSchema),
  });
  const updateForm = useForm<NewPasswordValues>({
    resolver: zodResolver(newPasswordSchema),
  });

  const requestLink = async (values: ResetRequestValues) => {
    setFormError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(values.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error && error.status === 429) {
      setFormError("Too many requests. Wait a few minutes and try again.");
      return;
    }
    // Always report success, even on failure: confirming which addresses are
    // registered would leak the user list.
    setSent(true);
  };

  const updatePassword = async (values: NewPasswordValues) => {
    setFormError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: values.password });
    if (error) {
      setFormError("Could not update the password. Request a new link.");
      return;
    }
    router.push("/account");
    router.refresh();
  };

  if (sent) {
    return (
      <AuthMessage kind="success">
        If that address has an account, a reset link is on its way.
      </AuthMessage>
    );
  }

  if (hasRecoverySession) {
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
              {...updateForm.register("password")}
            />
            {updateForm.formState.errors.password && (
              <p className="text-sm text-carmine-700">
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
              {...updateForm.register("confirm")}
            />
            {updateForm.formState.errors.confirm && (
              <p className="text-sm text-carmine-700">
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
            {...requestForm.register("email")}
          />
          {requestForm.formState.errors.email && (
            <p className="text-sm text-carmine-700">
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
