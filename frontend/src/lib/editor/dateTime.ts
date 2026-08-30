/** Inserting today's date.
 *
 * Text, not a field. Word offers "update automatically", which makes the date a
 * live object that changes under whoever opens the document next — useful on a
 * letterhead and quietly wrong on a dated record, which is the more common case
 * here. What is inserted is what the document will always say.
 *
 * Formatted in the reader's own locale at the moment of insertion, then frozen
 * as characters. Nothing is stored but text, so this costs the schema and the
 * Markdown converters nothing.
 */

export type DateFormat = {
  /** Stable across renders, so React keys and tests do not depend on the
   *  formatted output — which changes every day by design. */
  id: string;
  format: (date: Date, locale?: string) => string;
};

/** `undefined` locale means "the reader's own", which is what Intl does with it
 *  and what a person inserting a date into their own document wants. Tests pass
 *  an explicit locale, because a test that depends on the machine's regional
 *  settings fails on someone else's laptop for no reason. */
function fmt(options: Intl.DateTimeFormatOptions) {
  return (date: Date, locale?: string) =>
    new Intl.DateTimeFormat(locale, options).format(date);
}

export const DATE_FORMATS: DateFormat[] = [
  { id: "long-date", format: fmt({ dateStyle: "long" }) },
  { id: "full-date", format: fmt({ dateStyle: "full" }) },
  { id: "medium-date", format: fmt({ dateStyle: "medium" }) },
  { id: "short-date", format: fmt({ dateStyle: "short" }) },
  { id: "date-and-time", format: fmt({ dateStyle: "medium", timeStyle: "short" }) },
  { id: "time", format: fmt({ timeStyle: "short" }) },
  {
    // The one format that is not the reader's locale, deliberately: ISO 8601
    // sorts as a string, means the same thing everywhere, and is what anyone
    // putting a date in a filename or a table column actually wants.
    id: "iso",
    format: (date: Date) => {
      const pad = (value: number) => String(value).padStart(2, "0");
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    },
  },
];

/** Every format applied to one date, ready to list.
 *
 * Computed together from a single `Date` so the list cannot straddle midnight —
 * formatting each entry from its own `new Date()` could show two different days
 * in the same menu.
 */
export function formatOptions(
  date: Date,
  locale?: string,
): { id: string; text: string }[] {
  return DATE_FORMATS.map((entry) => ({ id: entry.id, text: entry.format(date, locale) }));
}
