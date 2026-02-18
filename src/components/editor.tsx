"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { useState, useCallback } from "react";

interface EditorProps {
  initialContent?: string;
  initialMarkdown?: string;
  onContentChange: (html: string, markdown: string) => void;
}

export default function Editor({
  initialContent,
  initialMarkdown,
  onContentChange,
}: EditorProps) {
  const [mode, setMode] = useState<"rich" | "markdown">(
    initialMarkdown && !initialContent ? "markdown" : "rich"
  );
  const [markdown, setMarkdown] = useState(initialMarkdown || "");

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: "Write your article..." }),
    ],
    content: initialContent || "",
    onUpdate: ({ editor }) => {
      onContentChange(editor.getHTML(), markdown);
    },
    editorProps: {
      attributes: {
        class:
          "prose prose-neutral dark:prose-invert max-w-none min-h-[300px] focus:outline-none px-4 py-3",
      },
    },
  });

  const handleMarkdownChange = useCallback(
    (value: string) => {
      setMarkdown(value);
      onContentChange(editor?.getHTML() || "", value);
    },
    [editor, onContentChange]
  );

  const toggleMode = useCallback(() => {
    if (mode === "rich") {
      // Switch to markdown - save current HTML
      setMode("markdown");
    } else {
      // Switch to rich text - parse markdown as HTML (basic conversion)
      if (editor && markdown) {
        const html = markdownToBasicHtml(markdown);
        editor.commands.setContent(html);
        onContentChange(html, markdown);
      }
      setMode("rich");
    }
  }, [mode, editor, markdown, onContentChange]);

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <button
          type="button"
          onClick={toggleMode}
          className="rounded border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
        >
          {mode === "rich" ? "Switch to Markdown" : "Switch to Rich Text"}
        </button>
        {mode === "rich" && editor && <ToolbarButtons editor={editor} />}
      </div>

      {mode === "rich" ? (
        <div className="rounded-lg border border-neutral-300 dark:border-neutral-700">
          <EditorContent editor={editor} />
        </div>
      ) : (
        <textarea
          value={markdown}
          onChange={(e) => handleMarkdownChange(e.target.value)}
          placeholder="Write your article in markdown..."
          className="w-full rounded-lg border border-neutral-300 bg-transparent px-4 py-3 font-mono text-sm leading-relaxed focus:border-neutral-500 focus:outline-none dark:border-neutral-700 dark:focus:border-neutral-500"
          rows={16}
        />
      )}
    </div>
  );
}

function ToolbarButtons({
  editor,
}: {
  editor: ReturnType<typeof useEditor> & NonNullable<unknown>;
}) {
  if (!editor) return null;

  const btnClass = (active: boolean) =>
    `rounded px-2 py-1 text-xs font-medium ${
      active
        ? "bg-neutral-200 text-neutral-900 dark:bg-neutral-700 dark:text-neutral-100"
        : "text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
    }`;

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={btnClass(editor.isActive("bold"))}
      >
        B
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={btnClass(editor.isActive("italic"))}
      >
        I
      </button>
      <button
        type="button"
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 2 }).run()
        }
        className={btnClass(editor.isActive("heading", { level: 2 }))}
      >
        H2
      </button>
      <button
        type="button"
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 3 }).run()
        }
        className={btnClass(editor.isActive("heading", { level: 3 }))}
      >
        H3
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={btnClass(editor.isActive("bulletList"))}
      >
        List
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        className={btnClass(editor.isActive("blockquote"))}
      >
        Quote
      </button>
    </div>
  );
}

function markdownToBasicHtml(md: string): string {
  return md
    .split("\n\n")
    .map((block) => {
      const trimmed = block.trim();
      if (trimmed.startsWith("### "))
        return `<h3>${trimmed.slice(4)}</h3>`;
      if (trimmed.startsWith("## "))
        return `<h2>${trimmed.slice(3)}</h2>`;
      if (trimmed.startsWith("# "))
        return `<h1>${trimmed.slice(2)}</h1>`;
      if (trimmed.startsWith("> "))
        return `<blockquote><p>${trimmed.slice(2)}</p></blockquote>`;
      if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
        const items = trimmed
          .split("\n")
          .map((l) => `<li>${l.replace(/^[-*]\s/, "")}</li>`)
          .join("");
        return `<ul>${items}</ul>`;
      }
      if (trimmed) {
        const html = trimmed
          .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
          .replace(/\*(.+?)\*/g, "<em>$1</em>")
          .replace(
            /\[(.+?)\]\((.+?)\)/g,
            '<a href="$2">$1</a>'
          );
        return `<p>${html}</p>`;
      }
      return "";
    })
    .join("");
}
