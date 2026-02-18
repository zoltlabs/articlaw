import Link from "next/link";
import { formatDate, truncate } from "@/lib/utils";

interface Article {
  slug: string;
  title: string;
  author: string | null;
  content: string;
  created_at: string;
}

export default function ArticleCard({ article }: { article: Article }) {
  return (
    <Link href={`/a/${article.slug}`} className="block group">
      <article className="rounded-lg border border-neutral-200 p-5 transition-colors hover:border-neutral-400 dark:border-neutral-800 dark:hover:border-neutral-600">
        <h2 className="font-serif text-lg font-semibold text-neutral-900 group-hover:text-neutral-600 dark:text-neutral-100 dark:group-hover:text-neutral-300">
          {article.title}
        </h2>
        <div className="mt-1 flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
          {article.author && (
            <Link
              href={`/author/${encodeURIComponent(article.author)}`}
              className="hover:text-neutral-900 hover:underline dark:hover:text-neutral-200"
              onClick={(e) => e.stopPropagation()}
            >
              {article.author}
            </Link>
          )}
          {article.author && <span>&middot;</span>}
          <time>{formatDate(article.created_at)}</time>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
          {truncate(article.content, 150)}
        </p>
      </article>
    </Link>
  );
}
