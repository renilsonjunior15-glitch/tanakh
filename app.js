'use strict';
/* Tanakh de Estudo — PWA */

const API = 'https://bolls.life';
const HEB = 'WLCa'; // Westminster Leningrad Codex com vogais, acentos e números de Strong
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const BY_ID = Object.fromEntries(BOOKS.map(b => [b.id, b]));

/* ---------- armazenamento local ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem('tnk.' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('tnk.' + k, JSON.stringify(v)); } catch { /* sem armazenamento */ } },
};
const DEFAULTS = { trans: 'TB10', mode: 'inter', font: 24, translit: true, strong: false, teamim: true, foot: true, theme: 'auto', order: 'tanakh' };
const S = {
  settings: { ...DEFAULTS, ...store.get('settings', {}) },
  pos: store.get('pos', { b: 1, c: 1 }),
  bookmarks: store.get('bookmarks', []),
  notes: store.get('notes', {}),
};
const save = k => store.set(k, S[k]);
let startedReading = !!store.get('pos', null);

/* ---------- utilidades ---------- */
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const ref = (b, c, v) => `${BY_ID[b].name} ${c}${v ? ':' + v : ''}`;
const refShort = (b, c, v) => `${BY_ID[b].abbr} ${c}${v ? ':' + v : ''}`;

let toastTimer;
function toast(msg, ms = 2200) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

const memo = new Map();
async function fetchJSON(url) {
  if (memo.has(url)) return memo.get(url);
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    if (memo.size > 300) memo.delete(memo.keys().next().value);
    memo.set(url, data);
    return data;
  } finally { clearTimeout(timer); }
}
const getPt = (b, c, t = S.settings.trans) => fetchJSON(`${API}/get-text/${t}/${b}/${c}/`);
const getHeb = (b, c) => fetchJSON(`${API}/get-text/${HEB}/${b}/${c}/`);

/* ---------- versificação (português ↔ hebraico) ---------- */
function ptToHeb(b, c, v) {
  for (const r of VERSIFICATION) if (r[0] === b && r[1] === c && v >= r[2] && v <= r[3]) return [r[4], r[5] + (v - r[2])];
  return [c, v];
}
function hebToPt(b, hc, hv) {
  for (const r of VERSIFICATION) if (r[0] === b && r[4] === hc && hv >= r[5] && hv <= r[5] + (r[3] - r[2])) return [r[1], r[2] + (hv - r[5])];
  return [hc, hv];
}

/* ---------- texto hebraico ---------- */
function parseHeb(text) {
  const t = text.replace(/<(?!\/?S>)[^>]*>/g, ' ');
  const out = []; const re = /([^<]*)((?:<S>\d+<\/S>)*)/g; let m;
  while ((m = re.exec(t)) && m[0] !== '') {
    const s = [...m[2].matchAll(/<S>(\d+)<\/S>/g)].map(x => +x[1]);
    const parts = m[1].trim().split(/\s+/).filter(Boolean);
    if (parts.length) parts.forEach((p, i) => out.push({ w: p, s: i === parts.length - 1 ? s : [] }));
    else if (s.length && out.length) out[out.length - 1].s.push(...s);
  }
  return out;
}
const stripTeamim = w => w.replace(/[֑-ֽ֯]/g, '');
const stripNiqqud = w => w.replace(/[֑-ׇ]/g, '');

// Transliteração aproximada (sefardita moderna simplificada)
const CONS = { 'א': '', 'ב': 'v', 'ג': 'g', 'ד': 'd', 'ה': 'h', 'ו': 'v', 'ז': 'z', 'ח': 'ch', 'ט': 't', 'י': 'y', 'כ': 'kh', 'ך': 'kh', 'ל': 'l', 'מ': 'm', 'ם': 'm', 'נ': 'n', 'ן': 'n', 'ס': 's', 'ע': '‘', 'פ': 'f', 'ף': 'f', 'צ': 'ts', 'ץ': 'ts', 'ק': 'q', 'ר': 'r', 'ש': 'sh', 'ת': 't' };
const HARD = { 'ב': 'b', 'כ': 'k', 'ך': 'k', 'פ': 'p', 'ף': 'p' };
const VOW = { 'ַ': 'a', 'ָ': 'a', 'ֶ': 'e', 'ֵ': 'e', 'ִ': 'i', 'ֹ': 'o', 'ֺ': 'o', 'ֻ': 'u', 'ֲ': 'a', 'ֱ': 'e', 'ֳ': 'o', 'ׇ': 'o' };
const vowelOf = m => { for (const ch of m) if (VOW[ch]) return VOW[ch]; return ''; };
function translit(word, strongs = []) {
  if (strongs.includes(3068) || strongs.includes(3069)) {
    const pre = translit(word.replace(/[י][֑-ׇ]*[ה][֑-ׇ]*[ו][֑-ׇ]*[ה][֑-ׇ]*$/, ''));
    return (pre ? pre + '-' : '') + 'YHWH';
  }
  const w = word.replace(/[֑-ֽֿ֯׀׃׆]/g, '').replace(/־/g, '-');
  const L = [];
  for (const ch of w) {
    if (/[א-ת]/.test(ch)) L.push({ c: ch, m: '' });
    else if (/[ְ-ׇ]/.test(ch) && L.length && !L[L.length - 1].o) L[L.length - 1].m += ch;
    else L.push({ c: ch, m: '', o: true });
  }
  let out = '';
  for (let i = 0; i < L.length; i++) {
    const x = L[i]; if (x.o) { out += x.c; continue; }
    const prev = L[i - 1], next = L[i + 1];
    const start = !prev || prev.o, last = !next || next.o;
    const dag = x.m.includes('ּ'), shva = x.m.includes('ְ');
    const vow = vowelOf(x.m.replace('ֹ', x.c === 'ו' ? '' : 'ֹ'));
    const prevVow = prev && !prev.o && vowelOf(prev.m);
    if (x.c === 'ו') {
      if (dag && !vow && !shva && (start || !prevVow)) { out += 'u'; continue; }
      if (x.m.includes('ֹ') && !start && !prevVow) { out += 'o'; continue; }
      if (x.m.includes('ֹ')) { out += 'vo'; continue; }
    }
    if (x.c === 'י' && !vow && !shva && !dag && !start && /[ie]$/.test(out)) {
      if (/i$/.test(out)) continue;
      out += 'i'; continue;
    }
    if (x.c === 'א' && !vow && !shva) continue;
    let c = (dag && HARD[x.c]) || CONS[x.c];
    if (x.c === 'ש') c = x.m.includes('ׂ') ? 's' : 'sh';
    if (start && x.c === 'ע') c = '';
    if (last && x.m.includes('ַ') && (x.c === 'ח' || x.c === 'ע' || (x.c === 'ה' && dag))) { out += 'a' + c; continue; }
    out += c;
    if (vow) out += vow;
    else if (shva && !last) {
      const prevShva = prev && !prev.o && prev.m.includes('ְ');
      if (start || prevShva || dag) out += 'e';
    }
  }
  return out.replace(/-$/, '');
}

