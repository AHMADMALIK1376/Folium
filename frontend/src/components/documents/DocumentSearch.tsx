"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { ApiErrorMessage } from "@/components/documents/ApiErrorMessage";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { searchDocuments } from "@/lib/api/documents";
import type { SearchResult } from "@/lib/api/types";

/** Below this, a query matches most of the account and costs a round trip to
 *  find that out. Kept in step with MIN_QUERY_LENGTH in services/search.py. */
const MIN_LENGTH = 2;

/** Long enough that a typist is not sending a request per keystroke, short
 *  enough that stopping to read feels immediate. The same reasoning as autosave,
 *  which settled on a comparable figure for the same reason. */
const DEBOUNCE_MS = 250;

export function DocumentSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [searching, setSearching] = useState(false);

  // Guards against an older response landing after a newer one and overwriting
  // it — the classic race that makes a search box show results for a query the
  // user has already moved past.
  const latest = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();

    if (trimmed.length < MIN_LENGTH) {
      setResults(null);
      setError(null);
      setSearching(false);
      return;
    }

    const attempt = ++latest.current;
    setSearching(true);

    const timer = window.setTimeout(async () => {
      try {
        const found = await searchDocuments(trimmed);
        if (attempt !== latest.current) return;
        setResults(found.results);
        setError(null);
      } catch (e) {
        if (attempt !== latest.current) return;
        setError(e);
      } finally {
        if (attempt === latest.current) setSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [query]);

  return (
    <search className="mb-6">
      <Label htmlFor="document-search" className="sr-only">
        Search documents
      </Label>
      <Input
        id="document-search"
        type="search"
        value={query}
        placeholder="Search your documents…"
        onChange={(event) => setQuery(event.target.value)}
      />

      {error != null && (
        <div className="mt-3">
          <ApiErrorMessage error={error} fallback="Could not search. Try again." />
        </div>
      )}

      {/* Announced rather than merely shown: the list below changes without the
          page moving, which a screen reader would otherwise never mention. */}
      <div role="status" aria-label="Search status" className="sr-only">
        {searching
          ? "Searching"
          : results
            ? `${results.length} result${results.length === 1 ? "" : "s"}`
            : ""}
      </div>

      {results != null && results.length === 0 && !searching && (
        <p className="mt-3 text-sm text-neutral-500">
          Nothing matches “{query.trim()}”.
        </p>
      )}

      {results != null && results.length > 0 && (
        <ul className="mt-3 divide-y divide-neutral-100 rounded-md border border-neutral-200">
          {results.map((result) => (
            <li key={result.id}>
              <Link
                href={`/documents/${result.id}`}
                className="block px-4 py-3 hover:bg-neutral-50"
              >
                <span className="flex items-baseline gap-2">
                  <span className="font-medium text-neutral-900">{result.title}</span>
                  {!result.owned && (
                    <span className="text-xs text-neutral-500">shared with you</span>
                  )}
                </span>
                {result.snippet && (
                  <span className="mt-0.5 block truncate text-sm text-neutral-500">
                    {result.snippet}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </search>
  );
}
