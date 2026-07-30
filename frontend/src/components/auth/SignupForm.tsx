"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { AuthMessage } from "@/components/auth/AuthMessage";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_REDIRECT } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/client";
import { signupSchema, type SignupValues } from "@/lib/validation/auth";

/** Shown when a Supabase call throws instead of resolving — a dropped
 * connection, DNS failure, etc. Kept identical across every auth action so it
 * can't be used to tell them apart. */
const NETWORK_FAILURE = "Could not reach the server. Check your connection and try again.";

export function SignupForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupValues>({ resolver: zodResolver(signupSchema) });

  const onSubmit = async (values: SignupValues) => {
    setFormError(null);
    const supabase = createClient();

    try {
      const { data, error } = await supabase.auth.signUp({
        email: values.email,
        password: values.password,
        options: { emailRedirectTo: `${window.location.origin}/callback` },
      });

      if (error) {
        // With email confirmations off, Supabase returns an error for an
        // address that's already registered instead of the obfuscated user
        // object it returns when confirmations are on. Treating this as
        // success keeps the two cases indistinguishable — otherwise a taken
        // address responds differently from a fresh one, and sign-up becomes
        // an oracle for discovering who has an account.
        if (error.code === "user_already_exists" || error.status === 422) {
          setDone(true);
          return;
        }

        setFormError(error.status === 429
          ? "Too many sign-up attempts. Wait a few minutes and try again."
          : "Could not create the account. Try again.");
        return;
      }

      // With email confirmations off, signUp returns a live session
      // immediately — there is no confirmation email coming, so send them
      // straight into the app instead of telling them to check an inbox
      // that will stay empty.
      if (data?.session) {
        router.push(DEFAULT_REDIRECT);
        router.refresh();
        return;
      }
    } catch {
      // Must not reveal anything about whether an account exists, so this
      // gets the same generic network message as any other failure here.
      setFormError(NETWORK_FAILURE);
      return;
    }

    // Shown whether or not the address was already registered. Saying "that
    // email is taken" would let a stranger discover who has an account.
    // Supabase notifies the existing owner by email instead.
    setDone(true);
  };

  if (done) {
    return (
      <AuthMessage kind="success">
        Check your inbox to confirm your address, then sign in.
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
            autoComplete="new-password"
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
          {isSubmitting ? "Creating account…" : "Create account"}
        </Button>
      </div>

      <OAuthButtons />

      <p className="mt-6 text-center text-sm text-neutral-500">
        Already have an account?{" "}
        <Link href="/login" className="text-carmine-500 hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
