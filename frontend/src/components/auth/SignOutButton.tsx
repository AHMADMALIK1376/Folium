"use client";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();

  const signOut = async () => {
    const supabase = createClient();
    // Local scope only: signing out on this device shouldn't kill sessions on
    // the user's other devices. The default ("global") scope does exactly
    // that.
    await supabase.auth.signOut({ scope: "local" });
    router.push("/login");
    router.refresh();
  };

  return (
    <Button variant="ghost" onClick={signOut}>
      Sign out
    </Button>
  );
}
