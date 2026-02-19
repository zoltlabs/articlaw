const API_BASE = "https://articlaw.vercel.app";
const SUPABASE_URL = "https://wlhikvrmjdszptrqjddt.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_UJFac5t4j-VTWCgQAe6yVg_qqpkXpIq";

// ── DOM refs ───────────────────────────────────────────────
const loginView = document.getElementById("login-view");
const clipView = document.getElementById("clip-view");
const successView = document.getElementById("success-view");
const extractingView = document.getElementById("extracting");
const logoutBtn = document.getElementById("logout-btn");

const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginBtn = document.getElementById("login-btn");
const googleBtn = document.getElementById("google-btn");
const loginStatus = document.getElementById("login-status");

const clipTitle = document.getElementById("clip-title");
const clipAuthor = document.getElementById("clip-author");
const clipUrl = document.getElementById("clip-url");
const clipPreview = document.getElementById("clip-preview");
const clipBtn = document.getElementById("clip-btn");
const clipStatus = document.getElementById("clip-status");

const successLink = document.getElementById("success-link");
const copyLinkBtn = document.getElementById("copy-link-btn");

let extractedContent = "";
let session = null;

// ── Init ───────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  const stored = await chrome.storage.local.get(["session"]);
  if (stored.session?.access_token) {
    session = stored.session;
    showClipView();
  }
});

// ── Login ──────────────────────────────────────────────────
loginBtn.addEventListener("click", async () => {
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  if (!email || !password) {
    loginStatus.textContent = "Enter email and password.";
    loginStatus.className = "status error";
    return;
  }

  loginBtn.disabled = true;
  loginStatus.textContent = "Logging in...";
  loginStatus.className = "status";

  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error_description || data.msg || "Login failed");
    }

    session = data;
    await chrome.storage.local.set({ session: data });
    showClipView();
  } catch (err) {
    loginStatus.textContent = err.message;
    loginStatus.className = "status error";
    loginBtn.disabled = false;
  }
});

// Allow Enter to submit login
passwordInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") loginBtn.click();
});

// ── Google OAuth ────────────────────────────────────────────
googleBtn.addEventListener("click", async () => {
  googleBtn.disabled = true;
  loginStatus.textContent = "Opening Google sign-in...";
  loginStatus.className = "status";

  try {
    const redirectUrl = chrome.identity.getRedirectURL();

    // Build Supabase OAuth URL — redirect back to extension
    const authUrl = new URL(`${SUPABASE_URL}/auth/v1/authorize`);
    authUrl.searchParams.set("provider", "google");
    authUrl.searchParams.set("redirect_to", redirectUrl);

    const responseUrl = await chrome.identity.launchWebAuthFlow({
      url: authUrl.toString(),
      interactive: true,
    });

    // Supabase returns tokens in the URL fragment: #access_token=...&refresh_token=...
    const hash = new URL(responseUrl).hash.substring(1);
    const params = new URLSearchParams(hash);

    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    const expiresIn = parseInt(params.get("expires_in") || "3600");

    if (!accessToken) throw new Error("No access token received");

    session = {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: Math.floor(Date.now() / 1000) + expiresIn,
    };

    await chrome.storage.local.set({ session });
    showClipView();
  } catch (err) {
    loginStatus.textContent = err.message;
    loginStatus.className = "status error";
    googleBtn.disabled = false;
  }
});

// ── Logout ─────────────────────────────────────────────────
logoutBtn.addEventListener("click", async () => {
  await chrome.storage.local.remove("session");
  session = null;
  loginView.style.display = "";
  clipView.style.display = "none";
  successView.style.display = "none";
  extractingView.style.display = "none";
  logoutBtn.style.display = "none";
  loginStatus.textContent = "";
  emailInput.value = "";
  passwordInput.value = "";
});

// ── Show clip view + extract ───────────────────────────────
async function showClipView() {
  loginView.style.display = "none";
  extractingView.style.display = "block";
  logoutBtn.style.display = "";

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    const isXTwitter = /^https?:\/\/(x\.com|twitter\.com)\//i.test(tab.url);
    const maxAttempts = isXTwitter ? 10 : 1;
    let data = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 300));

      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["extract.js"],
      });

      data = results[0]?.result;
      if (data?.content) break;
    }

    if (!data) throw new Error("Could not extract page content");

    clipTitle.value = data.title || "";
    clipAuthor.value = data.author || "";
    clipUrl.value = data.source_url || tab.url;
    extractedContent = data.content || "";

    // Show plain-text preview (innerText preserves line breaks from block elements)
    const tmp = document.createElement("div");
    tmp.innerHTML = extractedContent;
    document.body.appendChild(tmp);
    tmp.style.position = "absolute";
    tmp.style.visibility = "hidden";
    const plain = tmp.innerText;
    tmp.remove();
    clipPreview.textContent = plain.slice(0, 500) + (plain.length > 500 ? "..." : "");

    extractingView.style.display = "none";
    clipView.style.display = "block";
  } catch (err) {
    extractingView.textContent = "Failed to extract: " + err.message;
  }
}

// ── Clip ───────────────────────────────────────────────────
clipBtn.addEventListener("click", async () => {
  if (!session?.access_token) return;
  clipBtn.disabled = true;
  clipStatus.textContent = "Clipping...";
  clipStatus.className = "status";

  try {
    // Refresh token if needed
    let token = session.access_token;
    if (session.expires_at && Date.now() / 1000 > session.expires_at - 60) {
      token = await refreshToken();
    }

    const res = await fetch(`${API_BASE}/api/clip`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        title: clipTitle.value,
        author: clipAuthor.value,
        source_url: clipUrl.value,
        content: extractedContent,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to clip");

    clipView.style.display = "none";
    successView.style.display = "block";
    successLink.href = data.url;
    successLink.textContent = data.url;
  } catch (err) {
    clipStatus.textContent = err.message;
    clipStatus.className = "status error";
    clipBtn.disabled = false;
  }
});

// ── Copy link ──────────────────────────────────────────────
copyLinkBtn.addEventListener("click", async () => {
  await navigator.clipboard.writeText(successLink.href);
  copyLinkBtn.textContent = "Copied!";
  setTimeout(() => (copyLinkBtn.textContent = "Copy link"), 2000);
});

// ── Refresh token ──────────────────────────────────────────
async function refreshToken() {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error("Session expired. Please log in again.");

  session = data;
  await chrome.storage.local.set({ session: data });
  return data.access_token;
}
