import { createClient } from "@/lib/supabase/server";
import ArticleView from "@/components/article-view";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: article } = await supabase
    .from("articles")
    .select("title, author")
    .eq("slug", slug)
    .single();

  if (!article) return { title: "Article Not Found" };

  return {
    title: `${article.title} - Articlaw`,
    description: article.author
      ? `By ${article.author} on Articlaw`
      : "Read on Articlaw",
  };
}

export default async function ArticlePage({
  params,
}: {
  params: Params;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: article } = await supabase
    .from("articles")
    .select("id, slug, title, author, source_url, content, created_at, user_id")
    .eq("slug", slug)
    .single();

  if (!article) notFound();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isOwner = user?.id === article.user_id;

  return <ArticleView article={article} isOwner={isOwner} />;
}
