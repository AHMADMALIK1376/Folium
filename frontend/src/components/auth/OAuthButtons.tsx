"use client";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { createClient } from "@/lib/supabase/client";

/** Google and GitHub sign-in.
 *
 * Hidden until NEXT_PUBLIC_ENABLE_OAUTH is "true", because both need an app
 * registered in their own console and configured in Supabase before the
 * buttons can do anything. */
export function OAuthButtons() {
  if (process.env.NEXT_PUBLIC_ENABLE_OAUTH !== "true") return null;

  const signIn = async (provider: "google" | "github") => {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/callback` },
    });
  };

  return (
    <>
      <div className="my-4 flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-xs text-neutral-500">or</span>
        <Separator className="flex-1" />
      </div>
      <div className="grid gap-2">
        <Button type="button" variant="outline" onClick={() => signIn("google")}>
          Continue with Google
        </Button>
        <Button type="button" variant="outline" onClick={() => signIn("github")}>
          Continue with GitHub
        </Button>
      </div>
    </>
  );
}
