import { createClient } from "@/lib/supabase/server";
import ArticleCard from "@/components/article-card";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await createClient();
  const { data: articles } = await supabase
    .from("articles")
    .select("slug, title, author, content, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 font-serif text-2xl font-bold text-neutral-900 dark:text-neutral-100">
        Recent Articles
      </h1>
      {articles && articles.length > 0 ? (
        <div className="space-y-4">
          {articles.map((article) => (
            <ArticleCard key={article.slug} article={article} />
          ))}
        </div>
      ) : (
        <p className="text-neutral-500 dark:text-neutral-400">
          No articles yet. Be the first to{" "}
          <a href="/new" className="text-blue-600 hover:underline dark:text-blue-400">
            create one
          </a>
          .
        </p>
      )}
    </div>
  );
}
