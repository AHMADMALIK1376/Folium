"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { AuthMessage } from "@/components/auth/AuthMessage";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { safeRedirect } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/client";
import { loginSchema, magicLinkSchema, type LoginValues } from "@/lib/validation/auth";

/** Shown for every failed sign-in, whatever the cause.
 *
 * Distinguishing "wrong password" from "no such account" turns the login form
 * into a tool for discovering who has an account here. */
const GENERIC_FAILURE = "Those details didn't match an account.";

/** Shown when a Supabase call throws instead of resolving — a dropped
 * connection, DNS failure, etc. Kept identical across every auth action so it
 * can't be used to tell them apart. */
const NETWORK_FAILURE = "Could not reach the server. Check your connection and try again.";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [formError, setFormError] = useState<string | null>(null);
  const [magicSent, setMagicSent] = useState(false);
  const [sendingLink, setSendingLink] = useState(false);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });

  const onSubmit = async (values: LoginValues) => {
    setFormError(null);
    const supabase = createClient();

    try {
      const { error } = await supabase.auth.signInWithPassword(values);

      if (error) {
        setFormError(error.status === 429
          ? "Too many attempts. Wait a minute and try again."
          : GENERIC_FAILURE);
        return;
      }
    } catch {
      setFormError(NETWORK_FAILURE);
      return;
    }

    router.push(safeRedirect(params.get("redirectTo")));
    router.refresh();
  };

  const sendMagicLink = async () => {
    setFormError(null);
    // Validate with the same schema the dedicated form would use, rather than
    // a hand-rolled check that could drift from it.
    const parsed = magicLinkSchema.safeParse({ email: getValues("email") });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0].message);
      return;
    }
    const { email } = parsed.data;

    const supabase = createClient();
    setSendingLink(true);

    try {
      // Deliberately ignoring the error here (aside from the network-failure
      // catch below). With shouldCreateUser: false, an unregistered address
      // sends no email and never touches the rate limiter, so it can always
      // show "Check your inbox." A registered address does consume the rate
      // limit and will eventually 429 — special-casing that response would
      // let a caller tell the two apart by how many requests it takes to see
      // "Too many requests." Every outcome gets the same confirmation.
      await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/callback`,
          // The login page should never be able to create an account — that's
          // the sign-up page's job. Without this, Supabase's default
          // (shouldCreateUser: true) means typing any address here silently
          // registers it.
          shouldCreateUser: false,
        },
      });

      setMagicSent(true);
    } catch {
      setFormError(NETWORK_FAILURE);
    } finally {
      setSendingLink(false);
    }
  };

  if (magicSent) {
    return (
      <AuthMessage kind="success">
        Check your inbox for a sign-in link.
      </AuthMessage>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      {formError && <AuthMessage kind="error">{formError}</AuthMessage>}

      <div className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? "email-error" : undefined}
            {...register("email")}
          />
          {errors.email && (
            <p id="email-error" className="text-sm text-carmine-700">
              {errors.email.message}
            </p>
          )}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? "password-error" : undefined}
            {...register("password")}
          />
          {errors.password && (
            <p id="password-error" className="text-sm text-carmine-700">
              {errors.password.message}
            </p>
          )}
        </div>

        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Signing in…" : "Sign in"}
        </Button>

        <Button type="button" variant="ghost" disabled={sendingLink} onClick={sendMagicLink}>
          {sendingLink ? "Sending…" : "Email me a sign-in link instead"}
        </Button>
      </div>

      <OAuthButtons />

      <div className="mt-6 space-y-2 text-center text-sm text-neutral-500">
        <p>
          <Link href="/reset-password" className="text-carmine-500 hover:underline">
            Forgot your password?
          </Link>
        </p>
        <p>
          No account?{" "}
          <Link href="/signup" className="text-carmine-500 hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </form>
  );
}