function cleanPt(t) {
  const s = t.replace(/<sup>[\s\S]*?<\/sup>/gi, '').replace(/<S>\d+<\/S>/g, '').replace(/<\/?br\s*\/?>/gi, '<br>')
    .replace(/<(?!\/?(?:i|b|br)>)[^>]*>/gi, '');
  return esc(s).replace(/&lt;(\/?(?:i|b|br))&gt;/gi, '<$1>').replace(/(<br>\s*)+$/, '').trim();
}

/* ---------- carregamento de capítulo ---------- */
async function loadChapter(b, c) {
  const [pt, mainHeb] = await Promise.all([getPt(b, c).catch(() => []), getHeb(b, c).catch(() => null)]);
  let pairs = pt.map(x => ({ v: x.verse, pt: x.text, h: [ptToHeb(b, c, x.verse)] }));
  const hData = {};
  if (mainHeb) hData[c] = new Map(mainHeb.map(x => [x.verse, x.text]));
  if (!pairs.length) {
    if (!mainHeb) throw new Error('offline');
    pairs = mainHeb.map(x => ({ v: x.verse, pt: '', h: [[c, x.verse]] }));
  }
  const need = [...new Set(pairs.flatMap(p => p.h.map(h => h[0])))].filter(hc => !hData[hc]);
  await Promise.all(need.map(async hc => {
    try { const arr = await getHeb(b, hc); hData[hc] = new Map(arr.map(x => [x.verse, x.text])); } catch { /* ignora */ }
  }));
  if (b === 19 && hData[c]) { // Salmos: o título conta como versículo no hebraico
    const off = hData[c].size - pairs.length;
    if (off > 0 && off <= 3) {
      pairs.forEach(p => { p.h = [[c, p.v + off]]; });
      pairs[0].h = Array.from({ length: off + 1 }, (_, i) => [c, i + 1]);
    }
  }
  pairs.forEach(p => { p.h = p.h.map(([hc, hv]) => ({ hc, hv, text: hData[hc] && hData[hc].get(hv) })).filter(h => h.text != null); });
  if (!pt.length && !mainHeb) throw new Error('offline');
  return pairs;
}

/* ---------- leitor ---------- */
let current = null; // {b, c, pairs}
let readSeq = 0;
let loading = false;

async function openChapter(b, c, v = null, { push = true } = {}) {
  const book = BY_ID[b]; if (!book) return;
  c = Math.max(1, Math.min(c, book.chapters));
  S.pos = { b, c, v: v || null }; save('pos'); startedReading = true;
  updateTitle();
  const seq = ++readSeq;
  const reader = $('#reader');
  const need = !(current && current.b === b && current.c === c && current.trans === S.settings.trans);
  if (need) loading = true;
  if (push && location.hash !== '#ler') location.hash = '#ler'; else showView('ler');
  if (need) {
    reader.innerHTML = `<div class="loading"><div class="spinner"></div>Carregando ${esc(ref(b, c))}…</div>`;
    try {
      const pairs = await loadChapter(b, c);
      if (seq !== readSeq) return;
      current = { b, c, pairs, trans: S.settings.trans };
      loading = false;
    } catch (e) {
      if (seq !== readSeq) return;
      loading = false;
      reader.innerHTML = `<div class="empty">Não foi possível carregar ${esc(ref(b, c))}.<br>Verifique sua conexão — capítulos já abertos funcionam offline.<br><br><button class="btn primary" id="retryBtn">Tentar de novo</button></div>`;
      $('#retryBtn').onclick = () => openChapter(b, c, v, { push: false });
      return;
    }
    renderReader();
  }
  if (v) {
    const el = document.getElementById('v-' + v);
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1800); }
  } else window.scrollTo(0, 0);
}

