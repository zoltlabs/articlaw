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

    // ── Check for Twitter Article (long-form) first ──
    const articleView = document.querySelector('[data-testid="twitterArticleReadView"]');
    if (articleView) {
      const articleTitle =
        articleView.querySelector('[data-testid="twitter-article-title"]')?.textContent?.trim() || "";
      const articleBody = articleView.querySelector('[data-testid="twitterArticleRichTextView"]');
      let articleContent = "";
      if (articleBody) {
        // Extract text blocks from DraftJS editor, preserving bold and paragraphs
        const blocks = articleBody.querySelectorAll('[data-block="true"]');
        const parts = [];
        for (const block of blocks) {
          // Separators become <hr>
          if (block.querySelector('[role="separator"]')) {
            parts.push("<hr>");
            continue;
          }
          const bold = block.querySelector('span[style*="font-weight: bold"]');
          const text = block.textContent?.trim();
          if (!text) continue;
          if (bold) {
            parts.push(`<h3>${text}</h3>`);
          } else {
            parts.push(`<p>${text}</p>`);
          }
        }
        articleContent = parts.join("\n");
      }

      let title = articleTitle;
      if (!title) {
        title = document.title
          .replace(/\s*\/\s*X\s*$/, "")
          .replace(/^.*?\bon X:\s*/, "")
          .replace(/^"|"$/g, "")
          .trim();
      }

      return { title, author, source_url: url, content: articleContent };
    }

    // ── Regular tweet / thread ──
    const tweetArticles = document.querySelectorAll('article[data-testid="tweet"]');
    const tweets = [];

    for (const article of tweetArticles) {
      const userLinks = article.querySelectorAll('a[role="link"]');
      let isAuthor = false;
      for (const link of userLinks) {
        if (link.href?.includes(`/${handle}`)) {
          isAuthor = true;
          break;
        }
      }
      if (!isAuthor && tweets.length > 0) continue;

      const tweetText =
        article.querySelector('[data-testid="tweetText"]') ||
        article.querySelector('div[lang]');
      if (tweetText) {
        tweets.push(tweetText.innerHTML);
      }
    }

    const firstTweetText = tweets[0]
      ? new DOMParser().parseFromString(tweets[0], "text/html").body.textContent?.slice(0, 80) || ""
      : "";
    let title = firstTweetText
      ? `${firstTweetText}${firstTweetText.length >= 80 ? "..." : ""}`
      : "";
    let content = tweets.map((t) => `<div class="tweet">${t}</div>`).join("<hr>");

    // Fall back to meta tags / document.title when DOM scraping yields nothing
    if (!title) {
      const ogTitle = meta("property", "og:title");
      if (ogTitle) {
        title = ogTitle;
      } else if (document.title) {
        title = document.title;
      } else {
        title = `Thread by @${handle}`;
      }
    }

    // Clean X/Twitter title cruft
    title = title
      .replace(/\s*\/\s*X\s*$/, "")
      .replace(/^.*?\bon X:\s*/, "")
      .replace(/^"|"$/g, "")
      .trim();

    if (!content) {
      const ogDesc = meta("property", "og:description");
      if (ogDesc) {
        content = `<p>${ogDesc}</p>`;
      }
    }

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
