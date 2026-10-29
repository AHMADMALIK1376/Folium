import { apiFetch } from "./client";
import type { Features } from "./types";

export function getFeatures(): Promise<Features> {
  return apiFetch<Features>("/api/v1/features");
}
