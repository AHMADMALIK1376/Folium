import { Suspense } from "react";

import { LoginForm } from "@/components/auth/LoginForm";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Sign in — Folium" };

export default function LoginPage() {
  return (
    <Card>
      <CardContent className="pt-6">
        {/* useSearchParams needs a Suspense boundary to prerender. */}
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </CardContent>
    </Card>
  );
}
