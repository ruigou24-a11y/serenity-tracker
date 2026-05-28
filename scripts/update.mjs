import fs from "node:fs/promises";
import crypto from "node:crypto";

const SOURCE_URL = "https://instalker.org/aleabitoreddit";
const DATA_PATH = new URL("../data.json", import.meta.url);

function decodeHtml(value) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num) => String.fromCodePoint(parseInt(num, 10)));
}

function cleanText(html) {
  return decodeHtml(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+\n/g, "\n")
      .replace(/\n\s+/g, "\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim()
  );
}

function extractPosts(html) {
  const matches = [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)];
  const seen = new Set();
  const posts = [];
  for (const match of matches) {
    const text = cleanText(match[1]);
    if (text.length < 25) continue;
    if (text.includes("View a Private Twitter Instagram Account")) continue;
    if (text.includes("全网都在聊的 Serenity")) continue;
    if (seen.has(text)) continue;
    seen.add(text);
    posts.push(text);
    if (posts.length >= 30) break;
  }
  return posts;
}

function countTickers(posts) {
  const counts = new Map();
  for (const post of posts) {
    const tickers = new Set(post.match(/\$[A-Z][A-Z0-9.]{0,5}\b/g) || []);
    for (const ticker of tickers) {
      const key = ticker.slice(1);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 18);
}

function scoreThemes(posts) {
  const corpus = posts.join("\n").toLowerCase();
  const themes = [
    ["CPO / 光通信", ["cpo", "photonics", "optics", "optical", "transceiver", "silicon photonics"]],
    ["激光器 / InP 材料瓶颈", ["laser", "inp", "substrate", "epiwafer", "bottleneck"]],
    ["AI 数据中心供应链", ["ai", "hyperscaler", "asic", "trainium", "maia", "datacenter", "infrastructure"]],
    ["功率半导体 / 800V DC", ["power semi", "800 vdc", "sic", "nvts", "powi", "wolf"]],
    ["CHIPS Act 政策催化", ["chips act", "sovereignty", "funding", "eu"]]
  ];
  return themes.map(([name, words]) => {
    const hits = words.reduce((sum, word) => sum + (corpus.split(word).length - 1), 0);
    return { name, score: Math.min(100, Math.round(hits * 10 + 20)) };
  }).sort((a, b) => b.score - a.score);
}

function summarize(posts, tickers, themes) {
  const top = tickers.slice(0, 6).map(([ticker]) => ticker);
  const recommendations = [];

  if (top.includes("SIVE")) {
    recommendations.push({
      ticker: "SIVE",
      stance: "最强关注",
      note: "近期出现频率最高，并且常与 CPO、激光器、Celestial/Marvell/Ayar 等供应链线索绑定。"
    });
  }
  if (top.includes("XFAB")) {
    recommendations.push({
      ticker: "XFAB",
      stance: "强关注",
      note: "发帖中明确偏正面，核心是 photonics + power semis + CHIPS Act 催化。"
    });
  }
  for (const ticker of ["AAOI", "AXTI", "LITE", "SOI", "NBIS"]) {
    if (top.includes(ticker)) {
      recommendations.push({
        ticker,
        stance: "主题相关",
        note: "属于近期反复提及的 AI 光通信/材料/算力供应链标的，需要结合涨幅和估值单独判断。"
      });
    }
  }

  return {
    coreTheme: themes[0]?.name || "AI 半导体供应链",
    takeaway: `最近 ${posts.length} 条可见发帖/回复里，主题集中在${themes.slice(0, 3).map((theme) => theme.name).join("、")}。高频股票为 ${top.join("、")}。`,
    recommendations: recommendations.slice(0, 5)
  };
}

function compactPost(post) {
  return post
    .replace(/\n{2,}/g, " / ")
    .replace(/\s{2,}/g, " ")
    .slice(0, 360);
}

function hashPosts(posts) {
  return crypto.createHash("sha256").update(posts.join("\n---\n")).digest("hex");
}

async function main() {
  let previous = {};
  try {
    previous = JSON.parse(await fs.readFile(DATA_PATH, "utf8"));
  } catch {}

  const response = await fetch(SOURCE_URL, {
    headers: {
      "user-agent": "Mozilla/5.0 serenity-tracker"
    }
  });

  if (!response.ok) {
    throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  const posts = extractPosts(html);
  if (posts.length < 5) {
    throw new Error(`Only extracted ${posts.length} posts`);
  }

  const sourceHash = hashPosts(posts);
  if (previous.sourceHash === sourceHash) {
    console.log("No new visible posts. Keeping data.json unchanged.");
    return;
  }

  const tickers = countTickers(posts);
  const themes = scoreThemes(posts);
  const summary = summarize(posts, tickers, themes);
  const data = {
    updatedAt: new Date().toISOString().slice(0, 10),
    sourceUrl: SOURCE_URL,
    postCount: posts.length,
    sourceHash,
    ...summary,
    tickers,
    themes,
    posts: posts.slice(0, 30).map(compactPost)
  };

  await fs.writeFile(DATA_PATH, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`Updated ${DATA_PATH.pathname} with ${posts.length} posts.`);
}

main().catch(async (error) => {
  console.error(error);
  const previous = JSON.parse(await fs.readFile(DATA_PATH, "utf8"));
  previous.lastCheckError = `${new Date().toISOString()} ${error.message}`;
  await fs.writeFile(DATA_PATH, `${JSON.stringify(previous, null, 2)}\n`);
  process.exitCode = 1;
});
