"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/** Someone who can be addressed in a comment. */
export interface Mentionable {
  id: string;
  display_name: string;
}

/** Which of `people` the text still addresses.
 *
 * Derived from the body at submit time rather than accumulated as they are
 * picked, and that is the point: deleting "@Ada" from the text has to remove
 * the mention. Otherwise someone gets "Ada mentioned you" about a comment that
 * does not mention them, and there is no way for the sender to take it back.
 */
export function mentionedIn(body: string, people: Mentionable[]): string[] {
  return people.filter((person) => body.includes(`@${person.display_name}`)).map((p) => p.id);
}

/** The text after replacing the `@…` the caret sits in with a name. */
function insertMention(body: string, caret: number, name: string): { text: string; caret: number } {
  const before = body.slice(0, caret);
  const at = before.lastIndexOf("@");
  const head = at === -1 ? before : before.slice(0, at);
  const inserted = `@${name} `;

  return { text: head + inserted + body.slice(caret), caret: head.length + inserted.length };
}

/** The partial name being typed after an `@`, or null if the caret is not in one. */
export function activeQuery(body: string, caret: number): string | null {
  const before = body.slice(0, caret);
  const at = before.lastIndexOf("@");
  if (at === -1) return null;

  const typed = before.slice(at + 1);
  // A newline ends it, and so does the `@` being part of a word — "a@b" is an
  // email address, not the start of a mention.
  if (typed.includes("\n")) return null;
  if (at > 0 && !/\s/.test(before[at - 1])) return null;

  return typed;
}

/** A comment box that can address people by name.
 *
 * The picker offers only people who can already see the document. Mentioning
 * anyone else would either leak the document's existence to them or promise a
 * link they cannot open, and the backend refuses it — so the list is the truth
 * about who is mentionable, not a convenience.
 */
export function MentionField({
  value,
  onChange,
  people,
  label,
  placeholder,
  rows = 2,
  disabled,
  onCompose,
}: {
  value: string;
  onChange: (value: string) => void;
  people: Mentionable[];
  label: string;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  /** Fired when someone starts composing, so the caller can make sure the
   *  mentionable list is current. Shares change while a document is open —
   *  fetching once at mount means anyone added since is invisible here. */
  onCompose?: () => void;
}) {
  const field = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState(0);
  const [picking, setPicking] = useState(false);
  const [highlighted, setHighlighted] = useState(0);

  const query = picking ? activeQuery(value, caret) : null;

  const matches = useMemo(() => {
    if (query === null) return [];
    const needle = query.toLowerCase();
    return people
      .filter((person) => person.display_name.toLowerCase().includes(needle))
      .slice(0, 6);
  }, [query, people]);

  useEffect(() => setHighlighted(0), [query]);

  // No people, no menu. An empty picker is a control that does nothing while
  // looking like it should.
  const showing = picking && query !== null && matches.length > 0;

  const choose = (person: Mentionable) => {
    const next = insertMention(value, caret, person.display_name);
    onChange(next.text);
    setPicking(false);
    requestAnimationFrame(() => {
      field.current?.focus();
      field.current?.setSelectionRange(next.caret, next.caret);
      setCaret(next.caret);
    });
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showing) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlighted((i) => (i + 1) % matches.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted((i) => (i - 1 + matches.length) % matches.length);
    } else if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      choose(matches[highlighted]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setPicking(false);
    }
  };

  return (
    <div className="relative">
      <textarea
        ref={field}
        value={value}
        rows={rows}
        maxLength={5000}
        disabled={disabled}
        aria-label={label}
        placeholder={placeholder}
        // The listbox is keyboard-navigable through the textarea itself, so the
        // relationship has to be declared or a screen reader hears nothing.
        aria-autocomplete="list"
        aria-expanded={showing}
        aria-controls={showing ? "mention-options" : undefined}
        onChange={(event) => {
          onChange(event.target.value);
          setCaret(event.target.selectionStart ?? event.target.value.length);
          setPicking(true);
        }}
        onKeyDown={onKeyDown}
        onClick={(event) => setCaret(event.currentTarget.selectionStart ?? 0)}
        onFocus={() => onCompose?.()}
        onBlur={() => {
          // Delayed, so a click on an option lands before the menu goes.
          setTimeout(() => setPicking(false), 150);
        }}
        className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus-visible:border-carmine-500"
      />

      {showing && (
        <ul
          id="mention-options"
          role="listbox"
          aria-label="People you can mention"
          className="absolute z-20 mt-1 w-full max-w-xs overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg"
        >
          {matches.map((person, index) => (
            <li key={person.id}>
              <button
                type="button"
                role="option"
                aria-selected={index === highlighted}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(person)}
                className={cn(
                  "block w-full truncate px-3 py-1.5 text-left text-sm",
                  index === highlighted
                    ? "bg-carmine-50 text-carmine-700"
                    : "text-neutral-700 hover:bg-neutral-50",
                )}
              >
                {person.display_name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
