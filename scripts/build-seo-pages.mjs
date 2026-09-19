// Generates static, text-rich HTML pages into dist/ after `vite build` (npm "postbuild").
//
// The app itself is a single-URL React SPA whose <body> is an empty <div id="root">, so
// search engines get no real text and no per-topic addresses. This script writes plain
// HTML pages with real content at real URLs:
//
//   dist/hrafik-vidkliuchen/index.html          hub: links to every region page that exists
//   dist/hrafik-vidkliuchen/<slug>/index.html   outage schedule per region (live API data)
//   dist/haydy/index.html                       list of guides
//   dist/hayd/<id>-<slug>/index.html            one page per guide (row in Supabase `posts`)
//   dist/sitemap.xml                            rebuilt from what was actually generated
//   dist/seo-pages.json                         what exists (the app reads it to render links)
//
// REGION PAGES ARE OFF BY DEFAULT (set SEO_REGION_PAGES=1 to enable). Reason: they are a
// build-time snapshot of the live schedule, so they go stale until the next deploy, and when
// no region has outages every page is identical except for the region name (a doorway page).
// The code is kept for when the region pages are reworked around stable content (which
// oblenergo serves the region, where to look up the address list per queue, official
// contacts). With the flag off there are NO requests to the schedule API and NO links to
// /hrafik-vidkliuchen/ anywhere (nav, guides, sitemap, seo-pages.json).
//
// When enabled: a region page is written only if the API returned real schedule data for it.
// A guide page is written only for a row that really exists in Supabase.
//
// This script never fails the deploy over missing data: a broken backend or missing
// Supabase env just means fewer pages (loudly logged). Only a missing dist/ is fatal.
import { mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadEnv } from "vite";
import { createClient } from "@supabase/supabase-js";
import { REGION_OPTIONS } from "../src/data/regions.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DIST = join(ROOT, "dist");

const SITE = "https://www.blackout.org.ua";
const BACKEND_URL = "https://outage-schedule-backend.onrender.com";

// Render's free tier sleeps: the first request after idle can time out while it wakes up.
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3; // 1 try + 2 retries
const RETRY_PAUSE_MS = 9_000;
// If the backend is down, stop after this many regions in a row fail hard instead of
// burning minutes of build time on the remaining ones.
const MAX_CONSECUTIVE_HARD_FAILURES = 3;

// Master switch for the region pages. Default: off.
const REGION_PAGES = process.env.SEO_REGION_PAGES === "1";

// Optional stricter gate, only meaningful with SEO_REGION_PAGES=1 (SEO_REQUIRE_OUTAGES=1): only publish a region page if at least one
// queue actually has an outage hour today or tomorrow. Off by default — see the note where it
// is applied. When every queue everywhere is "no outages", pages differ only by region name.
const REQUIRE_OUTAGES = process.env.SEO_REQUIRE_OUTAGES === "1";

const BUILT_AT = new Date();
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- small helpers ----------

const esc = v =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// JSON inside <script type="application/ld+json"> must not be able to close the tag.
const jsonLdScript = obj =>
  `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, "\\u003c")}</script>`;

