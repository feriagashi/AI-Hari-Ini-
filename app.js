const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date = s => new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Jakarta'}).format(new Date(s));

const saved = localStorage.getItem('theme');
if(saved) document.documentElement.dataset.theme = saved;
$('#theme')?.addEventListener('click',()=>{const n=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=n;localStorage.setItem('theme',n)});

function card(a){return `<article class="card"><a class="thumb v${Number(a.cover_variant)%6}" href="/artikel/${a.slug}"><span>AI</span></a><div class="card-body"><a class="category" href="/kategori/${encodeURIComponent(a.category)}">${esc(a.category)}</a><h2><a href="/artikel/${a.slug}">${esc(a.title)}</a></h2><p>${esc(a.excerpt)}</p><div class="meta">${date(a.published_at)} · ${esc(a.source_name)}</div></div></article>`}
async function load(q=''){
  const [all,feat]=await Promise.all([fetch('/api/articles?limit=18&q='+encodeURIComponent(q)).then(r=>r.json()),fetch('/api/featured').then(r=>r.json())]);
  $('#articles').innerHTML=all.articles.length?all.articles.map(card).join(''):'<p>Tidak ada berita yang cocok.</p>';
  const f=feat.articles||[];
  if(f.length){const hero=f[0];$('#featured').innerHTML=`<a class="feature-main v${Number(hero.cover_variant)%6}" href="/artikel/${hero.slug}"><span class="category">${esc(hero.category)}</span><h2>${esc(hero.title)}</h2><p>${esc(hero.excerpt)}</p><small>${date(hero.published_at)} · ${esc(hero.source_name)}</small></a><div class="feature-list">${f.slice(1).map(a=>`<a href="/artikel/${a.slug}"><span>${esc(a.category)}</span><strong>${esc(a.title)}</strong><small>${date(a.published_at)}</small></a>`).join('')}</div>`}
  else $('#featured').innerHTML='<div class="empty"><h2>Portal siap digunakan</h2><p>Jalankan proses ingestion untuk mengambil berita terbaru dari sumber resmi.</p><code>npm run dev</code><br><code>curl http://localhost:8787/__scheduled</code></div>';
}
$('#search')?.addEventListener('submit',e=>{e.preventDefault();load(new FormData(e.currentTarget).get('q')||'')});
load().catch(e=>{$('#articles').innerHTML='<p>Database belum diinisialisasi. Ikuti README untuk setup pertama.</p>';console.error(e)});
