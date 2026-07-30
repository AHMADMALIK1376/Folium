import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ApiErrorMessage } from "./ApiErrorMessage";
import { ApiError } from "@/lib/api/errors";

describe("ApiErrorMessage", () => {
  it("keeps an outage distinct from an expired session", () => {
    // 2A deliberately separates these. Collapsing them would make an outage
    // look like every user's credentials failing at once.
    const { unmount } = render(<ApiErrorMessage error={new ApiError(503, "nope")} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/temporarily unavailable/i);
    unmount();

    render(<ApiErrorMessage error={new ApiError(401, "nope")} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/session has expired/i);
  });

  it("offers a sign-in link for a 401, not a retry", () => {
    render(<ApiErrorMessage error={new ApiError(401, "nope")} />);
    expect(screen.getByRole("link", { name: /sign in again/i })).toHaveAttribute(
      "href",
      "/login",
    );
  });

  it("uses the caller's fallback wording", () => {
    render(<ApiErrorMessage error={new Error("boom")} fallback="Could not save." />);
    expect(screen.getByRole("alert")).toHaveTextContent("Could not save.");
  });

  it("shows the backend's detail for a status the caller opts in to", () => {
    // A 422 from sharing says "No user with that email" — specific, actionable,
    // and better than anything this component could write.
    render(
      <ApiErrorMessage
        error={new ApiError(422, "No user with that email")}
        detailStatuses={[422]}
        fallback="Could not share."
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("No user with that email");
  });

  it("ignores the detail of a status the caller did not opt in to", () => {
    // A detail is only safe to surface where the backend writes it for a person.
    // Elsewhere it may be an internal message.
    render(
      <ApiErrorMessage
        error={new ApiError(500, "psycopg2.OperationalError: connection refused")}
        detailStatuses={[422]}
        fallback="Could not share."
      />,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Could not share.");
    expect(alert).not.toHaveTextContent(/psycopg2/);
  });

  it("uses the caller's 404 wording when given one", () => {
    render(
      <ApiErrorMessage
        error={new ApiError(404, "Document not found")}
        notFoundMessage="This document is no longer available."
        fallback="Could not share."
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "This document is no longer available.",
    );
  });

  it("still prefers 401 over a caller's 404 wording", () => {
    render(
      <ApiErrorMessage
        error={new ApiError(401, "nope")}
        notFoundMessage="Gone."
        detailStatuses={[401]}
      />,
    );
    // An expired session needs the sign-in link whatever else the caller asked
    // for; retrying a 401 fails forever.
    expect(screen.getByRole("alert")).toHaveTextContent(/session has expired/i);
  });
});
