"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  listNotifications,
  markNotificationsRead,
  unreadNotificationCount,
} from "@/lib/api/documents";
import { ApiError } from "@/lib/api/errors";
import type { AppNotification } from "@/lib/api/types";
import { cn } from "@/lib/utils";

/** How often to ask, in milliseconds.
 *
 * Polling, not a websocket, and that is a decision rather than a shortcut. The
 * collaboration server exists but is per-document and optional; a second
 * realtime system would be a second thing to operate, deploy and debug for a
 * feature whose whole requirement is "within a minute is fine". The count is
 * also refreshed straight after anything that could change it, so the common
 * case is not waiting on a tick. */
const POLL_MS = 60_000;

/** How soon to try again after a failed ask.
 *
 * Not the poll interval, and that difference is the whole point. The bell
 * mounts as soon as the page does, which can be before the Supabase client has
 * restored the session from storage — `apiFetch` then throws "Not signed in"
 * before any request is made. Swallowing that and waiting the full minute left
 * the bell silently saying nothing while something had already happened, and it
 * did so intermittently, which is the worst way for it to be wrong. */
const RETRY_MS = 3_000;

/** How soon to try again when there is no session yet.
 *
 * `apiFetch` raises ApiError(0) before making any request when the Supabase
 * client has no session — which, at mount, usually means "not yet" rather than
 * "not signed in": the page is already behind the auth guard, so the cookies
 * are good and only the browser client is still catching up. Retrying in a
 * second is the difference between a bell that is right immediately and one
 * that is blank for a few seconds on every cold load. */
const NOT_READY_MS = 1_000;

/** How long to wait for an answer before treating the attempt as failed.
 *
 * Not belt and braces. `apiFetch` asks the Supabase client for a session
 * first, and that call can *hang* rather than fail — it takes a
 * `navigator.locks` lock that is shared across every tab on the origin, so
 * another tab refreshing a token can hold it. A hung promise neither resolves
 * nor rejects, so without this the retry below is never scheduled and the bell
 * stays silent for the life of the page. That is exactly what a Playwright
 * trace showed: no request, and no second attempt either. */
const TIMEOUT_MS = 8_000;

function withTimeout<T>(work: Promise<T>): Promise<T> {
  return Promise.race([
    work,
    new Promise<never>((_resolve, reject) =>
      setTimeout(() => reject(new Error("timed out")), TIMEOUT_MS),
    ),
  ]);
}

function sentence(notification: AppNotification): string {
  const who = notification.actor_name ?? "Someone";

  switch (notification.kind) {
    case "mention":
      return `${who} mentioned you`;
    case "reply":
      return `${who} replied to you`;
    case "comment":
      return `${who} commented`;
    case "share":
      return `${who} shared a document with you`;
    default:
      // A kind this build does not know about is displayed rather than
      // dropped: a newer backend must not make notifications vanish.
      return `${who} did something`;
  }
}

/** The bell.
 *
 * Rendered in the header on every page behind the auth boundary, which is why
 * it is careful about what it costs: one small request on mount, one a minute
 * after that, and nothing at all rendered when there is nothing unread.
 */
