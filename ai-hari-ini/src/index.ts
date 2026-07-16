interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  SITE_NAME: string;
  SITE_URL: string;
  AUTO_PUBLISH_MIN_SCORE: string;
  MAX_POSTS_PER_RUN: string;
}

type FeedSource = {
  name: string;
  url: string;
  category: string;
  trust: number;
};

type FeedItem = {
  title: string;
  link: string;
  description: string;
  publishedAt: string;
};

const SOURCES: FeedSource[] = [
  { name: 'Google AI', url: 'https://blog.google/technology/ai/rss/', category: 'Perusahaan AI', trust: 30 },
  { name: 'Microsoft AI', url: 'https://blogs.microsoft.com/ai/feed/', category: 'Perusahaan AI', trust: 30 },
  { name: 'Hugging Face', url: 'https://huggingface.co/blog/feed.xml', category: 'Open Source', trust: 27 },
  { name: 'MIT News AI', url: 'https://news.mit.edu/rss/topic/artificial-intelligence2', category: 'Riset', trust: 28 },
  { name: 'arXiv AI', url: 'https://export.arxiv.org/api/query?search_query=cat:cs.AI&sortBy=submittedDate&sortOrder=descending&max_results=15', category: 'Riset', trust: 25 }
];

const AI_TERMS = [
  'ai', 'artificial intelligence', 'machine learning', 'deep learning', 'llm', 'language model',
  'neural', 'robot', 'computer vision', 'generative', 'agent', 'model', 'open source'
];

const RISK_TERMS = ['rumor', 'alleged', 'lawsuit', 'sued', 'security breach', 'leak', 'layoff', 'election', 'health claim'];

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/articles') return apiArticles(url, env);
    if (url.pathname === '/api/featured') return apiFeatured(env);
    if (url.pathname === '/api/categories') return apiCategories(env);
    if (url.pathname === '/api/health') return json({ ok: true, service: env.SITE_NAME });
    if (url.pathname === '/api/run-ingestion' && request.method === 'POST') {
      const auth = request.headers.get('authorization');
      if (!auth || auth !== `Bearer ${await adminToken(env)}`) return json({ error: 'Unauthorized' }, 401);
      const result = await ingestAll(env);
      return json(result);
    }

    if (url.pathname.startsWith('/artikel/')) return renderArticle(url.pathname.split('/').filter(Boolean)[1], env);
    if (url.pathname.startsWith('/kategori/')) return renderCategory(decodeURIComponent(url.pathname.split('/').filter(Boolean)[1] || ''), env);
    if (url.pathname === '/rss.xml') return renderRss(env);
    if (url.pathname === '/sitemap.xml') return renderSitemap(env);
    if (url.pathname === '/robots.txt') return new Response(`User-agent: *\nAllow: /\nSitemap: ${env.SITE_URL}/sitemap.xml\n`, { headers: { 'content-type': 'text/plain; charset=utf-8' } });

    return env.ASSETS.fetch(request);
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(ingestAll(env));
  }
};

async function apiArticles(url: URL, env: Env): Promise<Response> {
  const limit = Math.min(Number(url.searchParams.get('limit') || 18), 50);
  const offset = Math.max(Number(url.searchParams.get('offset') || 0), 0);
  const category = url.searchParams.get('category');
  const q = url.searchParams.get('q');

  let sql = `SELECT id, slug, title, excerpt, category, source_name, source_url, published_at, score, cover_variant, tags FROM articles WHERE status='published'`;
  const bindings: unknown[] = [];
  if (category) { sql += ' AND category = ?'; bindings.push(category); }
  if (q) { sql += ' AND (title LIKE ? OR excerpt LIKE ?)'; bindings.push(`%${q}%`, `%${q}%`); }
  sql += ' ORDER BY datetime(published_at) DESC LIMIT ? OFFSET ?';
  bindings.push(limit, offset);

  const result = await env.DB.prepare(sql).bind(...bindings).all();
  return json({ articles: result.results });
}