const kyivDate = (d, opts) => new Intl.DateTimeFormat("uk-UA", { timeZone: "Europe/Kyiv", ...opts }).format(d);
const fmtDate = d => kyivDate(d, { day: "2-digit", month: "2-digit", year: "numeric" });
const fmtDateTime = d => kyivDate(d, { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

const TRANSLIT = {
  а: "a", б: "b", в: "v", г: "h", ґ: "g", д: "d", е: "e", є: "ye", ж: "zh", з: "z", и: "y", і: "i", ї: "yi",
  й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh",
  ц: "ts", ч: "ch", ш: "sh", щ: "shch", ь: "", ю: "yu", я: "ya",
  // Russian letters that may appear in pasted text
  ё: "e", ы: "y", э: "e", ъ: "",
};

function slugify(title, max = 60) {
  const latin = [...String(title).toLowerCase()].map(ch => TRANSLIT[ch] ?? ch).join("");
  let slug = latin
    .replace(/[ʼ’'`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length > max) {
    slug = slug.slice(0, max);
    const cut = slug.lastIndexOf("-");
    if (cut > 20) slug = slug.slice(0, cut); // don't end mid-word if we can avoid it
    slug = slug.replace(/-+$/g, "");
  }
  return slug;
}

// Cut at a word boundary; add an ellipsis only when something was actually dropped.
function truncate(text, max) {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const head = t.slice(0, max + 1);
  const space = head.lastIndexOf(" ");
  const cut = space > max * 0.5 ? head.slice(0, space) : t.slice(0, max);
  return cut.replace(/[\s,.;:—–-]+$/, "") + "…";
}

const plainText = body =>
  String(body ?? "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/^\s*•\s*/gm, "")
    .replace(/\s+/g, " ")
    .trim();

function excerpt(body) {
  const text = plainText(body);
  const sentences = text.split(/(?<=[.!?…])\s+/);
  let out = "";
  for (const s of sentences.slice(0, 2)) {
    if ((out + " " + s).trim().length > 260) break;
    out = (out + " " + s).trim();
  }
  return out || truncate(text, 220);
}

// Ukrainian "in <region>" (locative) for the page description.
function inRegion(region) {
  const special = { kyiv: "у Києві", sevastopol: "у Севастополі", "avtonomna-respublika-krym": "в АР Крим" };
  if (special[region.slug]) return special[region.slug];
  const loc = region.name.replace(/(\S+)а область$/, "$1ій області");
  return /^[АЕЄИІЇОУЮЯ]/i.test(loc) ? `в ${loc}` : `у ${loc}`;
}

function operatorLabel(initiator) {
  if (!initiator) return "Оператор";
  if (initiator.endsWith("_uz")) return "Укрзалізниця";
  if (initiator.endsWith("_oblenergo")) return "Обленерго";
  return initiator;
}

// [true,false,false,true,...] (24 flags, false = no power) -> [[2,4],[14,18]] as [startHour, endHourExclusive]
function outageIntervals(hours) {
  const out = [];
  let start = null;
  hours.forEach((on, h) => {
    if (!on && start === null) start = h;
    if (on && start !== null) { out.push([start, h]); start = null; }
  });
  if (start !== null) out.push([start, 24]);
  return out;
}

const hh = h => `${String(h).padStart(2, "0")}:00`;

function describeDay(hours, missingText) {
  if (!Array.isArray(hours) || hours.length !== 24) return esc(missingText);
  const iv = outageIntervals(hours);
  if (iv.length === 0) return "без відключень";
  const total = iv.reduce((n, [a, b]) => n + (b - a), 0);
  return `${iv.map(([a, b]) => `${hh(a)}–${hh(b)}`).join(", ")} <span class="muted">(${total} год)</span>`;
}

const AFFILIATE_HOST = /(^|\.)temu\.(com|to)$/i;

// One line of guide text -> HTML. URLs become links; every link in a guide gets
// rel="sponsored" (some are affiliate links), and known affiliate hosts also get the
// visible "партнерське посилання" label the privacy policy promises.
function renderInline(raw, state) {
  let out = "";
  let last = 0;
  for (const m of raw.matchAll(/https?:\/\/[^\s<>"]+/g)) {
    let url = m[0];
    const trail = url.match(/[.,;:!?)\]»”]+$/)?.[0] ?? "";
    if (trail) url = url.slice(0, -trail.length);
    let host = "";
    try { host = new URL(url).hostname; } catch { /* leave as plain text below */ }
    out += esc(raw.slice(last, m.index));
    if (host) {
      const shown = url.replace(/^https?:\/\/(www\.)?/, "");
      out += `<a href="${esc(url)}" rel="noopener sponsored" target="_blank">${esc(shown)}</a>`;
      if (AFFILIATE_HOST.test(host)) {
        out += ' <span class="aff">(партнерське посилання)</span>';
        state.affiliate = true;
      }
    } else {
      out += esc(url);
    }
    out += esc(trail);
    last = m.index + m[0].length;
  }
  return out + esc(raw.slice(last));
}

// Each non-empty line is a paragraph; consecutive lines starting with "•" form one <ul>.
function renderBody(body) {
  const state = { affiliate: false };
  const html = [];
  let list = null;
  const flush = () => { if (list) { html.push(`<ul>${list.join("")}</ul>`); list = null; } };
  for (const line of String(body ?? "").split(/\r?\n/)) {
    const t = line.trim();
    if (!t) { flush(); continue; }
    if (t.startsWith("•")) {
      (list ??= []).push(`<li>${renderInline(t.replace(/^•\s*/, ""), state)}</li>`);
    } else {
      flush();
      html.push(`<p>${renderInline(t, state)}</p>`);
    }
  }
  flush();
  return { html: html.join("\n"), affiliate: state.affiliate };
}

// ---------- shared page shell ----------

const STYLE = `
  body { background:#030303; color:#eef2f8; font-family:system-ui,-apple-system,sans-serif; max-width:820px; margin:0 auto; padding:24px 20px 48px; line-height:1.7; }
  header { display:flex; flex-wrap:wrap; gap:8px 20px; align-items:baseline; padding-bottom:16px; border-bottom:1px solid #1b2028; margin-bottom:20px; }
  header .brand { font-weight:700; font-size:18px; color:#eef2f8; text-decoration:none; }
  header nav a { margin-right:14px; font-size:14px; }
  h1 { font-size:24px; line-height:1.3; margin:8px 0 12px; }
  h2 { font-size:17px; margin:30px 0 8px; }
  a { color:#4ea1ff; }
  p, li { color:#c7d0dc; font-size:14.5px; }
  ul { padding-left:22px; }
  .crumbs { font-size:12.5px; color:#8b95a5; }
  .crumbs a { color:#8b95a5; }
  .muted, .aff { color:#8b95a5; font-size:12.5px; }
  table { border-collapse:collapse; width:100%; margin:8px 0 4px; font-size:14px; }
  th, td { text-align:left; padding:8px 10px; border-bottom:1px solid #1b2028; vertical-align:top; color:#c7d0dc; }
  th { color:#8b95a5; font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:.04em; }
  .warn { border-left:3px solid #ffc93c; background:#15130a; padding:8px 14px; border-radius:0 6px 6px 0; }
  .cta { display:inline-block; margin:6px 0; padding:9px 18px; border-radius:999px; background:#4c8dff; color:#fff; font-weight:700; text-decoration:none; }
  .links { columns:2; column-gap:24px; padding-left:18px; }
  @media (max-width:560px) { .links { columns:1; } }
  footer { margin-top:40px; padding-top:16px; border-top:1px solid #1b2028; font-size:12.5px; color:#8b95a5; }
  footer p { font-size:12.5px; color:#8b95a5; margin:4px 0; }
`;

function breadcrumbs(items) {
  // items: [{ name, path? }] — last item is the current page (no link)
  const html = items
    .map((it, i) => (it.path && i < items.length - 1 ? `<a href="${it.path}">${esc(it.name)}</a>` : `<span>${esc(it.name)}</span>`))
    .join(" › ");
  const json = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: `${SITE}${it.path}`,
    })),
  };
  return { html: `<nav class="crumbs" aria-label="Навігація">${html}</nav>`, json };
}

