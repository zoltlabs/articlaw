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

interface TweetMeta {
  display_name: string;
  handle: string;
  avatar_url: string;
  timestamp: string;
  images: string[];
  text_html: string;
}

function formatTweetTimestamp(iso: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function buildTweetCard(meta: TweetMeta, sourceUrl?: string): string {
  const avatarHtml = meta.avatar_url
    ? `<img src="${meta.avatar_url}" style="width:48px;height:48px;border-radius:50%;object-fit:cover;" alt="${meta.display_name}" />`
    : `<div style="width:48px;height:48px;border-radius:50%;background:#1d9bf0;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:20px;">${(meta.display_name || "?")[0]}</div>`;

  const xLogoSvg = `<svg viewBox="0 0 24 24" width="20" height="20" fill="#536471" style="margin-left:auto;flex-shrink:0;"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`;

  let imagesHtml = "";
  if (meta.images && meta.images.length > 0) {
    const imgTags = meta.images
      .map(
        (src) =>
          `<img src="${src}" style="width:100%;border-radius:12px;margin-top:12px;max-height:500px;object-fit:cover;" alt="Tweet image" />`
      )
      .join("");
    imagesHtml = imgTags;
  }

  const timestampHtml = meta.timestamp
    ? `<div style="font-size:14px;color:#536471;margin-top:12px;padding-top:12px;border-top:1px solid #eff3f4;">${formatTweetTimestamp(meta.timestamp)}</div>`
    : "";

  const linkStart = sourceUrl ? `<a href="${sourceUrl}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;color:inherit;">` : "";
  const linkEnd = sourceUrl ? `</a>` : "";

  return `${linkStart}<div style="max-width:550px;margin:16px auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;border:1px solid #cfd9de;border-radius:16px;padding:16px;background:#fff;">
  <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
    ${avatarHtml}
    <div style="flex:1;min-width:0;">
      <div style="font-weight:700;font-size:15px;color:#0f1419;line-height:1.2;">${meta.display_name || meta.handle}</div>
      <div style="font-size:14px;color:#536471;">@${meta.handle}</div>
    </div>
    ${xLogoSvg}
  </div>
  <div style="font-size:17px;line-height:1.5;color:#0f1419;word-wrap:break-word;">${meta.text_html || ""}</div>
  ${imagesHtml}
  ${timestampHtml}
</div>${linkEnd}`;
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
  const { title, content, source_url, author, content_markdown, tweet_meta } =
    body;

  if (!title || !content) {
    return NextResponse.json(
      { error: "Title and content are required" },
      { status: 400, headers: corsHeaders }
    );
  }

  const slug = generateSlug(title);

  // Build styled tweet card HTML when tweet_meta is available
  let finalContent = content;
  if (tweet_meta && Array.isArray(tweet_meta) && tweet_meta.length > 0) {
    finalContent = tweet_meta.map((meta: TweetMeta) => buildTweetCard(meta, source_url)).join("");
  }

  // Download images and rewrite URLs to Supabase Storage
  const rewrittenContent = await rewriteImages(finalContent, slug, supabase);

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