async function apiFeatured(env: Env): Promise<Response> {
  const result = await env.DB.prepare(`SELECT slug,title,excerpt,category,source_name,published_at,cover_variant FROM articles WHERE status='published' ORDER BY score DESC, datetime(published_at) DESC LIMIT 5`).all();
  return json({ articles: result.results });
}

async function apiCategories(env: Env): Promise<Response> {
  const result = await env.DB.prepare(`SELECT category, COUNT(*) count FROM articles WHERE status='published' GROUP BY category ORDER BY count DESC`).all();
  return json({ categories: result.results });
}

async function renderArticle(slug: string, env: Env): Promise<Response> {
  const article = await env.DB.prepare(`SELECT * FROM articles WHERE slug=? AND status='published'`).bind(slug).first<Record<string, unknown>>();
  if (!article) return new Response('Artikel tidak ditemukan', { status: 404 });
  const related = await env.DB.prepare(`SELECT slug,title,published_at FROM articles WHERE status='published' AND category=? AND slug<>? ORDER BY datetime(published_at) DESC LIMIT 4`).bind(article.category, slug).all();
  return html(articlePage(article, related.results as Record<string, unknown>[], env));
}

async function renderCategory(category: string, env: Env): Promise<Response> {
  const result = await env.DB.prepare(`SELECT slug,title,excerpt,category,source_name,published_at,cover_variant FROM articles WHERE status='published' AND category=? ORDER BY datetime(published_at) DESC LIMIT 30`).bind(category).all();
  return html(categoryPage(category, result.results as Record<string, unknown>[], env));
}

async function renderRss(env: Env): Promise<Response> {
  const result = await env.DB.prepare(`SELECT slug,title,excerpt,published_at FROM articles WHERE status='published' ORDER BY datetime(published_at) DESC LIMIT 30`).all();
  const items = (result.results as Record<string, unknown>[]).map(a => `<item><title>${xml(String(a.title))}</title><link>${env.SITE_URL}/artikel/${a.slug}</link><guid>${env.SITE_URL}/artikel/${a.slug}</guid><pubDate>${new Date(String(a.published_at)).toUTCString()}</pubDate><description>${xml(String(a.excerpt))}</description></item>`).join('');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${xml(env.SITE_NAME)}</title><link>${env.SITE_URL}</link><description>Berita AI terbaru dalam bahasa Indonesia</description>${items}</channel></rss>`, { headers: { 'content-type': 'application/rss+xml; charset=utf-8' } });
}

async function renderSitemap(env: Env): Promise<Response> {
  const result = await env.DB.prepare(`SELECT slug,published_at FROM articles WHERE status='published' ORDER BY datetime(published_at) DESC LIMIT 5000`).all();
  const urls = (result.results as Record<string, unknown>[]).map(a => `<url><loc>${env.SITE_URL}/artikel/${a.slug}</loc><lastmod>${String(a.published_at).slice(0,10)}</lastmod></url>`).join('');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${env.SITE_URL}/</loc></url>${urls}</urlset>`, { headers: { 'content-type': 'application/xml; charset=utf-8' } });
}