function pageShell({ path, title, description, ogType = "website", ld = [], nav, main }) {
  const url = `${SITE}${path}`;
  return `<!DOCTYPE html>
<html lang="uk">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
<meta name="robots" content="index, follow" />
<link rel="canonical" href="${esc(url)}" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:type" content="${ogType}" />
<meta property="og:url" content="${esc(url)}" />
<meta property="og:site_name" content="Blackout" />
<meta property="og:locale" content="uk_UA" />
<meta property="og:image" content="${SITE}/icon-512.png" />
<meta name="twitter:card" content="summary" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(description)}" />
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#0057B7" />
${ld.map(jsonLdScript).join("\n")}
<style>${STYLE}</style>
</head>
<body>
<header>
  <a class="brand" href="/">Blackout</a>
  <nav>${nav}</nav>
</header>
<main>
${main}
</main>
<footer>
  <p>Blackout — незалежний проєкт для зручного відстеження ситуації зі світлом в Україні. Ми не пов'язані з обленерго чи державними органами, а вся інформація береться з відкритих джерел, тому ми не можемо гарантувати її точність.</p>
  <p><a href="/">Blackout.org.ua</a> · <a href="/privacy.html">Політика конфіденційності</a></p>
</footer>
</body>
</html>
`;
}

async function writePage(relDir, html) {
  const dir = join(DIST, relDir);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "index.html"), html, "utf8");
}

