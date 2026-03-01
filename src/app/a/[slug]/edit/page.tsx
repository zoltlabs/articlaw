"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { updateArticle, deleteArticle } from "@/lib/actions";
import Editor from "@/components/editor";

interface Article {
  id: string;
  slug: string;
  title: string;
  author: string | null;
  source_url: string | null;
  content: string;
  content_markdown: string | null;
  user_id: string;
}

export default function EditArticlePage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const [article, setArticle] = useState<Article | null>(null);
  const [title, setTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [author, setAuthor] = useState("");
  const [content, setContent] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data } = await supabase
        .from("articles")
        .select("*")
        .eq("slug", slug)
        .single();

      if (!data || data.user_id !== user?.id) {
        router.push("/");
        return;
      }

      setArticle(data);
      setTitle(data.title);
      setSourceUrl(data.source_url || "");
      setAuthor(data.author || "");
      setContent(data.content);
      setMarkdown(data.content_markdown || "");
      setLoading(false);
    };
    load();
  }, [slug, router]);

  const handleContentChange = useCallback((html: string, md: string) => {
    setContent(html);
    setMarkdown(md);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!article || !title.trim() || !content.trim()) return;
    setSubmitting(true);

    const formData = new FormData();
    formData.set("id", article.id);
    formData.set("slug", article.slug);
    formData.set("title", title);
    formData.set("source_url", sourceUrl);
    formData.set("author", author);
    formData.set("content", content);
    formData.set("content_markdown", markdown);

    await updateArticle(formData);
  };

  const handleDelete = async () => {
    if (!article) return;
    if (!confirm("Are you sure you want to delete this snip?")) return;
    setDeleting(true);
    await deleteArticle(article.id);
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <p className="text-neutral-500">Loading...</p>
      </div>
    );
  }

  if (!article) return null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-serif text-2xl font-bold text-neutral-900 dark:text-neutral-100">
          Edit Snip
        </h1>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
        >
          {deleting ? "Deleting..." : "Delete"}
        </button>
      </div>

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
            className="w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none dark:border-neutral-700 dark:focus:border-neutral-500"
          />
        </div>

        <div>
          <label
            htmlFor="author"
            className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300"
          >
            Author
          </label>
          <input
            id="author"
            type="text"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            className="w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none dark:border-neutral-700 dark:focus:border-neutral-500"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Content *
          </label>
          <Editor
            initialContent={article.content}
            initialMarkdown={article.content_markdown || undefined}
            onContentChange={handleContentChange}
          />
        </div>

        <button
          type="submit"
          disabled={submitting || !title.trim() || !content.trim()}
          className="rounded-md bg-neutral-900 px-5 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
        >
          {submitting ? "Saving..." : "Save Changes"}
        </button>
      </form>
    </div>
  );
}