async function ingestAll(env: Env): Promise<{ inserted: number; reviewed: number; errors: string[] }> {
  let inserted = 0;
  let reviewed = 0;
  const errors: string[] = [];
  const max = Number(env.MAX_POSTS_PER_RUN || 8);

  for (const source of SOURCES) {
    if (inserted >= max) break;
    let fetched = 0;
    let sourceInserted = 0;
    try {
      const response = await fetch(source.url, { headers: { 'user-agent': `${env.SITE_NAME}/1.0 (+${env.SITE_URL})` } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      const items = parseFeed(text).slice(0, 20);
      fetched = items.length;
      for (const item of items) {
        if (inserted >= max || !isAiRelated(item)) continue;
        const exists = await env.DB.prepare('SELECT id FROM articles WHERE source_url=?').bind(item.link).first();
        if (exists) continue;

        const score = scoreItem(item, source);
        const status = score >= Number(env.AUTO_PUBLISH_MIN_SCORE || 60) && !hasRisk(item) ? 'published' : 'review';
        const title = cleanText(item.title);
        const excerpt = createExcerpt(item.description, title, source.name);
        const content = createContent(title, excerpt, source.name, item.link, item.publishedAt);
        const category = classifyCategory(title + ' ' + item.description, source.category);
        const slug = await uniqueSlug(slugify(title), env);
        const tags = JSON.stringify(extractTags(title + ' ' + item.description));
        const domain = safeDomain(item.link);
        const now = new Date().toISOString();
        const coverVariant = hash(title) % 6;

        await env.DB.prepare(`INSERT INTO articles (slug,title,excerpt,content,category,source_name,source_url,source_domain,published_at,discovered_at,status,score,cover_variant,tags) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
          .bind(slug, title, excerpt, content, category, source.name, item.link, domain, item.publishedAt, now, status, score, coverVariant, tags).run();
        inserted++;
        sourceInserted++;
        if (status === 'review') reviewed++;
      }
      await env.DB.prepare(`INSERT INTO ingestion_log (run_at,source_name,fetched,inserted,errors) VALUES (?,?,?,?,NULL)`).bind(new Date().toISOString(), source.name, fetched, sourceInserted).run();
    } catch (e) {
      const message = `${source.name}: ${e instanceof Error ? e.message : String(e)}`;
      errors.push(message);
      await env.DB.prepare(`INSERT INTO ingestion_log (run_at,source_name,fetched,inserted,errors) VALUES (?,?,?,?,?)`).bind(new Date().toISOString(), source.name, fetched, sourceInserted, message).run();
    }
  }
  return { inserted, reviewed, errors };
}

function parseFeed(xmlText: string): FeedItem[] {
  const blocks = [...xmlText.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)].map(m => m[0]);
  return blocks.map(block => {
    const title = tagValue(block, 'title');
    const link = attrValue(block, 'link', 'href') || tagValue(block, 'link') || tagValue(block, 'id');
    const description = tagValue(block, 'description') || tagValue(block, 'summary') || tagValue(block, 'content');
    const date = tagValue(block, 'pubDate') || tagValue(block, 'published') || tagValue(block, 'updated') || new Date().toISOString();
    return { title: decodeEntities(stripTags(title)), link: decodeEntities(link.trim()), description: decodeEntities(stripTags(description)), publishedAt: validDate(date) };
  }).filter(i => i.title && /^https?:\/\//.test(i.link));
}

function tagValue(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return m?.[1]?.replace(/^<!\[CDATA\[|\]\]>$/g, '') || '';
}
function attrValue(block: string, tag: string, attr: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*${attr}=["']([^"']+)["'][^>]*\/?>`, 'i'));
  return m?.[1] || '';
}
function isAiRelated(item: FeedItem): boolean { const t = `${item.title} ${item.description}`.toLowerCase(); return AI_TERMS.some(k => t.includes(k)); }
function hasRisk(item: FeedItem): boolean { const t = `${item.title} ${item.description}`.toLowerCase(); return RISK_TERMS.some(k => t.includes(k)); }
function scoreItem(item: FeedItem, source: FeedSource): number {
  let s = source.trust;
  const age = Date.now() - new Date(item.publishedAt).getTime();
  if (age < 86400000) s += 25; else if (age < 259200000) s += 15;
  if (item.description.length > 180) s += 15;
  if (AI_TERMS.filter(k => (`${item.title} ${item.description}`).toLowerCase().includes(k)).length >= 2) s += 15;
  if (item.title.length >= 25 && item.title.length <= 130) s += 10;
  return Math.min(s, 100);
}
function classifyCategory(text: string, fallback: string): string {
  const t = text.toLowerCase();
  if (/robot|robotics|humanoid/.test(t)) return 'Robotika';
  if (/open.source|github|hugging face|repository/.test(t)) return 'Open Source';
  if (/research|paper|benchmark|arxiv|study/.test(t)) return 'Riset';
  if (/regulation|law|policy|government|copyright/.test(t)) return 'Regulasi';
  if (/tool|app|feature|product|launch|release/.test(t)) return 'Produk & Tools';
  if (/business|investment|funding|revenue|enterprise/.test(t)) return 'Bisnis AI';
  return fallback;
}
function createExcerpt(description: string, title: string, source: string): string {
  const base = cleanText(description).replace(/\s+/g, ' ').trim();
  if (base.length >= 90) return truncate(base, 260);
  return `${source} mengumumkan perkembangan terbaru terkait “${title}”. Berikut ringkasan fakta utama dan konteksnya untuk pembaca Indonesia.`;
}
function createContent(title: string, excerpt: string, source: string, url: string, date: string): string {
  return JSON.stringify([
    `Kabar terbaru dari ${source} membahas ${title}.`,
    excerpt,
    `Informasi ini diterbitkan pada ${new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' }).format(new Date(date))}. Artikel di portal ini disusun sebagai ringkasan informatif dan tidak menggantikan publikasi asli.`,
    `Untuk detail teknis, kutipan lengkap, serta pembaruan lanjutan, pembaca disarankan membuka sumber utama: ${url}`
  ]);
}
function extractTags(text: string): string[] {
  const candidates = ['OpenAI','Google','Microsoft','Meta','Anthropic','NVIDIA','Hugging Face','LLM','Robotika','Machine Learning','Generative AI','AI Agent'];
  return candidates.filter(t => text.toLowerCase().includes(t.toLowerCase())).slice(0,5);
}
async function uniqueSlug(base: string, env: Env): Promise<string> {
  let slug = base || `berita-ai-${Date.now()}`;
  let n = 2;
  while (await env.DB.prepare('SELECT id FROM articles WHERE slug=?').bind(slug).first()) slug = `${base}-${n++}`;
  return slug;
}
function articlePage(a: Record<string, unknown>, related: Record<string, unknown>[], env: Env): string {
  const paragraphs = safeJsonArray(String(a.content));
  const tags = safeJsonArray(String(a.tags));
  const title = esc(String(a.title));
  const canonical = `${env.SITE_URL}/artikel/${a.slug}`;
  return shell(title, `
  <main class="article-wrap">
    <article class="article">
      <a class="category" href="/kategori/${encodeURIComponent(String(a.category))}">${esc(String(a.category))}</a>
      <h1>${title}</h1>
      <p class="lead">${esc(String(a.excerpt))}</p>
      <div class="meta">${formatDate(String(a.published_at))} · Sumber: <a rel="nofollow noopener" target="_blank" href="${escAttr(String(a.source_url))}">${esc(String(a.source_name))}</a></div>
      <div class="hero-cover v${Number(a.cover_variant)%6}"><span>AI</span><strong>${title}</strong></div>
      <div class="body">${paragraphs.map(p => `<p>${linkify(esc(p))}</p>`).join('')}</div>
      <div class="source-box"><strong>Transparansi sumber</strong><p>Artikel ini adalah ringkasan orisinal berdasarkan sumber primer. Baca publikasi lengkap di <a rel="nofollow noopener" target="_blank" href="${escAttr(String(a.source_url))}">${esc(String(a.source_domain))}</a>.</p></div>
      <div class="tags">${tags.map(t => `<span>${esc(t)}</span>`).join('')}</div>
    </article>
    <aside><h3>Berita terkait</h3>${related.map(r => `<a class="related" href="/artikel/${r.slug}"><strong>${esc(String(r.title))}</strong><small>${formatDate(String(r.published_at))}</small></a>`).join('')}</aside>
  </main>`, env, canonical, String(a.excerpt));
}
function categoryPage(category: string, articles: Record<string, unknown>[], env: Env): string {
  return shell(`Kategori ${category}`, `<main class="container"><div class="section-head"><div><span class="eyebrow">KATEGORI</span><h1>${esc(category)}</h1></div><a href="/">Kembali ke beranda</a></div><div class="grid">${articles.map(cardHtml).join('') || '<p>Belum ada artikel.</p>'}</div></main>`, env);
}
function cardHtml(a: Record<string, unknown>): string {
  return `<article class="card"><a class="thumb v${Number(a.cover_variant)%6}" href="/artikel/${a.slug}"><span>AI</span></a><div class="card-body"><a class="category" href="/kategori/${encodeURIComponent(String(a.category))}">${esc(String(a.category))}</a><h2><a href="/artikel/${a.slug}">${esc(String(a.title))}</a></h2><p>${esc(String(a.excerpt))}</p><div class="meta">${formatDate(String(a.published_at))} · ${esc(String(a.source_name))}</div></div></article>`;
}
function shell(title: string, body: string, env: Env, canonical = env.SITE_URL, description = 'Berita AI terbaru, ringkas, jelas, dan bersumber.'): string {
return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} — ${esc(env.SITE_NAME)}</title><meta name="description" content="${escAttr(description)}"><link rel="canonical" href="${escAttr(canonical)}"><meta property="og:title" content="${escAttr(title)}"><meta property="og:description" content="${escAttr(description)}"><meta property="og:type" content="article"><link rel="stylesheet" href="/styles.css"><script defer src="/app.js"></script></head><body><header><a class="brand" href="/"><span class="logo">AI</span><b>${esc(env.SITE_NAME)}</b></a><nav><a href="/kategori/Produk%20%26%20Tools">Produk</a><a href="/kategori/Riset">Riset</a><a href="/kategori/Open%20Source">Open Source</a><a href="/kategori/Robotika">Robotika</a></nav><button id="theme" aria-label="Ubah tema">◐</button></header>${body}<footer><b>${esc(env.SITE_NAME)}</b><p>Portal ringkasan berita AI berbahasa Indonesia. Selalu mencantumkan sumber asli.</p><a href="/rss.xml">RSS</a> · <a href="/sitemap.xml">Sitemap</a></footer></body></html>`;
}
function json(data: unknown, status=200): Response { return new Response(JSON.stringify(data), { status, headers: { 'content-type':'application/json; charset=utf-8','cache-control':'public, max-age=60' } }); }
function html(data: string): Response { return new Response(data, { headers: { 'content-type':'text/html; charset=utf-8','cache-control':'public, max-age=120' } }); }
function cleanText(s: string): string { return decodeEntities(stripTags(s)).replace(/\s+/g,' ').trim(); }
function stripTags(s: string): string { return s.replace(/<[^>]+>/g,' '); }
function decodeEntities(s: string): string { return s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&#x2F;/g,'/'); }
function slugify(s: string): string { return s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,90); }
function truncate(s:string,n:number):string { return s.length>n ? s.slice(0,n-1).replace(/\s+\S*$/,'')+'…' : s; }
function validDate(s:string):string { const d=new Date(s); return Number.isNaN(d.getTime())?new Date().toISOString():d.toISOString(); }
function safeDomain(url:string):string { try{return new URL(url).hostname.replace(/^www\./,'')}catch{return 'sumber asli'} }
function hash(s:string):number { let h=0; for(let i=0;i<s.length;i++) h=((h<<5)-h)+s.charCodeAt(i)|0; return Math.abs(h); }
function safeJsonArray(s:string):string[] { try{const v=JSON.parse(s); return Array.isArray(v)?v.map(String):[]}catch{return []} }
function formatDate(s:string):string { return new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Jakarta'}).format(new Date(s)); }
function esc(s:string):string { return s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!)); }
function escAttr(s:string):string { return esc(s); }
function xml(s:string):string { return esc(s); }
function linkify(s:string):string { return s.replace(/(https?:\/\/[^\s<]+)/g,'<a rel="nofollow noopener" target="_blank" href="$1">$1</a>'); }
async function adminToken(env:Env):Promise<string>{ const data=new TextEncoder().encode(env.SITE_NAME+env.SITE_URL); const digest=await crypto.subtle.digest('SHA-256',data); return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,32); }
