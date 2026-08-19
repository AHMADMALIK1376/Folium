"use client";

import type { DiffSegment } from "@/lib/api/types";

/** A word-level diff, rendered so it reads without relying on colour.
 *
 * Additions are underlined and removals struck through as well as tinted.
 * Colour alone fails for the eight percent of men with a colour vision
 * deficiency, and "what changed" is exactly the information they would lose.
 */
export function VersionDiff({
  segments,
  added,
  removed,
}: {
  segments: DiffSegment[];
  added: number;
  removed: number;
}) {
  const unchanged = added === 0 && removed === 0;

  return (
    <div>
      <p className="mb-2 text-sm text-neutral-600">
        {unchanged ? (
          // Said plainly rather than rendering 900 unchanged words and leaving
          // the reader to conclude nothing happened.
          "No text has changed since this version."
        ) : (
          <>
            <span className="font-medium text-green-700">{added} added</span>
            {", "}
            <span className="font-medium text-carmine-700">{removed} removed</span>
          </>
        )}
      </p>

      {!unchanged && (
        <div className="folium-prose max-h-80 overflow-y-auto rounded-md border border-neutral-200 bg-white p-4 text-sm whitespace-pre-wrap">
          {segments.map((segment, index) => {
            if (segment.op === "equal") {
              return <span key={index}>{segment.text}</span>;
            }
            if (segment.op === "added") {
              return (
                <ins
                  key={index}
                  className="bg-green-50 text-green-900 underline decoration-green-600"
                >
                  {segment.text}
                </ins>
              );
            }
            return (
              <del
                key={index}
                className="bg-carmine-50 text-carmine-700 line-through decoration-carmine-500"
              >
                {segment.text}
              </del>
            );
          })}
        </div>
      )}
    </div>
  );
}
