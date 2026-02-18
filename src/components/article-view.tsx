"use client";

import { formatDate } from "@/lib/utils";
import { useState } from "react";

interface Article {
  id: string;
  slug: string;
  title: string;
  author: string | null;
  source_url: string | null;
  content: string;
  created_at: string;
  user_id: string;
}

export default function ArticleView({
  article,
  isOwner,
}: {
  article: Article;
  isOwner: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const url = window.location.href;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <article className="mx-auto max-w-2xl px-4 py-8">
      <header className="mb-8">
        <h1 className="font-serif text-3xl font-bold leading-tight text-neutral-900 dark:text-neutral-100 sm:text-4xl">
          {article.title}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-neutral-500 dark:text-neutral-400">
          {article.author && (
            <a
              href={`/author/${encodeURIComponent(article.author)}`}
              className="font-medium text-neutral-700 hover:text-neutral-900 hover:underline dark:text-neutral-300 dark:hover:text-neutral-100"
            >
              {article.author}
            </a>
          )}
          <time>{formatDate(article.created_at)}</time>
          {article.source_url && (
            <a
              href={article.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline dark:text-blue-400"
            >
              Source
            </a>
          )}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={handleShare}
            className="rounded-md border border-neutral-300 px-3 py-1 text-sm text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
          >
            {copied ? "Copied!" : "Share"}
          </button>
          {isOwner && (
            <a
              href={`/a/${article.slug}/edit`}
              className="rounded-md border border-neutral-300 px-3 py-1 text-sm text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
            >
              Edit
            </a>
          )}
        </div>
      </header>
      <div
        className="prose prose-neutral dark:prose-invert max-w-none prose-headings:font-serif prose-p:leading-relaxed prose-a:text-blue-600 dark:prose-a:text-blue-400"
        dangerouslySetInnerHTML={{ __html: article.content }}
      />
    </article>
  );
}
