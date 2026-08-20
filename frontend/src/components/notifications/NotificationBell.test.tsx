import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/errors";
import type { AppNotification } from "@/lib/api/types";

const listNotifications = vi.fn();
const unreadNotificationCount = vi.fn();
const markNotificationsRead = vi.fn();
vi.mock("@/lib/api/documents", () => ({
  listNotifications: (...a: unknown[]) => listNotifications(...a),
  unreadNotificationCount: (...a: unknown[]) => unreadNotificationCount(...a),
  markNotificationsRead: (...a: unknown[]) => markNotificationsRead(...a),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    prefetch: _prefetch,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
    prefetch?: boolean;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { NotificationBell } = await import("./NotificationBell");

function notification(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    id: "n1",
    kind: "comment",
    document_id: "doc-1",
    document_title: "Quarterly plan",
    comment_id: "c1",
    actor_id: "u2",
    actor_name: "Ada",
    read_at: null,
    created_at: "2026-08-20T10:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  unreadNotificationCount.mockResolvedValue({ count: 0 });
  listNotifications.mockResolvedValue([]);
  markNotificationsRead.mockResolvedValue({ count: 0 });
});

describe("NotificationBell", () => {
  it("shows no badge when there is nothing unread", async () => {
    // A zero badge is noise, and noise next to a control trains people to stop
    // looking at it.
    render(<NotificationBell />);

    await waitFor(() => expect(unreadNotificationCount).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: /^notifications$/i })).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("puts the count in the accessible name, not only in a badge", async () => {
    // "3 unread" is the information. A coloured dot is not readable.
    unreadNotificationCount.mockResolvedValue({ count: 3 });

    render(<NotificationBell />);

    expect(
      await screen.findByRole("button", { name: /notifications, 3 unread/i }),
    ).toBeInTheDocument();
  });

  it("caps the badge rather than letting it grow", async () => {
    unreadNotificationCount.mockResolvedValue({ count: 42 });

    render(<NotificationBell />);

    expect(await screen.findByText("9+")).toBeInTheDocument();
    // The real number is still available to a screen reader.
    expect(screen.getByRole("button", { name: /42 unread/i })).toBeInTheDocument();
  });

  it("reads each notification as a sentence", async () => {
    listNotifications.mockResolvedValue([
      notification({ id: "n1", kind: "mention", actor_name: "Ada" }),
      notification({ id: "n2", kind: "reply", actor_name: "Alan" }),
      notification({ id: "n3", kind: "share", actor_name: "Grace" }),
    ]);

    render(<NotificationBell />);
    await userEvent.click(screen.getByRole("button", { name: /notifications/i }));

    expect(await screen.findByText("Ada mentioned you")).toBeInTheDocument();
    expect(screen.getByText("Alan replied to you")).toBeInTheDocument();
    expect(screen.getByText("Grace shared a document with you")).toBeInTheDocument();
  });

  it("names a deleted actor rather than dropping the notification", async () => {
    // actor_id is ON DELETE SET NULL: "someone commented" is still true after
    // the account is gone.
    listNotifications.mockResolvedValue([notification({ actor_name: null })]);

    render(<NotificationBell />);
    await userEvent.click(screen.getByRole("button", { name: /notifications/i }));

    expect(await screen.findByText("Someone commented")).toBeInTheDocument();
  });

  it("says what will appear rather than showing a blank", async () => {
    render(<NotificationBell />);
    await userEvent.click(screen.getByRole("button", { name: /notifications/i }));

    expect(await screen.findByText(/appear here/i)).toBeInTheDocument();
  });

  it("links each notification to its document", async () => {
    listNotifications.mockResolvedValue([notification({ document_id: "doc-9" })]);

    render(<NotificationBell />);
    await userEvent.click(screen.getByRole("button", { name: /notifications/i }));

    expect(await screen.findByRole("menuitem")).toHaveAttribute("href", "/documents/doc-9");
  });

  it("marks one read on the way to its document", async () => {
    unreadNotificationCount.mockResolvedValue({ count: 1 });
    listNotifications.mockResolvedValue([notification()]);
    markNotificationsRead.mockResolvedValue({ count: 0 });

    render(<NotificationBell />);
    await userEvent.click(screen.getByRole("button", { name: /notifications/i }));
    await userEvent.click(await screen.findByRole("menuitem"));

    expect(markNotificationsRead).toHaveBeenCalledWith(["n1"]);
  });

  it("does not re-mark one that is already read", async () => {
    listNotifications.mockResolvedValue([
      notification({ read_at: "2026-08-20T11:00:00Z" }),
    ]);

    render(<NotificationBell />);
    await userEvent.click(screen.getByRole("button", { name: /notifications/i }));
    await userEvent.click(await screen.findByRole("menuitem"));

    expect(markNotificationsRead).not.toHaveBeenCalled();
  });

  it("marks everything read, and clears the badge with the count it was given", async () => {
    // The server returns what remains, so the badge does not need a second
    // request to catch up with a change it just made.
    unreadNotificationCount.mockResolvedValue({ count: 2 });
    listNotifications.mockResolvedValue([notification(), notification({ id: "n2" })]);
    markNotificationsRead.mockResolvedValue({ count: 0 });

    render(<NotificationBell />);
    await userEvent.click(await screen.findByRole("button", { name: /2 unread/i }));
    await userEvent.click(await screen.findByRole("button", { name: /mark all read/i }));

    expect(markNotificationsRead).toHaveBeenCalledWith();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^notifications$/i })).toBeInTheDocument(),
    );
  });

  it("offers no Mark all read when there is nothing unread", async () => {
    listNotifications.mockResolvedValue([
      notification({ read_at: "2026-08-20T11:00:00Z" }),
    ]);

    render(<NotificationBell />);
    await userEvent.click(screen.getByRole("button", { name: /notifications/i }));

    await screen.findByRole("menuitem");
    expect(screen.queryByRole("button", { name: /mark all read/i })).not.toBeInTheDocument();
  });

  it("stays quiet when polling fails", async () => {
    // A bell that shouts about its own polling failure is worse than one that
    // is briefly out of date.
    unreadNotificationCount.mockRejectedValue(new Error("offline"));

    render(<NotificationBell />);

    await waitFor(() => expect(unreadNotificationCount).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: /^notifications$/i })).toBeInTheDocument();
  });

  it("tries again soon after a failure rather than waiting out the poll", async () => {
    // The bell mounts with the page, which can be before the Supabase client
    // has restored the session — apiFetch then throws "Not signed in" before
    // any request is made. Waiting the full minute left the bell silently
    // saying nothing about something that had already happened, intermittently,
    // which is the worst way for it to be wrong.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    unreadNotificationCount.mockRejectedValueOnce(new Error("not signed in yet"));
    unreadNotificationCount.mockResolvedValue({ count: 2 });

    render(<NotificationBell />);
    await waitFor(() => expect(unreadNotificationCount).toHaveBeenCalledTimes(1));

    await vi.advanceTimersByTimeAsync(3_100);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /2 unread/i })).toBeInTheDocument(),
    );
    vi.useRealTimers();
  });

  it("retries within a second when the session is not ready yet", async () => {
    // ApiError(0) is raised before any request is made, and at mount it means
    // "the Supabase client has not caught up" rather than "not signed in" — the
    // page is already behind the auth guard. Three seconds of a blank bell on
    // every cold load is a worse answer than one.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    unreadNotificationCount.mockRejectedValueOnce(new ApiError(0, "Not signed in"));
    unreadNotificationCount.mockResolvedValue({ count: 1 });

    render(<NotificationBell />);
    await waitFor(() => expect(unreadNotificationCount).toHaveBeenCalledTimes(1));

    await vi.advanceTimersByTimeAsync(1_100);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /1 unread/i })).toBeInTheDocument(),
    );
    vi.useRealTimers();
  });

  it("does not hammer the server once it is working", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    unreadNotificationCount.mockResolvedValue({ count: 0 });

    render(<NotificationBell />);
    await waitFor(() => expect(unreadNotificationCount).toHaveBeenCalledTimes(1));

    // Well past the retry interval, well short of the poll.
    await vi.advanceTimersByTimeAsync(30_000);

    expect(unreadNotificationCount).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("says so when the list itself cannot be loaded", async () => {
    listNotifications.mockRejectedValue(new Error("offline"));

    render(<NotificationBell />);
    await userEvent.click(screen.getByRole("button", { name: /notifications/i }));

    expect(await screen.findByText(/could not load your notifications/i)).toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    render(<NotificationBell />);
    await userEvent.click(screen.getByRole("button", { name: /notifications/i }));
    expect(await screen.findByRole("menu")).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