function renderReader() {
  if (!current) return;
  const { b, c, pairs } = current;
  const book = BY_ID[b];
  const st = S.settings;
  const seen = new Set(); const foots = [];
  const marks = new Set(S.bookmarks.filter(x => x.b === b && x.c === c).map(x => x.v));
  const transName = (TRANSLATIONS.find(t => t[0] === st.trans) || [, st.trans])[1];
  let html = `<div class="chapter-head"><span class="he">${book.he}</span><h2>${esc(book.name)} ${c}</h2><small>${esc(book.tr)} · ${esc(transName)}</small></div>`;
  for (const p of pairs) {
    let heb = '', tl = [];
    for (const h of p.h) {
      const label = (h.hc !== c || h.hv !== p.v) ? `<span class="pt-label" style="display:block;direction:ltr;text-align:left">Hebraico ${h.hc}:${h.hv}</span>` : '';
      const toks = parseHeb(h.text);
      let words = '';
      for (const t of toks) {
        const shown = st.teamim ? t.w : stripTeamim(t.w);
        if (!t.s.length) { words += `<span class="w plain">${shown}</span> `; continue; }
        let sup = '';
        if (st.foot) {
          const key = t.s.find(n => NOTES[n] && !seen.has(n));
          if (key) { seen.add(key); foots.push({ n: key, v: p.v, w: stripTeamim(t.w) }); sup = `<sup>${footLetter(foots.length - 1)}</sup>`; }
        }
        const tr = translit(t.w, t.s);
        if (st.translit) tl.push(tr);
        if (st.mode === 'inter') {
          words += `<button class="w" data-s="${t.s.join(',')}" data-w="${esc(t.w)}"><span>${shown}${sup}</span>${st.translit ? `<span class="t">${esc(tr)}</span>` : ''}${st.strong ? `<span class="s">H${t.s.join(' H')}</span>` : ''}</button>`;
        } else {
          words += `<button class="w" data-s="${t.s.join(',')}" data-w="${esc(t.w)}">${shown}${sup}</button> `;
        }
      }
      heb += label + `<div class="heb ${st.mode === 'inter' ? 'inter' : ''}">${words}</div>`;
    }
    if (st.mode !== 'inter' && st.translit && tl.length) heb += `<div class="translit-line">${esc(tl.join(' '))}</div>`;
    const note = S.notes[`${b}:${c}:${p.v}`];
    html += `<article class="verse" id="v-${p.v}">
      <div class="vhead"><button class="vnum" data-v="${p.v}">${p.v}</button><span class="vref">${esc(refShort(b, c, p.v))}</span>${marks.has(p.v) ? '<span class="vmark">🔖</span>' : ''}</div>
      ${heb || '<div class="muted">(sem texto hebraico correspondente)</div>'}
      ${p.pt ? `<div class="pt">${cleanPt(p.pt)}</div>` : ''}
      ${note ? `<div class="usernote">📝 ${esc(note)}</div>` : ''}
    </article>`;
  }
  if (foots.length) {
    html += `<section class="footnotes"><h3>Notas de rodapé</h3><ol>${foots.map((f, i) =>
      `<li data-n="${f.n}" data-w="${esc(f.w)}"><span class="fn-mark">${footLetter(i)}</span> <b>v. ${f.v}</b> — <span class="fhe">${f.w}</span> <i>${esc(NOTES[f.n][0])}</i> (H${f.n}): ${esc(NOTES[f.n][1])}</li>`).join('')}</ol></section>`;
  }
  const prev = prevChapter(b, c), next = nextChapter(b, c);
  html += `<div class="chapter-nav">
    ${prev ? `<button class="btn" data-go="${prev.join(',')}">← ${esc(refShort(...prev))}</button>` : '<span></span>'}
    ${next ? `<button class="btn" data-go="${next.join(',')}">${esc(refShort(...next))} →</button>` : '<span></span>'}
  </div>`;
  $('#reader').innerHTML = html;
}
const footLetter = i => 'abcdefghijklmnopqrstuvwxyz'[i % 26] + (i >= 26 ? Math.floor(i / 26) : '');

function prevChapter(b, c) { if (c > 1) return [b, c - 1]; if (b > 1) return [b - 1, BY_ID[b - 1].chapters]; return null; }
function nextChapter(b, c) { if (c < BY_ID[b].chapters) return [b, c + 1]; if (b < 39) return [b + 1, 1]; return null; }

function updateTitle() { $('#titleText').textContent = ref(S.pos.b, S.pos.c); }

/* ---------- painel de palavra (léxico) ---------- */
function sanitizeDef(html) {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const ALLOW = new Set(['B', 'P', 'OL', 'UL', 'LI', 'I', 'EM', 'BR', 'SUP', 'SUB']);
  const walk = node => {
    const frag = document.createDocumentFragment();
    for (const n of node.childNodes) {
      if (n.nodeType === 3) { frag.appendChild(document.createTextNode(n.textContent)); continue; }
      if (n.nodeType !== 1) continue;
      const tag = n.tagName;
      let el;
      if (tag === 'A') {
        const m = (n.getAttribute('href') || '').match(/^S:H(\d+)/);
        el = document.createElement(m ? 'a' : 'span');
        if (m) el.dataset.strong = m[1];
      } else if (tag === 'HE') { el = document.createElement('span'); el.className = 'he'; }
      else if (ALLOW.has(tag)) { el = document.createElement(tag.toLowerCase()); if (tag === 'OL' && n.getAttribute('type') === 'a') el.setAttribute('type', 'a'); }
      else el = document.createElement('span');
      el.appendChild(walk(n));
      frag.appendChild(el);
    }
    return frag;
  };
  const box = document.createElement('div'); box.appendChild(walk(doc.body.firstChild)); return box.innerHTML;
}

