"use server";

import { createClient } from "@/lib/supabase/server";
import { generateSlug } from "@/lib/utils";
import { redirect } from "next/navigation";

export async function createArticle(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Unauthorized");

  const title = formData.get("title") as string;
  const sourceUrl = (formData.get("source_url") as string) || null;
  const author = (formData.get("author") as string) || null;
  const content = formData.get("content") as string;
  const contentMarkdown = (formData.get("content_markdown") as string) || null;

  if (!title || !content) throw new Error("Title and content are required");

  const slug = generateSlug(title);

  const { error } = await supabase.from("articles").insert({
    slug,
    title,
    source_url: sourceUrl,
    author,
    content,
    content_markdown: contentMarkdown,
    user_id: user.id,
  });

  if (error) throw new Error(error.message);

  redirect(`/a/${slug}`);
}

export async function updateArticle(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Unauthorized");

  const id = formData.get("id") as string;
  const title = formData.get("title") as string;
  const sourceUrl = (formData.get("source_url") as string) || null;
  const author = (formData.get("author") as string) || null;
  const content = formData.get("content") as string;
  const contentMarkdown = (formData.get("content_markdown") as string) || null;
  const slug = formData.get("slug") as string;

  if (!title || !content) throw new Error("Title and content are required");

  const { error } = await supabase
    .from("articles")
    .update({
      title,
      source_url: sourceUrl,
      author,
      content,
      content_markdown: contentMarkdown,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);

  redirect(`/a/${slug}`);
}

export async function deleteArticle(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Unauthorized");

  const { error } = await supabase
    .from("articles")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);

  redirect("/");
}

export async function inferAuthor(url: string): Promise<string | null> {
  // Extract author from URL patterns before attempting a fetch
  const fromUrl = inferAuthorFromUrl(url);
  if (fromUrl) return fromUrl;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Snipclaw/1.0" },
      signal: AbortSignal.timeout(5000),
    });
    const html = await res.text();

    // Try og:author
    const ogAuthor = html.match(
      /<meta[^>]*property=["']og:author["'][^>]*content=["']([^"']+)["']/i
    )?.[1];
    if (ogAuthor) return ogAuthor;

    // Try twitter:creator
    const twitterCreator = html.match(
      /<meta[^>]*name=["']twitter:creator["'][^>]*content=["']([^"']+)["']/i
    )?.[1];
    if (twitterCreator) return twitterCreator;

    // Try author meta tag
    const authorMeta = html.match(
      /<meta[^>]*name=["']author["'][^>]*content=["']([^"']+)["']/i
    )?.[1];
    if (authorMeta) return authorMeta;

    // Try article:author
    const articleAuthor = html.match(
      /<meta[^>]*property=["']article:author["'][^>]*content=["']([^"']+)["']/i
    )?.[1];
    if (articleAuthor) return articleAuthor;

    return null;
  } catch {
    return null;
  }
}

function inferAuthorFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace("www.", "");
    const path = u.pathname.split("/").filter(Boolean);

    // Twitter / X: x.com/{user}/status/... or twitter.com/{user}/status/...
    if ((host === "x.com" || host === "twitter.com") && path.length >= 1) {
      return `@${path[0]} on X`;
    }

    // Substack: {author}.substack.com
    if (host.endsWith(".substack.com")) {
      return host.replace(".substack.com", "");
    }

    // Medium: medium.com/@{user}/...
    if (host === "medium.com" && path[0]?.startsWith("@")) {
      return path[0];
    }

    // GitHub: github.com/{user}/...
    if (host === "github.com" && path.length >= 1) {
      return path[0];
    }

    // YouTube: youtube.com/@{channel}
    if ((host === "youtube.com" || host === "m.youtube.com") && path[0]?.startsWith("@")) {
      return path[0];
    }

    return null;
  } catch {
    return null;
  }
}