export function NotificationBell() {
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[] | null>(null);
  const [failed, setFailed] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  // Bumped on failure to schedule a quick retry. A counter rather than a
  // boolean, so consecutive failures each get their own attempt.
  const [attempt, setAttempt] = useState(0);

  /** How long to wait before asking again: the poll interval on success, and
   *  something much shorter on failure.
   *
   *  Quiet, but not resigned. A bell that shouts about a transient failure is
   *  worse than one briefly out of date — and one that gives up for a minute is
   *  worse than either. `failed` only changes what the open panel says; the
   *  wait returned here is what fixes the count. */
  const refreshCount = useCallback(async () => {
    try {
      setCount((await withTimeout(unreadNotificationCount())).count);
      setFailed(false);
      return POLL_MS;
    } catch (error) {
      setFailed(true);
      // ApiError(0) is "no session yet", which at mount is a race with the
      // Supabase client rather than a real problem.
      return error instanceof ApiError && error.status === 0 ? NOT_READY_MS : RETRY_MS;
    }
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    void (async () => {
      const wait = await refreshCount();
      if (cancelled) return;
      timer = setTimeout(() => setAttempt((n) => n + 1), wait);
    })();

    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [refreshCount, attempt]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    void (async () => {
      try {
        const listed = await listNotifications();
        if (!cancelled) {
          setNotifications(listed);
          setFailed(false);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  // Close on a click outside and on Escape. Both, because a panel that can only
  // be dismissed one way is a panel someone gets stuck in.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!panel.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const markAll = async () => {
    try {
      const { count: remaining } = await markNotificationsRead();
      setCount(remaining);
      setNotifications((current) =>
        current?.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })) ?? null,
      );
    } catch {
      setFailed(true);
    }
  };

  const openAndRead = async (notification: AppNotification) => {
    setOpen(false);
    if (notification.read_at !== null) return;
    try {
      setCount((await markNotificationsRead([notification.id])).count);
    } catch {
      // The navigation is what the person asked for; a failed read-marking is
      // not worth interrupting it, and the next poll will correct the count.
    }
  };

  return (
    <div className="relative" ref={panel}>
      <button
        type="button"
        onClick={() => setOpen((shown) => !shown)}
        aria-expanded={open}
        aria-haspopup="menu"
        // The count is in the accessible name rather than only in a badge:
        // "3 unread" is the information, and a coloured dot is not readable.
        aria-label={count > 0 ? `Notifications, ${count} unread` : "Notifications"}
        className="relative rounded-md px-2 py-1 text-sm text-neutral-500 transition-colors hover:text-carmine-500 focus-visible:ring-2 focus-visible:ring-carmine-500 focus-visible:outline-none"
      >
        <span aria-hidden="true">🔔</span>
        {/* No badge at zero. A zero badge is noise, and noise next to a control
            trains people to stop looking at it. */}
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-carmine-500 px-1 text-[10px] leading-4 font-medium text-white">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Notifications"
          className="absolute right-0 z-50 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-lg border border-neutral-200 bg-white p-2 shadow-lg"
        >
          <div className="mb-1 flex items-center justify-between gap-2 px-1">
            <span className="text-xs font-medium text-neutral-500">Notifications</span>
            {count > 0 && (
              <button
                type="button"
                onClick={markAll}
                className="text-xs text-neutral-500 underline-offset-4 hover:text-carmine-500 hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>

          {failed ? (
            <p className="px-1 py-2 text-sm text-neutral-500">
              Could not load your notifications.
            </p>
          ) : notifications == null ? (
            <p className="px-1 py-2 text-sm text-neutral-500">Loading…</p>
          ) : notifications.length === 0 ? (
            // Says what will appear rather than showing a blank, for the reason
            // the shared-documents list does.
            <p className="px-1 py-2 text-sm text-neutral-500">
              Comments, replies, mentions and documents shared with you appear here.
            </p>
          ) : (
            <ul className="grid max-h-80 gap-0.5 overflow-y-auto">
              {notifications.map((notification) => (
                <li key={notification.id}>
                  <Link
                    href={`/documents/${notification.document_id}`}
                    // Not prefetched, for the reason every link in this app is
                    // not: a prefetched document page is served from the Router
                    // Cache and can be older than the thing being announced.
                    prefetch={false}
                    role="menuitem"
                    onClick={() => void openAndRead(notification)}
                    className={cn(
                      "block rounded-md px-2 py-1.5 text-sm hover:bg-neutral-50",
                      notification.read_at === null ? "text-neutral-900" : "text-neutral-500",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      {notification.read_at === null && (
                        <span
                          aria-hidden="true"
                          className="size-1.5 shrink-0 rounded-full bg-carmine-500"
                        />
                      )}
                      <span className="min-w-0 flex-1 truncate">{sentence(notification)}</span>
                    </span>
                    <span className="block truncate pl-0 text-xs text-neutral-400">
                      {notification.document_title}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