// ---------- 1.1 regions ----------

async function fetchRegionSchedule(slug) {
  const url = `${BACKEND_URL}/api/alerts-energy/schedule?region=${encodeURIComponent(slug)}`;
  let lastErr = "unknown error";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (res.status >= 500) throw new Error(`HTTP ${res.status}`); // likely still waking up — retry
      if (!res.ok) return { skip: `HTTP ${res.status}` }; // definitive answer, no point retrying
      const data = await res.json();
      const queues = (Array.isArray(data?.queues) ? data.queues : []).filter(
        q => q && q.queue && Array.isArray(q.today) && q.today.length === 24
      );
      if (queues.length === 0) return { skip: "API повернув порожній список черг" };
      if (REQUIRE_OUTAGES && !queues.some(q => outageIntervals(q.today).length > 0 || (Array.isArray(q.tomorrow) && outageIntervals(q.tomorrow).length > 0))) {
        return { skip: "жодної години відключень сьогодні/завтра (SEO_REQUIRE_OUTAGES=1)" };
      }
      return { queues };
    } catch (e) {
      lastErr = e?.name === "TimeoutError" ? `таймаут ${REQUEST_TIMEOUT_MS / 1000}с` : e?.message || String(e);
      if (attempt < MAX_ATTEMPTS) {
        console.log(`  … ${slug}: спроба ${attempt}/${MAX_ATTEMPTS} не вдалася (${lastErr}), повтор через ${RETRY_PAUSE_MS / 1000}с`);
        await sleep(RETRY_PAUSE_MS);
      }
    }
  }
  return { skip: `бекенд недоступний після ${MAX_ATTEMPTS} спроб (${lastErr})`, hard: true };
}

const naturalQueueOrder = (a, b) => String(a.queue).localeCompare(String(b.queue), "en", { numeric: true });

