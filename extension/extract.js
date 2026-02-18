// Content script injected into the active tab to extract article data.
// Returns { title, author, source_url, content } to the popup.

(() => {
  const url = location.href;
  const host = location.hostname.replace("www.", "");

  // ── Helpers ──────────────────────────────────────────────
  function meta(attr, value) {
    const el =
      document.querySelector(`meta[property="${value}"]`) ||
      document.querySelector(`meta[name="${value}"]`);
    return el?.getAttribute("content") || "";
  }

  function cleanText(el) {
    if (!el) return "";
    const clone = el.cloneNode(true);
    clone.querySelectorAll("script, style, nav, footer, header").forEach((e) => e.remove());
    return clone.innerHTML;
  }

  // ── X / Twitter ──────────────────────────────────────────
  function extractX() {
    const pathParts = location.pathname.split("/").filter(Boolean);
    const handle = pathParts[0] || "";
    const author = `@${handle} on X`;

    // Grab the main tweet and any thread replies by the same user
    const tweetArticles = document.querySelectorAll('article[data-testid="tweet"]');
    const tweets = [];

    for (const article of tweetArticles) {
      // Check if this tweet is from the thread author
      const userLinks = article.querySelectorAll('a[role="link"]');
      let isAuthor = false;
      for (const link of userLinks) {
        if (link.href?.includes(`/${handle}`)) {
          isAuthor = true;
          break;
        }
      }
      if (!isAuthor && tweets.length > 0) continue;

      const tweetText = article.querySelector('[data-testid="tweetText"]');
      if (tweetText) {
        tweets.push(tweetText.innerHTML);
      }
    }

    // Get the title from the first tweet text
    const firstTweetText = tweets[0]
      ? new DOMParser().parseFromString(tweets[0], "text/html").body.textContent?.slice(0, 80) || ""
      : "";
    const title = firstTweetText
      ? `${firstTweetText}${firstTweetText.length >= 80 ? "..." : ""}`
      : `Thread by @${handle}`;

    const content = tweets.map((t) => `<div class="tweet">${t}</div>`).join("<hr>");

    return { title, author, source_url: url, content };
  }

  // ── Substack ─────────────────────────────────────────────
  function extractSubstack() {
    const title =
      document.querySelector("h1.post-title")?.textContent?.trim() ||
      meta("property", "og:title") ||
      document.title;
    const author =
      document.querySelector(".author-name")?.textContent?.trim() ||
      host.replace(".substack.com", "");
    const body = document.querySelector(".body.markup") || document.querySelector(".post-content");
    return { title, author, source_url: url, content: cleanText(body) };
  }

  // ── Medium ───────────────────────────────────────────────
  function extractMedium() {
    const title = document.querySelector("h1")?.textContent?.trim() || document.title;
    const author =
      document.querySelector('a[data-testid="authorName"]')?.textContent?.trim() ||
      meta("name", "author") ||
      "";
    const body = document.querySelector("article") || document.querySelector(".postArticle-content");
    return { title, author, source_url: url, content: cleanText(body) };
  }

  // ── Generic article ──────────────────────────────────────
  function extractGeneric() {
    const title =
      meta("property", "og:title") ||
      document.querySelector("h1")?.textContent?.trim() ||
      document.title;
    const author =
      meta("name", "author") ||
      meta("property", "og:author") ||
      meta("property", "article:author") ||
      meta("name", "twitter:creator") ||
      "";

    // Try common article containers
    const selectors = [
      "article",
      '[role="article"]',
      ".post-content",
      ".article-content",
      ".entry-content",
      ".story-body",
      "main",
    ];

    let body = null;
    for (const sel of selectors) {
      body = document.querySelector(sel);
      if (body) break;
    }

    // Fallback: grab the largest text block
    if (!body) {
      const paragraphs = document.querySelectorAll("p");
      if (paragraphs.length > 0) {
        const wrapper = document.createElement("div");
        paragraphs.forEach((p) => wrapper.appendChild(p.cloneNode(true)));
        return { title, author, source_url: url, content: wrapper.innerHTML };
      }
    }

    return { title, author, source_url: url, content: cleanText(body) };
  }

  // ── Router ───────────────────────────────────────────────
  let result;
  if (host === "x.com" || host === "twitter.com") {
    result = extractX();
  } else if (host.endsWith(".substack.com")) {
    result = extractSubstack();
  } else if (host === "medium.com" || document.querySelector('meta[property="al:android:app_name"][content="Medium"]')) {
    result = extractMedium();
  } else {
    result = extractGeneric();
  }

  return result;
})();