async function openWord(word, strongs) {
  const tr = translit(word, strongs);
  const body = `<div class="lex-word">${stripTeamim(word)}</div>
    <div class="lex-sub">${esc(tr)} ${strongs.map(n => `· <b>H${n}</b>`).join(' ')}</div>
    ${strongs.map(n => `<div data-lex="${n}">${NOTES[n] ? `<div class="lex-card pt-note"><h4>Nota de estudo · ${esc(NOTES[n][0])}</h4>${esc(NOTES[n][1])}</div>` : ''}<div class="lex-card"><div class="spinner"></div></div></div>`).join('')}`;
  openSheet(body);
  for (const n of strongs) {
    const box = $(`[data-lex="${n}"] .lex-card:last-child`, $('#sheetBody'));
    try {
      const arr = await fetchJSON(`${API}/dictionary-definition/BDBT/H${n}`);
      const d = (arr || []).find(x => x.topic === 'H' + n) || (arr || [])[0];
      if (!d) throw new Error('sem dados');
      if (!word && strongs.length === 1) {
        $('.lex-word', $('#sheetBody')).textContent = d.lexeme || '';
        $('.lex-sub', $('#sheetBody')).innerHTML = `${esc(d.transliteration || '')} · <b>H${n}</b>`;
      }
      const plain = new DOMParser().parseFromString(d.definition || '', 'text/html').body.textContent;
      const gt = `https://translate.google.com/?sl=en&tl=pt&op=translate&text=${encodeURIComponent((d.short_definition + '\n\n' + plain).slice(0, 1800))}`;
      box.innerHTML = `<h4>Léxico (Strong H${n} · BDB)</h4>
        <div class="lex-def">
          <div><span class="he" style="font-size:26px">${esc(d.lexeme || '')}</span> &nbsp; <i>${esc(d.transliteration || '')}</i> · <span class="muted">pronúncia: ${esc(d.pronunciation || '')}</span></div>
          <p><b>Sentido básico (inglês):</b> ${esc(d.short_definition || '')}</p>
          ${sanitizeDef(d.definition || '')}
        </div>
        <div class="sheet-actions"><a class="btn" href="${gt}" target="_blank" rel="noopener">Traduzir definição</a><button class="btn" data-hsearch="${esc(stripNiqqud(d.lexeme || word))}">Buscar no Tanakh</button></div>`;
    } catch {
      box.innerHTML = `<h4>Léxico (Strong H${n})</h4><span class="muted">Definição indisponível offline. Abra com internet uma vez para salvar.</span>`;
    }
  }
}

/* ---------- painel de versículo ---------- */
function openVerse(v) {
  const { b, c } = S.pos;
  const marked = S.bookmarks.some(x => x.b === b && x.c === c && x.v === v);
  openSheet(`<h3>${esc(ref(b, c, v))}</h3>
    <div class="sheet-actions">
      <button class="btn" data-act="mark">${marked ? '🔖 Remover marcador' : '🔖 Marcar'}</button>
      <button class="btn" data-act="note">📝 ${S.notes[`${b}:${c}:${v}`] ? 'Editar nota' : 'Adicionar nota'}</button>
      <button class="btn" data-act="copy">📋 Copiar</button>
      <button class="btn" data-act="share">📤 Compartilhar</button>
    </div>`);
  $('#sheetBody').onclick = async e => {
    const act = e.target.closest('[data-act]')?.dataset.act; if (!act) return;
    if (act === 'mark') {
      if (marked) S.bookmarks = S.bookmarks.filter(x => !(x.b === b && x.c === c && x.v === v));
      else S.bookmarks.unshift({ b, c, v, t: Date.now() });
      save('bookmarks'); closeSheet(); renderReader(); toast(marked ? 'Marcador removido' : 'Versículo marcado');
    } else if (act === 'note') {
      openNoteEditor(b, c, v);
    } else {
      const text = verseText(v);
      if (act === 'copy') {
        try { await navigator.clipboard.writeText(text); toast('Copiado'); } catch { toast('Não foi possível copiar'); }
        closeSheet();
      } else {
        if (navigator.share) { try { await navigator.share({ text }); } catch { /* cancelado */ } }
        else { try { await navigator.clipboard.writeText(text); toast('Copiado para compartilhar'); } catch { /* */ } }
        closeSheet();
      }
    }
  };
}
function verseText(v) {
  const p = current.pairs.find(x => x.v === v); if (!p) return '';
  const heb = p.h.map(h => parseHeb(h.text).map(t => stripTeamim(t.w)).join(' ')).join(' ');
  const pt = new DOMParser().parseFromString(cleanPt(p.pt), 'text/html').body.textContent;
  return `${heb}\n${pt}\n— ${ref(current.b, current.c, v)} (${S.settings.trans})`;
}
function openNoteEditor(b, c, v) {
  const key = `${b}:${c}:${v}`;
  $('#sheetBody').onclick = null;
  $('#sheetBody').innerHTML = `<h3>Nota — ${esc(ref(b, c, v))}</h3>
    <textarea id="noteText" placeholder="Escreva sua anotação de estudo…">${esc(S.notes[key] || '')}</textarea>
    <div class="sheet-actions"><button class="btn" id="noteDel">Apagar</button><button class="btn primary" id="noteSave">Salvar</button></div>`;
  $('#noteText').focus();
  $('#noteSave').onclick = () => {
    const t = $('#noteText').value.trim();
    if (t) S.notes[key] = t; else delete S.notes[key];
    save('notes'); closeSheet(); if (current && current.b === b && current.c === c) renderReader(); toast('Nota salva');
  };
  $('#noteDel').onclick = () => { delete S.notes[key]; save('notes'); closeSheet(); if (current) renderReader(); renderSaved(); };
}

/* ---------- sheet / drawer (com botão voltar do Android) ---------- */
let overlay = null;
function openOverlay(kind) {
  if (overlay) closeOverlayUI();
  overlay = kind; history.pushState({ overlay: kind }, '');
}
function closeOverlayUI() {
  $('#sheet').classList.remove('open'); $('#sheetScrim').classList.remove('open');
  $('#drawer').classList.remove('open'); $('#drawerScrim').classList.remove('open');
  $('#drawer').setAttribute('aria-hidden', 'true');
  $$('.w.sel').forEach(x => x.classList.remove('sel'));
  overlay = null;
}
let afterPop = null;
function closeOverlay(then) {
  if (overlay && history.state && history.state.overlay) { afterPop = typeof then === 'function' ? then : null; history.back(); }
  else { closeOverlayUI(); if (typeof then === 'function') then(); }
}
function openSheet(html) {
  $('#sheetBody').onclick = null;
  $('#sheetBody').innerHTML = html; $('#sheet').scrollTop = 0;
  if (overlay !== 'sheet') openOverlay('sheet');
  $('#sheet').classList.add('open'); $('#sheetScrim').classList.add('open');
}
const closeSheet = closeOverlay;
function openDrawer() { openOverlay('drawer'); $('#drawer').classList.add('open'); $('#drawerScrim').classList.add('open'); $('#drawer').setAttribute('aria-hidden', 'false'); }
window.addEventListener('popstate', () => {
  if (overlay) closeOverlayUI();
  if (afterPop) { const f = afterPop; afterPop = null; setTimeout(f, 0); }
});

