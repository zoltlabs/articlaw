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
    // Convert standalone <br> sequences into paragraph breaks so newlines aren't lost
    let html = clone.innerHTML;
    html = html.replace(/(<br\s*\/?\s*>[\s\n]*){2,}/gi, "</p><p>");
    return html;
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
        // Build clean HTML from each [data-text="true"] span, preserving bold
        function blockHTML(block) {
          const spans = block.querySelectorAll('[data-text="true"]');
          let out = "";
          for (const span of spans) {
            const text = span.textContent;
            const parent = span.closest("[data-offset-key]");
            const isBold =
              parent?.getAttribute("style")?.includes("font-weight: bold") ||
              parent?.style?.fontWeight === "bold";
            out += isBold ? `<strong>${text}</strong>` : text;
          }
          return out;
        }

        const blocks = articleBody.querySelectorAll('[data-block="true"]');
        const parts = [];
        let inUl = false,
          inOl = false;

        for (const block of blocks) {
          if (block.querySelector('[role="separator"]')) {
            if (inUl) { parts.push("</ul>"); inUl = false; }
            if (inOl) { parts.push("</ol>"); inOl = false; }
            parts.push("<hr>");
            continue;
          }
          // Skip image sections — extract img src if present
          if (block.tagName === "SECTION") {
            const img = block.querySelector("img[src]");
            if (img) parts.push(`<img src="${img.src}" alt="${img.alt || ""}">`);
            continue;
          }

          const content = blockHTML(block);
          if (!content) continue;

          const isH2 =
            block.tagName === "H2" || block.classList.contains("longform-header-two");
          const isUl = block.classList.contains("longform-unordered-list-item");
          const isOl = block.classList.contains("longform-ordered-list-item");

          if (!isUl && inUl) { parts.push("</ul>"); inUl = false; }
          if (!isOl && inOl) { parts.push("</ol>"); inOl = false; }

          if (isH2) {
            parts.push(`<h2>${content}</h2>`);
          } else if (isUl) {
            if (!inUl) { parts.push("<ul>"); inUl = true; }
            parts.push(`<li>${content}</li>`);
          } else if (isOl) {
            if (!inOl) { parts.push("<ol>"); inOl = true; }
            parts.push(`<li>${content}</li>`);
          } else {
            parts.push(`<p>${content}</p>`);
          }
        }
        if (inUl) parts.push("</ul>");
        if (inOl) parts.push("</ol>");
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
      if (!isAuthor && tweets.length > 0) break; // stop at first non-author tweet (not a thread)

      const tweetText =
        article.querySelector('[data-testid="tweetText"]') ||
        article.querySelector('div[lang]');
      if (tweetText) {
        // Convert literal newlines to <br> so they render in HTML
        let html = tweetText.innerHTML.replace(/\n/g, "<br>");
        tweets.push(html);
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

  // ── Notion ─────────────────────────────────────────────
  function extractNotion() {
    const title =
      document.querySelector(".notion-page-block .notranslate")?.textContent?.trim() ||
      document.querySelector("h1[data-block-id]")?.textContent?.trim() ||
      document.querySelector(".notion-title-input")?.textContent?.trim() ||
      document.querySelector("h1")?.textContent?.trim() ||
      meta("property", "og:title") ||
      document.title.replace(/ \|.*$/, "").trim();

    const author =
      meta("property", "og:site_name") ||
      meta("name", "author") ||
      "";

    // Notion renders content blocks inside elements with data-block-id
    const pageContent =
      document.querySelector(".notion-page-content") ||
      document.querySelector('[class*="page-content"]') ||
      document.querySelector(".layout-content") ||
      document.querySelector("main");

    if (!pageContent) {
      return { title, author, source_url: url, content: "" };
    }

    const parts = [];
    const blocks = pageContent.querySelectorAll("[data-block-id]");

    for (const block of blocks) {
      // Skip the title block (already captured above)
      if (block.closest(".notion-page-block") && block.querySelector(".notranslate")) continue;

      // Headings
      const h1 = block.querySelector("h2, [class*='header-block'] [placeholder='Heading 1']");
      const h2 = block.querySelector("h3, [class*='sub_header-block'] [placeholder='Heading 2']");
      const h3 = block.querySelector("[class*='sub_sub_header-block'] [placeholder='Heading 3']");

      if (block.className.includes("header-block")) {
        const text = block.textContent?.trim();
        if (text) {
          if (block.className.includes("sub_sub_header")) {
            parts.push(`<h4>${text}</h4>`);
          } else if (block.className.includes("sub_header")) {
            parts.push(`<h3>${text}</h3>`);
          } else {
            parts.push(`<h2>${text}</h2>`);
          }
          continue;
        }
      }

      // Images
      const img = block.querySelector("img[src]");
      if (img && block.className.includes("image-block")) {
        parts.push(`<img src="${img.src}" alt="${img.alt || ""}">`);
        continue;
      }

      // Code blocks
      const code = block.querySelector("[class*='code-block'] code, pre code");
      if (code) {
        parts.push(`<pre><code>${code.textContent}</code></pre>`);
        continue;
      }

      // Callout blocks
      if (block.className.includes("callout-block")) {
        const text = block.textContent?.trim();
        if (text) parts.push(`<blockquote>${text}</blockquote>`);
        continue;
      }

      // Quote blocks
      if (block.className.includes("quote-block")) {
        const text = block.textContent?.trim();
        if (text) parts.push(`<blockquote>${text}</blockquote>`);
        continue;
      }

      // Bulleted/numbered list items
      if (block.className.includes("list-block") || block.className.includes("bulleted") || block.className.includes("numbered")) {
        const text = block.textContent?.trim();
        if (text) parts.push(`<li>${text}</li>`);
        continue;
      }

      // Toggle blocks
      if (block.className.includes("toggle-block")) {
        const text = block.textContent?.trim();
        if (text) parts.push(`<p><strong>${text}</strong></p>`);
        continue;
      }

      // Divider
      if (block.className.includes("divider-block") || block.querySelector("hr")) {
        parts.push("<hr>");
        continue;
      }

      // Default: text block — grab innerHTML to preserve links/bold/italic
      const textEl =
        block.querySelector("[data-content-editable-leaf]") ||
        block.querySelector("[placeholder]") ||
        block.querySelector(".notranslate");
      if (textEl) {
        const html = textEl.innerHTML?.trim();
        if (html) parts.push(`<p>${html}</p>`);
        continue;
      }

      // Last resort: if block has meaningful text content
      const text = block.textContent?.trim();
      if (text && text.length > 1) {
        parts.push(`<p>${text}</p>`);
      }
    }

    // If data-block-id approach yielded nothing, fall back to cleanText
    let content = parts.join("\n");
    if (!content) {
      content = cleanText(pageContent);
    }

    return { title, author, source_url: url, content };
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
  } else if (host === "notion.so" || host.endsWith(".notion.site")) {
    result = extractNotion();
  } else {
    result = extractGeneric();
  }

  return result;
})();
