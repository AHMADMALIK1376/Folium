"use client";

import { useEffect, useState } from "react";

import { AuthMessage } from "@/components/auth/AuthMessage";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError } from "@/lib/api/errors";
import { getMe, type UserProfile } from "@/lib/api/client";

export default function AccountPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMe()
      .then(setProfile)
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 503) {
          // 2A deliberately separates this from a 401 so an outage is not
          // mistaken for everyone's credentials failing at once.
          setError("Sign-in is temporarily unavailable. Try again shortly.");
        } else if (err instanceof ApiError && err.status === 401) {
          setError("Your session has expired. Sign in again.");
        } else {
          setError("Could not load your profile.");
        }
      });
  }, []);

  // The bfcache guard that used to live here is now StaleSessionGuard, rendered
  // once in the (app) layout so every page behind the guard is covered.

  if (error) return <AuthMessage kind="error">{error}</AuthMessage>;
  if (!profile) return <p className="text-sm text-neutral-500">Loading…</p>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{profile.display_name}</CardTitle>
        <CardDescription>{profile.email}</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-3 text-sm">
          <div>
            <dt className="text-neutral-500">Account ID</dt>
            <dd className="font-mono text-neutral-900">{profile.id}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Joined</dt>
            <dd className="text-neutral-900">
              {new Date(profile.created_at).toLocaleDateString()}
            </dd>
          </div>
        </dl>
        <p className="mt-6 text-sm text-neutral-500">
          This profile was loaded from the Folium API, which verified your
          Supabase token before answering.
        </p>
      </CardContent>
    </Card>
  );
}