/* ---------- views ---------- */
const VIEWS = ['inicio', 'ler', 'livros', 'buscar', 'salvos', 'ajustes', 'sobre'];
function showView(name) {
  if (!VIEWS.includes(name)) name = 'inicio';
  if (name === 'inicio') renderHome();
  $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
  $$('.bottomnav a').forEach(a => a.classList.toggle('on', a.dataset.view === name));
  $('.top-actions').style.visibility = name === 'ler' ? 'visible' : 'hidden';
  if (name === 'livros') renderBooks();
  if (name === 'salvos') renderSaved();
  if (name === 'ajustes') renderSettings();
  if (name === 'ler' && !loading && !(current && current.b === S.pos.b && current.c === S.pos.c && current.trans === S.settings.trans)) openChapter(S.pos.b, S.pos.c, null, { push: false });
  if (name !== 'ler') window.scrollTo(0, 0);
}
window.addEventListener('hashchange', () => { if (overlay) closeOverlayUI(); showView(location.hash.slice(1)); });

/* ---------- início: frase do dia, devocional, continuar leitura ---------- */
function renderHome() {
  const now = new Date(), h = now.getHours();
  const greet = h < 5 ? 'Boa madrugada' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  $('#homeDate').textContent = `${greet} · ${now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}`;
  $('#continueLabel').textContent = startedReading ? 'Continuar leitura' : 'Começar a leitura';
  $('#continueRef').textContent = ref(S.pos.b, S.pos.c, S.pos.v);

  const [b, c, v, title, text, hw, htr, hmean, q] = DAILY[dayIndex()];
  const box = $('#dailyVerse');
  $('#devo').innerHTML = `<h3>${esc(title)}</h3>
    <p>${esc(text)}</p>
    <div class="devo-word"><span class="he">${hw}</span><div><b>${esc(htr)}</b><br><span>${esc(hmean)}</span></div></div>
    <div class="devo-q"><b>Para refletir</b><p>${esc(q)}</p></div>
    <button class="btn" data-go="${b},${c},${v}">Ler ${esc(ref(b, c))} no contexto</button>`;
  if (box.dataset.day === String(dayIndex()) && box.dataset.trans === S.settings.trans && box.querySelector('.dv-pt')) return;
  box.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  loadChapter(b, c).then(pairs => {
    const p = pairs.find(x => x.v === v);
    if (!p) throw new Error('verso');
    const heb = p.h.map(x => parseHeb(x.text).map(t => stripTeamim(t.w)).join(' ')).join(' ');
    box.dataset.day = String(dayIndex()); box.dataset.trans = S.settings.trans;
    box.innerHTML = `<div class="dv-label">Frase do dia · ${esc(ref(b, c, v))}</div>
      <div class="dv-he he">${heb}</div>
      <div class="dv-pt">${cleanPt(p.pt)}</div>
      <div class="btn-row"><button class="btn" data-go="${b},${c},${v}">Ler no contexto</button><button class="btn" id="dvCopy">Copiar</button></div>`;
    $('#dvCopy').onclick = async () => {
      const txt = `${heb}\n${new DOMParser().parseFromString(cleanPt(p.pt), 'text/html').body.textContent}\n— ${ref(b, c, v)}`;
      try { await navigator.clipboard.writeText(txt); toast('Copiado'); } catch { toast('Não foi possível copiar'); }
    };
  }).catch(() => {
    box.innerHTML = `<div class="dv-label">Frase do dia · ${esc(ref(b, c, v))}</div><p class="muted">Não foi possível carregar o texto agora.</p><div class="btn-row"><button class="btn" id="dvRetry">Tentar de novo</button><button class="btn" data-go="${b},${c},${v}">Abrir versículo</button></div>`;
    $('#dvRetry').onclick = () => { memo.clear(); renderHome(); };
  });
}
$('#continueBtn').addEventListener('click', () => openChapter(S.pos.b, S.pos.c, S.pos.v || null));

// guarda o versículo visível para "continuar leitura" voltar exatamente onde parou
let posTimer;
window.addEventListener('scroll', () => {
  clearTimeout(posTimer);
  posTimer = setTimeout(() => {
    if (!$('#view-ler').classList.contains('active') || !current || current.b !== S.pos.b || current.c !== S.pos.c) return;
    const limit = 90;
    const all = $$('#reader .verse');
    const el = all.find(x => x.getBoundingClientRect().bottom > limit) || all[all.length - 1];
    const v = el ? +el.id.slice(2) : null;
    if (v !== (S.pos.v || null)) { S.pos.v = v === 1 ? null : v; save('pos'); }
  }, 250);
}, { passive: true });

