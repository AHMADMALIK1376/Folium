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
import { createClient } from "@/lib/supabase/client";
import { loginSchema, magicLinkSchema, type LoginValues } from "@/lib/validation/auth";

/** Shown for every failed sign-in, whatever the cause.
 *
 * Distinguishing "wrong password" from "no such account" turns the login form
 * into a tool for discovering who has an account here. */
const GENERIC_FAILURE = "Those details didn't match an account.";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [formError, setFormError] = useState<string | null>(null);
  const [magicSent, setMagicSent] = useState(false);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });

  const onSubmit = async (values: LoginValues) => {
    setFormError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword(values);

    if (error) {
      setFormError(error.status === 429
        ? "Too many attempts. Wait a minute and try again."
        : GENERIC_FAILURE);
      return;
    }

    router.push(params.get("redirectTo") ?? "/account");
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
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/callback` },
    });

    if (error) {
      setFormError(error.status === 429
        ? "Too many requests. Wait a few minutes before asking for another link."
        : "Could not send the link. Try again.");
      return;
    }
    setMagicSent(true);
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

        <Button type="button" variant="ghost" onClick={sendMagicLink}>
          Email me a sign-in link instead
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
