import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { MentionField, activeQuery, mentionedIn, type Mentionable } from "./MentionField";

const PEOPLE: Mentionable[] = [
  { id: "u1", display_name: "Ada Lovelace" },
  { id: "u2", display_name: "Alan Turing" },
  { id: "u3", display_name: "Grace Hopper" },
];

describe("mentionedIn", () => {
  it("finds the people a comment still names", () => {
    expect(mentionedIn("Thanks @Ada Lovelace, over to you", PEOPLE)).toEqual(["u1"]);
  });

  it("forgets a mention whose text was deleted", () => {
    // The reason this is derived from the body at submit time rather than
    // accumulated as people are picked. Otherwise Ada is told about a comment
    // that does not mention her, and the sender cannot take it back.
    expect(mentionedIn("Thanks, over to you", PEOPLE)).toEqual([]);
  });

  it("finds several", () => {
    expect(mentionedIn("@Ada Lovelace and @Alan Turing", PEOPLE)).toEqual(["u1", "u2"]);
  });

  it("does not match a name without the @", () => {
    expect(mentionedIn("Ada Lovelace wrote this", PEOPLE)).toEqual([]);
  });
});

describe("activeQuery", () => {
  it("is what has been typed since the @", () => {
    expect(activeQuery("Thanks @Ad", 10)).toBe("Ad");
  });

  it("is empty right after an @", () => {
    // Empty, not null: the picker should open showing everyone.
    expect(activeQuery("Thanks @", 8)).toBe("");
  });

  it("is null when there is no @ behind the caret", () => {
    expect(activeQuery("Thanks", 6)).toBeNull();
  });

  it("ignores an @ inside a word, which is an email address", () => {
    expect(activeQuery("write to ada@example.com", 24)).toBeNull();
  });

  it("ends at a newline", () => {
    expect(activeQuery("@Ada\nnext line", 14)).toBeNull();
  });

  it("uses the @ nearest the caret", () => {
    expect(activeQuery("@Ada Lovelace said, @Al", 23)).toBe("Al");
  });
});

describe("MentionField", () => {
  function field(people = PEOPLE) {
    const onChange = vi.fn();
    render(
      <MentionField value="" onChange={onChange} people={people} label="Write a comment" />,
    );
    return onChange;
  }

  it("offers nobody until an @ is typed", async () => {
    field();

    await userEvent.type(screen.getByLabelText(/write a comment/i), "Hello");

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("shows no menu when there is nobody to mention", async () => {
    // An empty picker is a control that does nothing while looking like it
    // should.
    field([]);

    await userEvent.type(screen.getByLabelText(/write a comment/i), "@");

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("declares the listbox to assistive technology", async () => {
    // The list is driven from the textarea, so the relationship has to be
    // stated or a screen reader hears nothing open.
    render(
      <MentionField value="@" onChange={vi.fn()} people={PEOPLE} label="Write a comment" />,
    );
    const box = screen.getByLabelText(/write a comment/i);
    await userEvent.click(box);
    await userEvent.type(box, "A");

    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(box).toHaveAttribute("aria-expanded", "true");
    expect(box).toHaveAttribute("aria-controls", "mention-options");
  });
});