/* ---------- livros → capítulo → versículo ---------- */
let pick = { b: null, c: null };
async function renderBooks() {
  const body = $('#booksBody');
  $$('#orderSeg button').forEach(x => x.classList.toggle('on', x.dataset.order === S.settings.order));
  $('#orderSeg').hidden = !!pick.b;
  if (!pick.b) {
    $('#booksTitle').textContent = 'Livros';
    if (S.settings.order === 'tanakh') {
      body.innerHTML = ['T', 'N', 'K'].map(sec => {
        const list = BOOKS.filter(b => b.sec === sec).sort((a, z) => a.tanakh - z.tanakh);
        return `<div class="sec-title" id="sec-${sec}"><b>${SECTIONS[sec].name}</b><span class="he">${SECTIONS[sec].he}</span><small>${SECTIONS[sec].desc}</small></div><div class="book-grid">${list.map(bookCard).join('')}</div>`;
      }).join('');
    } else {
      const groups = [['Pentateuco', 1, 5], ['Livros históricos', 6, 17], ['Livros poéticos', 18, 22], ['Profetas maiores', 23, 27], ['Profetas menores', 28, 39]];
      body.innerHTML = groups.map(([n, a, z]) => `<div class="sec-title"><b>${n}</b></div><div class="book-grid">${BOOKS.filter(b => b.id >= a && b.id <= z).map(bookCard).join('')}</div>`).join('');
    }
    return;
  }
  const book = BY_ID[pick.b];
  $('#booksTitle').textContent = book.name;
  if (!pick.c) {
    body.innerHTML = `<div class="crumb"><button class="btn" data-back="books">← Livros</button><span class="he" style="font-size:22px;color:var(--gold)">${book.he}</span><span class="muted">${esc(book.tr)} · ${book.chapters} capítulo${book.chapters > 1 ? 's' : ''}</span></div>
      <div class="hint">Escolha o capítulo</div>
      <div class="num-grid">${Array.from({ length: book.chapters }, (_, i) => `<button data-ch="${i + 1}" class="${S.pos.b === book.id && S.pos.c === i + 1 ? 'cur' : ''}">${i + 1}</button>`).join('')}</div>`;
    return;
  }
  body.innerHTML = `<div class="crumb"><button class="btn" data-back="chapters">← ${esc(book.name)}</button><b>Capítulo ${pick.c}</b></div>
    <button class="btn primary" data-read="1" style="width:100%;margin:8px 0">Ler capítulo inteiro</button>
    <div class="hint">ou escolha o versículo</div><div class="num-grid" id="verseGrid"><div class="loading" style="grid-column:1/-1"><div class="spinner"></div></div></div>`;
  try {
    const pt = await getPt(pick.b, pick.c);
    let count = pt.length;
    if (!count) count = (await getHeb(pick.b, pick.c)).length;
    if (!$('#verseGrid')) return;
    $('#verseGrid').innerHTML = Array.from({ length: count }, (_, i) => `<button data-vs="${i + 1}">${i + 1}</button>`).join('');
  } catch {
    if ($('#verseGrid')) $('#verseGrid').innerHTML = '<div class="muted" style="grid-column:1/-1">Sem conexão — toque em "Ler capítulo inteiro".</div>';
  }
}
const bookCard = b => `<button class="book ${S.pos.b === b.id ? 'cur' : ''}" data-book="${b.id}"><span class="he">${b.he}</span><b>${esc(b.name)}</b><small>${esc(b.tr)} · ${b.chapters} cap.</small></button>`;

$('#booksBody').addEventListener('click', e => {
  const t = e.target.closest('button'); if (!t) return;
  if (t.dataset.book) { pick = { b: +t.dataset.book, c: null }; renderBooks(); window.scrollTo(0, 0); }
  else if (t.dataset.ch) { pick.c = +t.dataset.ch; renderBooks(); window.scrollTo(0, 0); }
  else if (t.dataset.vs) { const p = { ...pick }; pick = { b: null, c: null }; openChapter(p.b, p.c, +t.dataset.vs); }
  else if (t.dataset.read) { const p = { ...pick }; pick = { b: null, c: null }; openChapter(p.b, p.c); }
  else if (t.dataset.back === 'books') { pick = { b: null, c: null }; renderBooks(); }
  else if (t.dataset.back === 'chapters') { pick.c = null; renderBooks(); }
});
$('#orderSeg').addEventListener('click', e => {
  const o = e.target.closest('[data-order]')?.dataset.order; if (!o) return;
  S.settings.order = o; save('settings'); renderBooks();
});

