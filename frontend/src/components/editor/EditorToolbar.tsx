"use client";

import type { Editor } from "@tiptap/react";

import { LinkDialog } from "@/components/editor/LinkDialog";
import { cn } from "@/lib/utils";

/** One formatting control.
 *
 * `onMouseDown` is prevented so pressing the button does not move focus out of
 * the editor and collapse the selection being formatted — without it, clicking
 * Bold with text selected bolds nothing.
 *
 * `aria-pressed` rather than a class alone: the active state is information, not
 * decoration, and a screen reader has no other way to learn that the caret sits
 * in bold text.
 */
function ToolbarButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(
        "flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 text-sm transition-colors",
        "hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-carmine-500 focus-visible:outline-none",
        active ? "bg-neutral-100 font-semibold text-carmine-700" : "text-neutral-600",
      )}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span aria-hidden="true" className="mx-1 h-5 w-px bg-neutral-200" />;
}

/** Every type the editor's schema permits, and no more.
 *
 * This list used to stop at the marks the Markdown converter understood, on the
 * reasoning that offering more would export as nothing. The reasoning was sound
 * and the conclusion was wrong: `StarterKit` enables blockquote, code blocks,
 * inline code, strikethrough, rules and hard breaks regardless of what the
 * toolbar shows, reachable by shortcut, by input rule (`> `, ` ``` `, `---`) and
 * by paste. Leaving them out of the toolbar hid them from the person writing,
 * not from the document — and export dropped them in silence.
 *
 * So the rule is now the opposite one: what the schema allows, the toolbar
 * shows and the converter carries. `editor-schema.json` holds that contract and
 * both sides are tested against it.
 */
export function EditorToolbar({ editor }: { editor: Editor }) {
  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="flex flex-wrap items-center gap-1 border-b border-neutral-200 px-2 py-1.5"
    >
      <ToolbarButton
        label="Bold"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        B
      </ToolbarButton>
      <ToolbarButton
        label="Italic"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <span className="italic">I</span>
      </ToolbarButton>
      <ToolbarButton
        label="Underline"
        active={editor.isActive("underline")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <span className="underline">U</span>
      </ToolbarButton>
      <ToolbarButton
        label="Strikethrough"
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <span className="line-through">S</span>
      </ToolbarButton>
      <ToolbarButton
        label="Inline code"
        active={editor.isActive("code")}
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        <span className="font-mono text-xs">&lt;&gt;</span>
      </ToolbarButton>
      <LinkDialog editor={editor} />

      <Divider />

      <ToolbarButton
        label="Heading 1"
        active={editor.isActive("heading", { level: 1 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
      >
        H1
      </ToolbarButton>
      <ToolbarButton
        label="Heading 2"
        active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        H2
      </ToolbarButton>
      <ToolbarButton
        label="Paragraph"
        active={editor.isActive("paragraph")}
        onClick={() => editor.chain().focus().setParagraph().run()}
      >
        ¶
      </ToolbarButton>

      <Divider />

      <ToolbarButton
        label="Quote"
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        &rdquo;
      </ToolbarButton>
      <ToolbarButton
        label="Code block"
        active={editor.isActive("codeBlock")}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
      >
        <span className="font-mono text-xs">{"{ }"}</span>
      </ToolbarButton>
      <ToolbarButton
        // Not a toggle: a rule is inserted at the caret and has no active
        // state, so aria-pressed stays false rather than lying.
        label="Divider"
        active={false}
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
      >
        &mdash;
      </ToolbarButton>

      <Divider />

      <ToolbarButton
        label="Bulleted list"
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        •
      </ToolbarButton>
      <ToolbarButton
        label="Numbered list"
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        1.
      </ToolbarButton>
      <ToolbarButton
        label="Checklist"
        active={editor.isActive("taskList")}
        onClick={() => editor.chain().focus().toggleTaskList().run()}
      >
        ☑
      </ToolbarButton>
    </div>
  );
}
