import { createClient } from "@/lib/supabase/server";
import ArticleCard from "@/components/article-card";
import type { Metadata } from "next";

type Params = Promise<{ author: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { author } = await params;
  const decoded = decodeURIComponent(author);
  return {
    title: `${decoded} - Snipclaw`,
    description: `Snips by ${decoded} on Snipclaw`,
  };
}

export default async function AuthorPage({
  params,
}: {
  params: Params;
}) {
  const { author } = await params;
  const decoded = decodeURIComponent(author);
  const supabase = await createClient();

  const { data: articles } = await supabase
    .from("articles")
    .select("slug, title, author, content, created_at")
    .eq("author", decoded)
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-1 font-serif text-2xl font-bold text-neutral-900 dark:text-neutral-100">
        {decoded}
      </h1>
      <p className="mb-6 text-sm text-neutral-500 dark:text-neutral-400">
        {articles?.length ?? 0} snip{articles?.length === 1 ? "" : "s"}
      </p>
      {articles && articles.length > 0 ? (
        <div className="space-y-4">
          {articles.map((article) => (
            <ArticleCard key={article.slug} article={article} />
          ))}
        </div>
      ) : (
        <p className="text-neutral-500 dark:text-neutral-400">
          No snips found for this author.
        </p>
      )}
    </div>
  );
}
