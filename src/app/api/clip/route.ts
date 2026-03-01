import { createServerClient } from "@supabase/ssr";
import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { generateSlug } from "@/lib/utils";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

// Map content-type to file extension
function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/svg+xml": "svg",
    "image/avif": "avif",
  };
  return map[mime] || "jpg";
}

/**
 * Download images from HTML content, upload them to Supabase Storage,
 * and rewrite the src URLs to permanent Supabase public URLs.
 */
async function rewriteImages(
  html: string,
  slug: string,
  supabase: ReturnType<typeof createServerClient>
): Promise<string> {
  // Match all img src attributes
  const imgRegex = /<img\s+[^>]*src=["']([^"']+)["']/gi;
  const matches: RegExpExecArray[] = [];
  let match: RegExpExecArray | null;
  while ((match = imgRegex.exec(html)) !== null) {
    matches.push(match);
  }

  if (matches.length === 0) return html;

  // Deduplicate URLs
  const uniqueUrls = Array.from(new Set(matches.map((m) => m[1])));

  // Filter to only http(s) URLs (skip data: URIs, relative paths, etc.)
  const httpUrls = uniqueUrls.filter((u) => u.startsWith("http"));

  if (httpUrls.length === 0) return html;

  // Download and upload each image (concurrently, max 5 at a time)
  const urlMap = new Map<string, string>();

  const uploadImage = async (originalUrl: string) => {
    try {
      const res = await fetch(originalUrl, {
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) return;

      const contentType = res.headers.get("content-type") || "image/jpeg";
      // Skip non-image responses
      if (!contentType.startsWith("image/")) return;

      const buffer = Buffer.from(await res.arrayBuffer());
      // Skip tiny images (likely tracking pixels)
      if (buffer.length < 100) return;

      const hash = createHash("sha256").update(buffer).digest("hex").slice(0, 16);
      const ext = extFromMime(contentType.split(";")[0].trim());
      const storagePath = `${slug}/${hash}.${ext}`;

      const { error } = await supabase.storage
        .from("article-images")
        .upload(storagePath, buffer, {
          contentType: contentType.split(";")[0].trim(),
          upsert: true,
        });

      if (error) {
        console.error(`Failed to upload image ${originalUrl}:`, error.message);
        return;
      }

      const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/article-images/${storagePath}`;
      urlMap.set(originalUrl, publicUrl);
    } catch (err) {
      // Silently skip failed downloads — keep original URL
      console.error(`Failed to download image ${originalUrl}:`, err);
    }
  };

  // Process in batches of 5
  for (let i = 0; i < httpUrls.length; i += 5) {
    const batch = httpUrls.slice(i, i + 5);
    await Promise.all(batch.map(uploadImage));
  }

  // Replace all original URLs with Supabase URLs
  let rewritten = html;
  urlMap.forEach((replacement, original) => {
    rewritten = rewritten.split(original).join(replacement);
  });

  return rewritten;
}

export async function OPTIONS() {
  return NextResponse.json(null, { headers: corsHeaders });
}

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Missing auth token" },
      { status: 401, headers: corsHeaders }
    );
  }

  const token = authHeader.slice(7);

  const supabase = createServerClient(
    SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: { getAll: () => [], setAll: () => {} },
      global: {
        headers: { Authorization: `Bearer ${token}` },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser(token);

  if (!user) {
    return NextResponse.json(
      { error: "Invalid token" },
      { status: 401, headers: corsHeaders }
    );
  }

  const body = await request.json();
  const { title, content, source_url, author, content_markdown } = body;

  if (!title || !content) {
    return NextResponse.json(
      { error: "Title and content are required" },
      { status: 400, headers: corsHeaders }
    );
  }

  const slug = generateSlug(title);

  // Download images and rewrite URLs to Supabase Storage
  const rewrittenContent = await rewriteImages(content, slug, supabase);

  const { data, error } = await supabase
    .from("articles")
    .insert({
      slug,
      title,
      source_url: source_url || null,
      author: author || null,
      content: rewrittenContent,
      content_markdown: content_markdown || null,
      user_id: user.id,
    })
    .select("slug")
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: corsHeaders }
    );
  }

  return NextResponse.json(
    {
      slug: data.slug,
      url: `${new URL(request.url).origin}/a/${data.slug}`,
    },
    { headers: corsHeaders }
  );
}
