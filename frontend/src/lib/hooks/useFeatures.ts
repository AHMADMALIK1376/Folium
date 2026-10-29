"use client";

import { useEffect, useState } from "react";

import { getFeatures } from "@/lib/api/features";
import type { Features } from "@/lib/api/types";

/** One request per page load, shared by everything that asks.
 *
 * The answer cannot change without a redeploy, so it is fetched once and kept.
 * A failure is not cached: a blip must not hide a feature until the next full
 * reload.
 */
let pending: Promise<Features> | null = null;

export function resetFeaturesCache(): void {
  pending = null;
}

/** The deployment's feature flags, or null while unknown or if they could not
 *  be loaded. Callers treat null as "say nothing": showing a warning that a
 *  feature is off when we merely failed to ask would be a false alarm. */
export function useFeatures(): Features | null {
  const [features, setFeatures] = useState<Features | null>(null);

  useEffect(() => {
    let cancelled = false;
    pending ??= getFeatures().catch((e) => {
      pending = null;
      throw e;
    });
    pending.then(
      (f) => !cancelled && setFeatures(f),
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, []);

  return features;
}
