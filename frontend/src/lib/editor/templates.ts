import type { TipTapDoc } from "@/lib/api/types";

/** The templates everyone has, defined as content rather than as rows.
 *
 * They are the same TipTap JSON any document is, they are identical for every
 * account, and they never change without a deploy — so a row per user per
 * template would be a migration and a seeding job to say what a constant
 * already says. Creating from one is an ordinary document create.
 *
 * Templates someone writes themselves are real documents with a flag, and come
 * from the API. These sit alongside them in the same picker.
 */

export interface BuiltInTemplate {
  /** Stable across deploys: it ends up in a test and in an analytics event
   *  before anyone thinks to make it stable deliberately. */
  key: string;
  title: string;
  description: string;
  content: TipTapDoc;
}

function heading(level: number, text: string) {
  return { type: "heading", attrs: { level }, content: [{ type: "text", text }] };
}

function paragraph(text = "") {
  return text
    ? { type: "paragraph", content: [{ type: "text", text }] }
    : { type: "paragraph" };
}

function bullets(items: string[]) {
  return {
    type: "bulletList",
    content: items.map((item) => ({
      type: "listItem",
      content: [paragraph(item)],
    })),
  };
}

function tasks(items: string[]) {
  return {
    type: "taskList",
    content: items.map((item) => ({
      type: "taskItem",
      attrs: { checked: false },
      content: [paragraph(item)],
    })),
  };
}

export const BUILT_IN_TEMPLATES: BuiltInTemplate[] = [
  {
    key: "meeting-notes",
    title: "Meeting notes",
    description: "Attendees, discussion, decisions and actions",
    content: {
      type: "doc",
      content: [
        heading(1, "Meeting notes"),
        paragraph("Date: "),
        heading(2, "Attendees"),
        bullets([""]),
        heading(2, "Discussion"),
        paragraph(),
        heading(2, "Decisions"),
        bullets([""]),
        heading(2, "Actions"),
        // A checklist rather than bullets: an action nobody can tick off is a
        // note about an action.
        tasks([""]),
      ],
    },
  },
  {
    key: "weekly-update",
    title: "Weekly update",
    description: "Shipped, in progress, blocked, next",
    content: {
      type: "doc",
      content: [
        heading(1, "Weekly update"),
        paragraph("Week of "),
        heading(2, "Shipped"),
        bullets([""]),
        heading(2, "In progress"),
        bullets([""]),
        heading(2, "Blocked"),
        bullets([""]),
        heading(2, "Next week"),
        bullets([""]),
      ],
    },
  },
  {
    key: "project-brief",
    title: "Project brief",
    description: "The problem, the shape of a solution, and what is out of scope",
    content: {
      type: "doc",
      content: [
        heading(1, "Project brief"),
        heading(2, "The problem"),
        paragraph(),
        heading(2, "Who has it"),
        paragraph(),
        heading(2, "What we are going to do"),
        paragraph(),
        heading(2, "What we are not going to do"),
        // Its own heading on purpose. A brief without one gets its scope
        // decided later by whoever is most tired.
        paragraph(),
        heading(2, "How we will know it worked"),
        paragraph(),
      ],
    },
  },
];