function regionMainHtml({ region, queues, nav, ctx }) {
  const today = fmtDate(BUILT_AT);
  const tomorrow = fmtDate(new Date(BUILT_AT.getTime() + 24 * 3600 * 1000));
  const asOf = fmtDateTime(BUILT_AT);

  const groups = new Map();
  for (const q of [...queues].sort(naturalQueueOrder)) {
    const label = operatorLabel(q.initiator);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(q);
  }

  const anyOutage = queues.some(q => outageIntervals(q.today).length > 0);
  const tables = [...groups.entries()]
    .map(([label, qs]) => {
      const rows = qs
        .map(q => `<tr><td><strong>${esc(q.queue)}</strong></td><td>${describeDay(q.today, "немає даних")}</td><td>${describeDay(q.tomorrow, "ще не опубліковано")}</td></tr>`)
        .join("\n");
      return `<h3 style="font-size:15px;margin:18px 0 4px;">${esc(label)}</h3>
<table>
<thead><tr><th>Черга</th><th>Сьогодні, ${today}</th><th>Завтра, ${tomorrow}</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>`;
    })
    .join("\n");

  const others = ctx.generatedRegions.filter(r => r.slug !== region.slug);

  return `${ctx.crumbs.html}
<h1>Графік відключень світла — ${esc(region.name)}</h1>
<p>Графік погодинних відключень електроенергії ${esc(inRegion(region))}: черги, підчерги та години без світла на сьогодні й завтра. <strong>Дані станом на <time datetime="${BUILT_AT.toISOString()}">${esc(asOf)}</time></strong> (час київський). Джерело — неофіційний агрегатор alerts.energy.</p>
${anyOutage ? "" : "<p>За даними на цей момент відключень за графіком на сьогодні не заплановано — усі черги зі світлом.</p>"}

<h2>Черги та години без світла</h2>
<p class="muted">Час вказано початок–кінець годин без електропостачання.</p>
${tables}

<p><a class="cta" href="/?region=${esc(region.slug)}">Інтерактивний графік і карта тривог</a></p>

<h2>Як влаштовані черги відключень</h2>
<p>Споживачів поділено на 6 черг, кожна черга — ще на 2 підчерги (1.1, 1.2, 2.1 … 6.2), тож усього виходить 12 груп. Свою чергу можна знайти в переліку адрес на сайті обленерго або в платіжці за електроенергію.</p>

<h2>Важливо</h2>
<p class="warn">Графік — це плановий орієнтир, а не гарантія. Аварійні відключення накладаються поверх планових і в графіку не відображаються. Якщо світла немає довше, ніж вказано, перевірте офіційний канал свого обленерго.</p>

<h2>Графіки в інших областях</h2>
<ul class="links">
${others.map(r => `<li><a href="/hrafik-vidkliuchen/${r.slug}/">${esc(r.name)}</a></li>`).join("\n")}
</ul>
<p><a href="/hrafik-vidkliuchen/">Усі графіки відключень →</a>${ctx.hasGuides ? ' · <a href="/haydy/">Гайди: як пережити відключення →</a>' : ""}</p>`;
}

// ---------- 1.2 guides ----------

async function fetchPosts() {
  const env = loadEnv("production", ROOT, "VITE_");
  const url = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.warn("⚠ VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY не задані — сторінки гайдів НЕ згенеровано.");
    console.warn("  На Vercel додайте ці змінні в Environment Variables (для Production і Preview).");
    return [];
  }
  try {
    const supabase = createClient(url, key, { auth: { persistSession: false } });
    const { data, error } = await supabase.from("posts").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.warn(`⚠ Не вдалося отримати пости з Supabase: ${e?.message || e} — сторінки гайдів НЕ згенеровано.`);
    return [];
  }
}

function guideMainHtml({ g, ctx }) {
  const { html, affiliate } = renderBody(g.body);
  const created = new Date(g.created_at);
  const dateOk = !Number.isNaN(created.getTime());
  const otherGuides = ctx.guides.filter(x => x.path !== g.path).slice(0, 5);
  const regionLinks = ctx.generatedRegions.slice(0, 6);
  return `${ctx.crumbs.html}
<article>
<h1>${esc(g.title)}</h1>
${dateOk ? `<p class="muted">Опубліковано: <time datetime="${created.toISOString()}">${esc(fmtDate(created))}</time> · blackout.org.ua</p>` : ""}
${html}
${affiliate ? '<p class="muted">У цьому матеріалі є партнерські посилання: якщо ви робите покупку за ними, сайт може отримати невелику комісію від продавця — на ціну для вас це не впливає. Детальніше — у <a href="/privacy.html">політиці конфіденційності</a>.</p>' : ""}
</article>
${otherGuides.length ? `<h2>Інші гайди</h2>
<ul>
${otherGuides.map(o => `<li><a href="${o.path}">${esc(o.title)}</a></li>`).join("\n")}
</ul>` : ""}
${regionLinks.length ? `<h2>Графіки відключень</h2>
<ul class="links">
${regionLinks.map(r => `<li><a href="/hrafik-vidkliuchen/${r.slug}/">Графік відключень — ${esc(r.name)}</a></li>`).join("\n")}
</ul>
<p><a href="/hrafik-vidkliuchen/">Усі графіки відключень →</a></p>` : ""}
<p><a href="/haydy/">← Усі гайди</a></p>`;
}