/* ---------- referência e busca ---------- */
const EXTRA = {
  gen: 1, genesis: 1, ex: 2, exo: 2, exodo: 2, lev: 3, num: 4, deut: 5, deu: 5, jos: 6, josue: 6, juizes: 7, jui: 7, rute: 8, rut: 8,
  '1samuel': 9, '1sam': 9, '1s': 9, '2samuel': 10, '2sam': 10, '2s': 10, '1reis': 11, '1re': 11, '1r': 11, '2reis': 12, '2re': 12, '2r': 12,
  '1cronicas': 13, '1cro': 13, '2cronicas': 14, '2cro': 14, esd: 15, esdras: 15, nee: 16, neemias: 16, est: 17, ester: 17, job: 18, jo: 18,
  sal: 19, salmo: 19, salmos: 19, sl: 19, ps: 19, prov: 20, pr: 20, ecl: 21, ecle: 21, cantares: 22, cantico: 22, canticos: 22, cant: 22, ct: 22,
  isa: 23, isaias: 23, jer: 24, jeremias: 24, lam: 25, eze: 26, ezeq: 26, dan: 27, oseias: 28, ose: 28, oseas: 28, joe: 29, amos: 30, obd: 31, abdias: 31,
  jon: 32, jonas: 32, miq: 33, miqueias: 33, nau: 34, naum: 34, hab: 35, habacuc: 35, sof: 36, ageu: 37, zac: 38, mal: 39,
};
const ALIASES = {};
BOOKS.forEach(b => { [b.name, b.abbr, b.tr].forEach(n => { ALIASES[norm(n).replace(/[\s']/g, '')] = b.id; }); });
Object.assign(ALIASES, EXTRA);

function parseRef(q) {
  const s = norm(q).replace(/[.]/g, ' ').replace(/\s+/g, ' ').trim();
  const m = s.match(/^([1-3]?\s?[a-z][a-z' ]*?)\s*(\d+)?(?:\s*[:,. ]\s*(\d+))?(?:\s*-\s*\d+)?$/);
  if (!m) return null;
  const key = m[1].replace(/[\s']/g, '');
  let id = ALIASES[key];
  if (!id && m[2] && key.length >= 2) {
    const hit = BOOKS.find(b => norm(b.name).replace(/\s/g, '').startsWith(key) || norm(b.tr).replace(/[\s']/g, '').startsWith(key));
    id = hit && hit.id;
  }
  if (!id) return null;
  const c = m[2] ? +m[2] : 1;
  if (c < 1 || c > BY_ID[id].chapters) return null;
  return { b: id, c, v: m[3] ? +m[3] : null };
}

async function doSearch(q) {
  q = q.trim(); if (!q) return;
  const r = parseRef(q);
  if (r) { openChapter(r.b, r.c, r.v); return; }
  const box = $('#searchResults');
  if (location.hash !== '#buscar') location.hash = '#buscar';
  $('#searchInput').value = q;
  const isHeb = /[֐-׿]/.test(q);
  const trans = isHeb ? (/[ְ-ׇ]/.test(q) ? 'WLC' : 'WLCC') : S.settings.trans;
  box.innerHTML = '<div class="loading"><div class="spinner"></div>Buscando…</div>';
  try {
    const data = await fetchJSON(`${API}/v2/find/${trans}?search=${encodeURIComponent(q)}&match_case=false&match_whole=false&limit=300&page=1`);
    const res = (data.results || []).filter(x => x.book <= 39);
    if (!res.length) { box.innerHTML = `<div class="empty">Nenhum resultado para “${esc(q)}”.</div>`; return; }
    const hl = new RegExp(esc(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    box.innerHTML = `<p class="hint">${res.length} resultado(s) no Tanakh${isHeb ? ' (texto hebraico)' : ' · ' + esc(trans)}</p>` + res.map(x => {
      const [c, v] = isHeb ? hebToPt(x.book, x.chapter, x.verse) : [x.chapter, x.verse];
      const txt = isHeb ? esc(stripTeamim(x.text.replace(/<[^>]+>/g, ''))) : cleanPt(x.text).replace(/(^|>)([^<]+)/g, (m0, a, t) => a + t.replace(hl, s => `<mark>${s}</mark>`));
      return `<button class="result" data-go="${x.book},${c},${v}"><b>${esc(ref(x.book, c, v))}</b><div class="txt ${isHeb ? 'he' : ''}">${txt}</div></button>`;
    }).join('');
  } catch {
    box.innerHTML = '<div class="empty">A busca por palavras precisa de internet.<br>Referências (ex.: Sl 23:1) funcionam offline.</div>';
  }
}
$('#searchForm').addEventListener('submit', e => { e.preventDefault(); $('#searchInput').blur(); doSearch($('#searchInput').value); });
$('#searchChips').addEventListener('click', e => { const q = e.target.closest('[data-q]')?.dataset.q; if (q) doSearch(q); });
$('#drawerGo').addEventListener('submit', e => {
  e.preventDefault(); const q = $('#drawerInput').value; $('#drawerInput').value = ''; $('#drawerInput').blur();
  closeOverlay(() => doSearch(q));
});

/* ---------- salvos ---------- */
let savedTab = 'bm';
function renderSaved() {
  $$('#savedSeg button').forEach(x => x.classList.toggle('on', x.dataset.tab === savedTab));
  const body = $('#savedBody');
  if (savedTab === 'bm') {
    body.innerHTML = S.bookmarks.length ? S.bookmarks.map(x =>
      `<button class="result" data-go="${x.b},${x.c},${x.v}"><b>${esc(ref(x.b, x.c, x.v))}</b><div class="note">${new Date(x.t).toLocaleDateString('pt-BR')}</div></button>`).join('')
      : '<div class="empty">Nenhum marcador ainda.<br>Toque no número de um versículo para marcá-lo.</div>';
  } else {
    const keys = Object.keys(S.notes).sort((a, z) => { const A = a.split(':').map(Number), Z = z.split(':').map(Number); return A[0] - Z[0] || A[1] - Z[1] || A[2] - Z[2]; });
    body.innerHTML = keys.length ? keys.map(k => { const [b, c, v] = k.split(':').map(Number);
      return `<button class="result" data-go="${b},${c},${v}"><b>${esc(ref(b, c, v))}</b><div class="note">${esc(S.notes[k])}</div></button>`; }).join('')
      : '<div class="empty">Nenhuma nota ainda.<br>Toque no número de um versículo → “Adicionar nota”.</div>';
  }
}
$('#savedSeg').addEventListener('click', e => { const t = e.target.closest('[data-tab]')?.dataset.tab; if (t) { savedTab = t; renderSaved(); } });

/* ---------- ajustes ---------- */
function applySettings() {
  document.documentElement.dataset.theme = S.settings.theme;
  document.documentElement.style.setProperty('--he-size', S.settings.font + 'px');
  const dark = S.settings.theme === 'dark' || (S.settings.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  $('meta[name=theme-color]').content = dark ? '#1a1e27' : S.settings.theme === 'sepia' ? '#5a3e1b' : '#1d2a44';
}
function renderSettings() {
  const st = S.settings;
  $('#setTrans').innerHTML = TRANSLATIONS.map(([k, n]) => `<option value="${k}" ${k === st.trans ? 'selected' : ''}>${esc(n)}</option>`).join('');
  $('#setFont').value = st.font; $('#fontVal').textContent = st.font + 'px';
  $('#setTranslit').checked = st.translit; $('#setStrong').checked = st.strong; $('#setTeamim').checked = st.teamim; $('#setFoot').checked = st.foot;
  $$('#modeSeg button').forEach(x => x.classList.toggle('on', x.dataset.mode === st.mode));
  $$('#themeSeg button').forEach(x => x.classList.toggle('on', x.dataset.theme === st.theme));
}
function setSetting(k, v) { S.settings[k] = v; save('settings'); applySettings(); renderSettings(); if (current) renderReader(); }
$('#setTrans').addEventListener('change', e => { setSetting('trans', e.target.value); current = null; });
$('#setFont').addEventListener('input', e => { S.settings.font = +e.target.value; $('#fontVal').textContent = e.target.value + 'px'; applySettings(); save('settings'); });
$('#setTranslit').addEventListener('change', e => setSetting('translit', e.target.checked));
$('#setStrong').addEventListener('change', e => setSetting('strong', e.target.checked));
$('#setTeamim').addEventListener('change', e => setSetting('teamim', e.target.checked));
$('#setFoot').addEventListener('change', e => setSetting('foot', e.target.checked));
$('#modeSeg').addEventListener('click', e => { const m = e.target.closest('[data-mode]')?.dataset.mode; if (m) setSetting('mode', m); });
$('#themeSeg').addEventListener('click', e => { const m = e.target.closest('[data-theme]')?.dataset.theme; if (m) setSetting('theme', m); });

let downloading = false;
async function downloadChapters(list, label) {
  if (downloading) { toast('Já existe um download em andamento'); return; }
  downloading = true; let done = 0, fail = 0;
  const worker = async () => {
    while (list.length) {
      const [b, c] = list.shift();
      try { await loadChapter(b, c); } catch { fail++; }
      done++; if (done % 3 === 0 || !list.length) toast(`${label}: ${done} capítulos…`, 4000);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  downloading = false; memo.clear();
  toast(fail ? `${label}: concluído com ${fail} falha(s). Tente de novo.` : `${label} disponível offline ✓`, 4000);
}
$('#dlBook').addEventListener('click', () => {
  const b = BY_ID[S.pos.b];
  downloadChapters(Array.from({ length: b.chapters }, (_, i) => [b.id, i + 1]), b.name);
});
$('#dlAll').addEventListener('click', () => {
  if (!confirm('Baixar os 929 capítulos do Tanakh (hebraico + tradução escolhida)? Isso pode levar alguns minutos e usar cerca de 15–25 MB.')) return;
  downloadChapters(BOOKS.flatMap(b => Array.from({ length: b.chapters }, (_, i) => [b.id, i + 1])), 'Tanakh');
});

/* ---------- eventos gerais ---------- */
$('#menuBtn').addEventListener('click', openDrawer);
$('#drawerScrim').addEventListener('click', closeOverlay);
$('#sheetScrim').addEventListener('click', closeOverlay);
$('#drawer').addEventListener('click', e => {
  const a = e.target.closest('a'); const sec = e.target.closest('[data-sec]');
  if (a) {
    e.preventDefault(); const href = a.getAttribute('href');
    if (href === '#livros') pick = { b: null, c: null };
    closeOverlay(() => { if (location.hash === href) showView(href.slice(1)); else location.hash = href; });
  }
  if (sec) {
    pick = { b: null, c: null }; S.settings.order = 'tanakh'; save('settings');
    closeOverlay(() => {
      if (location.hash === '#livros') showView('livros'); else location.hash = '#livros';
      setTimeout(() => document.getElementById('sec-' + sec.dataset.sec)?.scrollIntoView({ block: 'start' }), 80);
    });
  }
});
$('#drawerSections').innerHTML = ['T', 'N', 'K'].map(k => `<button data-sec="${k}">${SECTIONS[k].name}<span class="he">${SECTIONS[k].he}</span></button>`).join('');
$('#titleBtn').addEventListener('click', () => { pick = { b: S.pos.b, c: null }; if (location.hash === '#livros') renderBooks(); else location.hash = '#livros'; });
$('#prevBtn').addEventListener('click', () => { const p = prevChapter(S.pos.b, S.pos.c); if (p) openChapter(...p); });
$('#nextBtn').addEventListener('click', () => { const p = nextChapter(S.pos.b, S.pos.c); if (p) openChapter(...p); });

document.addEventListener('click', e => {
  const go = e.target.closest('[data-go]');
  if (go) { const [b, c, v] = go.dataset.go.split(',').map(Number); openChapter(b, c, v || null); return; }
  const strongLink = e.target.closest('a[data-strong]');
  if (strongLink) { e.preventDefault(); openWord('', [+strongLink.dataset.strong]); return; }
  const hs = e.target.closest('[data-hsearch]');
  if (hs) { const q = hs.dataset.hsearch; closeOverlay(() => doSearch(q)); }
});
$('#reader').addEventListener('click', e => {
  const w = e.target.closest('.w[data-s]');
  if (w) { $$('.w.sel').forEach(x => x.classList.remove('sel')); openWord(w.dataset.w, w.dataset.s.split(',').map(Number)); w.classList.add('sel'); return; }
  const vn = e.target.closest('.vnum');
  if (vn) { openVerse(+vn.dataset.v); return; }
  const fn = e.target.closest('.footnotes li');
  if (fn) openWord(fn.dataset.w, [+fn.dataset.n]);
});

// deslizar para trocar de capítulo
let touch = null;
$('#view-ler').addEventListener('touchstart', e => { const t = e.touches[0]; touch = { x: t.clientX, y: t.clientY, t: Date.now() }; }, { passive: true });
$('#view-ler').addEventListener('touchend', e => {
  if (!touch || overlay) return; const t = e.changedTouches[0];
  const dx = t.clientX - touch.x, dy = t.clientY - touch.y; const fast = Date.now() - touch.t < 600; touch = null;
  if (fast && Math.abs(dx) > 80 && Math.abs(dy) < 50) { const p = dx < 0 ? nextChapter(S.pos.b, S.pos.c) : prevChapter(S.pos.b, S.pos.c); if (p) openChapter(...p); }
});

// instalação (PWA)
let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; $('#installBtn').hidden = false; });
$('#installBtn').addEventListener('click', async () => {
  if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice; installEvt = null; $('#installBtn').hidden = true;
});
window.addEventListener('appinstalled', () => toast('App instalado! Procure “Tanakh” na tela inicial.'));

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { }));
}

/* ---------- início ---------- */
applySettings();
updateTitle();
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applySettings);
showView(location.hash.slice(1) || 'inicio');
