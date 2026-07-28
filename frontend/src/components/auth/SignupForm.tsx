"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { AuthMessage } from "@/components/auth/AuthMessage";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { signupSchema, type SignupValues } from "@/lib/validation/auth";

export function SignupForm() {
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
    const { error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: { emailRedirectTo: `${window.location.origin}/callback` },
    });

    if (error) {
      setFormError(error.status === 429
        ? "Too many sign-up attempts. Wait a few minutes and try again."
        : "Could not create the account. Try again.");
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