// ---------- sitemap ----------

function sitemapXml(entries) {
  const body = entries
    .map(
      e => `  <url>
    <loc>${esc(e.loc)}</loc>
    <lastmod>${e.lastmod}</lastmod>
    <changefreq>${e.changefreq}</changefreq>
    <priority>${e.priority}</priority>
  </url>`
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
}

// ---------- main ----------

async function main() {
  if (!existsSync(join(DIST, "index.html"))) {
    console.error("build-seo-pages: dist/index.html не знайдено — спершу має відпрацювати `vite build`.");
    process.exit(1);
  }

  // start clean so re-running the script never leaves pages from a previous run behind
  for (const dir of ["hrafik-vidkliuchen", "hayd", "haydy"]) await rm(join(DIST, dir), { recursive: true, force: true });

  // ---- fetch everything first, so pages can link to each other ----
  const regionsToFetch = REGION_PAGES ? REGION_OPTIONS : [];
  if (REGION_PAGES) console.log(`\n[seo] Регіони: запитую графіки з ${BACKEND_URL} (послідовно)…`);
  else console.log("\n[seo] Сторінки областей вимкнено (SEO_REGION_PAGES!=1) — запитів до API графіків немає.");
  const generatedRegions = [];
  const skipped = [];
  let hardFailStreak = 0;
  for (const [i, region] of regionsToFetch.entries()) {
    if (hardFailStreak >= MAX_CONSECUTIVE_HARD_FAILURES) {
      const rest = regionsToFetch.slice(i);
      for (const r of rest) skipped.push({ region: r, reason: "бекенд недоступний — пропущено без запиту" });
      console.warn(`⚠ ${MAX_CONSECUTIVE_HARD_FAILURES} регіони поспіль без відповіді — решту (${rest.length}) пропущено.`);
      break;
    }
    const result = await fetchRegionSchedule(region.slug);
    if (result.skip) {
      skipped.push({ region, reason: result.skip });
      hardFailStreak = result.hard ? hardFailStreak + 1 : 0;
      console.log(`  ✗ ${region.slug}: пропущено — ${result.skip}`);
    } else {
      hardFailStreak = 0;
      generatedRegions.push({ ...region, queues: result.queues });
      console.log(`  ✓ ${region.slug}: ${result.queues.length} черг`);
    }
  }

  console.log("\n[seo] Гайди: читаю пости з Supabase…");
  const rawPosts = await fetchPosts();
  const guides = [];
  const usedPaths = new Set();
  for (const p of rawPosts) {
    const title = String(p.title ?? "").trim();
    const body = String(p.body ?? "").trim();
    if (p.id == null || !title || !body) {
      console.log(`  ✗ пост ${p.id ?? "?"}: пропущено — порожній заголовок або текст`);
      continue;
    }
    const slug = slugify(title);
    const path = `/hayd/${p.id}${slug ? `-${slug}` : ""}/`;
    if (usedPaths.has(path)) continue;
    usedPaths.add(path);
    guides.push({ ...p, title, body, path });
    if (body.length < 300) console.log(`  ! пост ${p.id}: дуже короткий текст (${body.length} символів) — сторінка вийде тонкою`);
  }
  console.log(`  ✓ гайдів для генерації: ${guides.length}`);

  const hasHub = generatedRegions.length > 0;
  const hasGuides = guides.length > 0;

  const navHtml = [
    '<a href="/">Карта тривог</a>',
    hasHub ? '<a href="/hrafik-vidkliuchen/">Графіки відключень</a>' : "",
    hasGuides ? '<a href="/haydy/">Гайди</a>' : "",
  ].filter(Boolean).join("");

  // ---- region pages + hub ----
  const sitemap = [
    { loc: `${SITE}/`, lastmod: BUILT_AT.toISOString(), changefreq: "hourly", priority: "1.0" },
  ];

  if (hasHub) {
    const homeCrumb = { name: "Головна", path: "/" };
    const hubCrumb = { name: "Графіки відключень", path: "/hrafik-vidkliuchen/" };

    for (const region of generatedRegions) {
      const path = `/hrafik-vidkliuchen/${region.slug}/`;
      const crumbs = breadcrumbs([homeCrumb, hubCrumb, { name: region.name, path }]);
      const title = `Графік відключень світла — ${region.name} | Blackout`;
      const description = `Актуальний графік погодинних відключень електроенергії ${inRegion(region)} — черги, підчерги та години без світла. Дані оновлюються автоматично.`;
      const html = pageShell({
        path, title, description, ld: [crumbs.json], nav: navHtml,
        main: regionMainHtml({ region, queues: region.queues, ctx: { crumbs, generatedRegions, hasGuides } }),
      });
      await writePage(`hrafik-vidkliuchen/${region.slug}`, html);
      sitemap.push({ loc: `${SITE}${path}`, lastmod: BUILT_AT.toISOString(), changefreq: "hourly", priority: "0.8" });
    }

    // hub: a real index of the pages above (also gives the breadcrumb's middle item a valid URL)
    const hubPath = "/hrafik-vidkliuchen/";
    const crumbs = breadcrumbs([homeCrumb, { name: "Графіки відключень", path: hubPath }]);
    const hubHtml = pageShell({
      path: hubPath,
      title: "Графіки відключень світла по областях України | Blackout",
      description: `Графіки погодинних відключень електроенергії по областях України: ${generatedRegions.length} ${generatedRegions.length === 1 ? "регіон" : "регіонів"} з актуальними чергами та годинами без світла.`,
      ld: [crumbs.json], nav: navHtml,
      main: `${crumbs.html}
<h1>Графіки відключень світла по областях</h1>
<p>Оберіть свою область, щоб побачити актуальний графік погодинних відключень електроенергії: черги, підчерги та години без світла на сьогодні й завтра. Тут перелічено лише ті області, для яких зараз є дані.</p>
<p>Черг шість, і кожна ділиться на дві підчерги — разом 12 груп. Свою чергу зазвичай вказано в платіжці за електроенергію або в переліку адрес на сайті обленерго. Графіки — плановий орієнтир: аварійні відключення накладаються поверх них.</p>
<ul class="links">
${generatedRegions.map(r => `<li><a href="/hrafik-vidkliuchen/${r.slug}/">${esc(r.name)}</a></li>`).join("\n")}
</ul>
<p><a class="cta" href="/">Карта повітряних тривог</a></p>
${hasGuides ? '<p><a href="/haydy/">Гайди: як пережити відключення →</a></p>' : ""}`,
    });
    await writePage("hrafik-vidkliuchen", hubHtml);
    sitemap.push({ loc: `${SITE}${hubPath}`, lastmod: BUILT_AT.toISOString(), changefreq: "hourly", priority: "0.8" });
  }

  // ---- guide pages + list ----
  if (hasGuides) {
    const homeCrumb = { name: "Головна", path: "/" };
    const listCrumb = { name: "Гайди", path: "/haydy/" };

    for (const g of guides) {
      const crumbs = breadcrumbs([homeCrumb, listCrumb, { name: g.title, path: g.path }]);
      const created = new Date(g.created_at);
      const dateOk = !Number.isNaN(created.getTime());
      const description = truncate(plainText(g.body), 155) || g.title;
      const article = {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: g.title,
        description,
        inLanguage: "uk",
        mainEntityOfPage: `${SITE}${g.path}`,
        image: `${SITE}/icon-512.png`,
        ...(dateOk ? { datePublished: created.toISOString() } : {}),
        ...(g.updated_at && !Number.isNaN(new Date(g.updated_at).getTime()) ? { dateModified: new Date(g.updated_at).toISOString() } : {}),
        author: { "@type": "Organization", name: "blackout.org.ua", url: `${SITE}/` },
        publisher: { "@type": "Organization", name: "blackout.org.ua", url: `${SITE}/` },
      };
      const html = pageShell({
        path: g.path,
        title: `${g.title} | Blackout`,
        description,
        ogType: "article",
        ld: [article, crumbs.json],
        nav: navHtml,
        main: guideMainHtml({ g, ctx: { crumbs, guides, generatedRegions } }),
      });
      await writePage(g.path.replace(/^\/|\/$/g, ""), html);
      sitemap.push({
        loc: `${SITE}${g.path}`,
        lastmod: dateOk ? created.toISOString() : BUILT_AT.toISOString(),
        changefreq: "monthly",
        priority: "0.6",
      });
    }

    const crumbs = breadcrumbs([homeCrumb, listCrumb]);
    const listHtml = pageShell({
      path: "/haydy/",
      title: "Гайди: відключення світла, генератори, павербанки | Blackout",
      description: "Практичні гайди про відключення світла в Україні: графіки, генератори, павербанки та те, як пережити темні години.",
      ld: [crumbs.json], nav: navHtml,
      main: `${crumbs.html}
<h1>Гайди про відключення світла</h1>
<p>Практичні матеріали про графіки відключень, генератори, павербанки та інші способи пережити темні години. Публікуються від імені сайту blackout.org.ua.</p>
${guides.map(g => `<h2><a href="${g.path}">${esc(g.title)}</a></h2>
<p>${esc(excerpt(g.body))}</p>`).join("\n")}
${hasHub ? '<p><a href="/hrafik-vidkliuchen/">Графіки відключень по областях →</a></p>' : ""}`,
    });
    await writePage("haydy", listHtml);
    sitemap.push({ loc: `${SITE}/haydy/`, lastmod: BUILT_AT.toISOString(), changefreq: "weekly", priority: "0.6" });
  }

  // ---- sitemap + manifest for the app ----
  await writeFile(join(DIST, "sitemap.xml"), sitemapXml(sitemap), "utf8");
  await writeFile(
    join(DIST, "seo-pages.json"),
    JSON.stringify({
      generatedAt: BUILT_AT.toISOString(),
      regions: generatedRegions.map(r => r.slug),
      guides: guides.map(g => ({ path: g.path, title: g.title, section: g.section ?? null })),
    }) + "\n",
    "utf8"
  );

  // ---- report ----
  console.log("\n[seo] ─── Підсумок ───");
  console.log(REGION_PAGES ? `[seo] Сторінки областей: ${generatedRegions.length} з ${REGION_OPTIONS.length}` : "[seo] Сторінки областей: вимкнено (SEO_REGION_PAGES!=1)");
  if (generatedRegions.length) console.log(`[seo]   створено: ${generatedRegions.map(r => r.slug).join(", ")}`);
  if (skipped.length) {
    console.log(`[seo]   пропущено (${skipped.length}):`);
    for (const s of skipped) console.log(`[seo]     - ${s.region.slug}: ${s.reason}`);
  }
  console.log(`[seo] Сторінки гайдів: ${guides.length}${hasGuides ? " + /haydy/" : ""}`);
  console.log(`[seo] sitemap.xml: ${sitemap.length} URL`);
}

main().catch(err => {
  // A bug here must not take the whole deploy down: the app in dist/ is already built and
  // the old sitemap stays. Log it loudly instead.
  console.error("⚠ build-seo-pages: непередбачена помилка — SEO-сторінки можуть бути неповними:", err);
});
