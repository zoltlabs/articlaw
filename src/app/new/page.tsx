"use client";

import { useState, useCallback } from "react";
import { createArticle, inferAuthor } from "@/lib/actions";
import Editor from "@/components/editor";

export default function NewArticlePage() {
  const [title, setTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [author, setAuthor] = useState("");
  const [content, setContent] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [inferring, setInferring] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSourceBlur = async () => {
    if (!sourceUrl || author) return;
    setInferring(true);
    try {
      const result = await inferAuthor(sourceUrl);
      if (result) setAuthor(result);
    } catch {
      // ignore inference errors
    }
    setInferring(false);
  };

  const handleContentChange = useCallback((html: string, md: string) => {
    setContent(html);
    setMarkdown(md);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    setSubmitting(true);

    const formData = new FormData();
    formData.set("title", title);
    formData.set("source_url", sourceUrl);
    formData.set("author", author);
    formData.set("content", content);
    formData.set("content_markdown", markdown);

    await createArticle(formData);
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 font-serif text-2xl font-bold text-neutral-900 dark:text-neutral-100">
        New Snip
      </h1>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label
            htmlFor="title"
            className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300"
          >
            Title *
          </label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            placeholder="Snip title"
            className="w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none dark:border-neutral-700 dark:focus:border-neutral-500"
          />
        </div>

        <div>
          <label
            htmlFor="source_url"
            className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300"
          >
            Source URL
          </label>
          <input
            id="source_url"
            type="url"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            onBlur={handleSourceBlur}
            placeholder="https://..."
            className="w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none dark:border-neutral-700 dark:focus:border-neutral-500"
          />
        </div>

        <div>
          <label
            htmlFor="author"
            className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300"
          >
            Author {inferring && <span className="text-neutral-400">(detecting...)</span>}
          </label>
          <input
            id="author"
            type="text"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="Author name"
            className="w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none dark:border-neutral-700 dark:focus:border-neutral-500"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Content *
          </label>
          <Editor onContentChange={handleContentChange} />
        </div>

        <button
          type="submit"
          disabled={submitting || !title.trim() || !content.trim()}
          className="rounded-md bg-neutral-900 px-5 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
        >
          {submitting ? "Publishing..." : "Publish Snip"}
        </button>
      </form>
    </div>
  );
}
