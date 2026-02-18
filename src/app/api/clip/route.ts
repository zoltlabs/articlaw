import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { generateSlug } from "@/lib/utils";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

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
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
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

  const { data, error } = await supabase
    .from("articles")
    .insert({
      slug,
      title,
      source_url: source_url || null,
      author: author || null,
      content,
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
