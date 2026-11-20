const API_URL = 'https://script.google.com/macros/s/AKfycbz0HZYFjnmmeqbc8glkw3aMrYP5DaXf_Ah5a3N-OAaH1dRdffY7JoUx-sluyqAqzkNFKw/exec';
let allLinks = [];
let allCategories = [];
let selectedCategory = 'ALL';
let pendingOpenUrl = '';
let adminPass = localStorage.getItem('sainbyte_admin_pass') || null;
let hasAnimatedFirstLoad = false;
let pendingDeleteLinkId = null;
let pendingDeleteCategoryId = null;
let pendingDeleteCategoryName = '';
let searchTimer = null;
let toastTimer = null;
let openModalCount = 0;
let deferredPrompt = null;
let allComments = [];
let chatPollTimer = null;
let chatOpen = false;
let likedCommentIds = new Set(JSON.parse(localStorage.getItem('sainbyte_liked_comments') || '[]'));
let lastSeenCommentId = localStorage.getItem('sainbyte_last_seen_comment') || '';
let visitData = {total: 0, today: 0};
let draggedLinkId = null;
let draggedCatId = null;
document.getElementById('year').textContent = new Date().getFullYear();
function getMode(){ return document.documentElement.getAttribute('data-mode') || 'dark'; }
function getAccent(){ return document.documentElement.getAttribute('data-accent') || 'emerald'; }
function updateModeIcon(){
  const el = document.getElementById('modeIcon'); if(!el) return;
  const isDark = getMode() === 'dark';
  el.innerHTML = isDark ? '<svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M12 3v1.5M12 19.5V21M3 12h1.5M19.5 12H21M5.6 5.6l1.1 1.1M17.3 17.3l1.1 1.1M18.4 5.6l-1.1 1.1M6.7 17.3l-1.1 1.1"/><circle cx="12" cy="12" r="3.5"/></svg>' : '<svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/></svg>';
}
function updateThemeChecks(){ const cur=getAccent(); document.querySelectorAll('.theme-check').forEach(el=>{ el.style.opacity = el.getAttribute('data-accent-check')===cur ? '1':'0'; }); }
function applyTheme(mode, accent){
  document.documentElement.setAttribute('data-mode', mode); document.documentElement.setAttribute('data-accent', accent);
  if(mode==='light') document.documentElement.classList.remove('dark'); else document.documentElement.classList.add('dark');
  try{ localStorage.setItem('sainbyte_mode', mode); localStorage.setItem('sainbyte_accent', accent); }catch(e){}
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', mode==='light' ? '#f4f4f5' : '#09090b');
  updateModeIcon(); updateThemeChecks();
}
function toggleMode(){ const next = getMode()==='dark' ? 'light':'dark'; applyTheme(next, getAccent()); showToast(next==='light' ? 'Mode terang aktif' : 'Mode gelap aktif','info'); }
function setAccent(a){ applyTheme(getMode(), a); }
function toggleThemeMenu(e){ if(e) e.stopPropagation(); const m=document.getElementById('themeMenu'); if(!m) return; m.classList.toggle('hidden'); updateThemeChecks(); }
function closeThemeMenu(){ const m=document.getElementById('themeMenu'); if(m) m.classList.add('hidden'); }
// PWA
window.addEventListener('beforeinstallprompt', (e)=>{ e.preventDefault(); deferredPrompt=e; const b=document.getElementById('installBtn'); if(b) b.classList.remove('hidden'); });
async function promptInstall(){
  if(deferredPrompt){ deferredPrompt.prompt(); const r=await deferredPrompt.userChoice; if(r.outcome==='accepted') showToast('App berhasil di-install','success'); deferredPrompt=null; const b=document.getElementById('installBtn'); if(b) b.classList.add('hidden'); }
  else showToast('Buka menu browser > Add to Home Screen / Install App','info');
}
window.addEventListener('appinstalled', ()=>{ const b=document.getElementById('installBtn'); if(b) b.classList.add('hidden'); showToast('App ter-install','success'); });
if('serviceWorker' in navigator){ window.addEventListener('load', ()=>{ navigator.serviceWorker.register('sw.js').catch(()=>{}); }); }
document.addEventListener('DOMContentLoaded', ()=>{
  applyTheme(getMode(), getAccent());
  renderAuthControls(); fetchData();
  const si=document.getElementById('searchInput');
  if(si) si.addEventListener('input', ()=>{ clearTimeout(searchTimer); searchTimer=setTimeout(()=>applyFiltersAndRender(),120); });
  const chatForm = document.getElementById('chatForm');
  if (chatForm) chatForm.addEventListener('submit', sendChat);
  const chatMsg = document.getElementById('chatMessageInput');
  if (chatMsg) {
    chatMsg.addEventListener('keydown', (e)=>{ if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } });
    chatMsg.addEventListener('input', ()=>{ chatMsg.style.height='auto'; chatMsg.style.height=Math.min(chatMsg.scrollHeight, 96)+'px'; });
  }
  document.addEventListener('click', (e)=>{ if (!e.target.closest('#emotePicker') && !e.target.closest('button[onclick*="toggleEmotePicker"]')) { const p=document.getElementById('emotePicker'); if(p) p.classList.add('hidden'); } });
  document.addEventListener('keydown', (e)=>{
    if(e.key==='Escape'){ ['loginModal','linkModal','categoryModal','openLinkModal','deleteLinkModal','deleteCategoryModal','renameCategoryModal','chatModal'].forEach(id=>{ const m=document.getElementById(id); if(m && !m.classList.contains('hidden')) closeModal(id); }); closeAllAdminMenus(); closeThemeMenu(); }
  });
  document.addEventListener('click', (e)=>{ if(!e.target.closest('.admin-menu-wrap')) closeAllAdminMenus(); if(!e.target.closest('#themeMenu') && !e.target.closest('#themeBtn')) closeThemeMenu(); });
  ['loginModal','linkModal','categoryModal','openLinkModal','deleteLinkModal','deleteCategoryModal','renameCategoryModal','chatModal'].forEach(id=>{ const m=document.getElementById(id); if(m) m.addEventListener('click',(e)=>{ if(e.target.id===id) closeModal(id); }); });
});
function renderAuthControls(){
  const c=document.getElementById('authControls');
  if(adminPass){
    c.innerHTML = `
      <button onclick="openCategoryModal()" title="Kelola Kategori" aria-label="Kelola Kategori" class="w-9 h-9 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 flex items-center justify-center text-zinc-300 hover:text-white transition-colors active:scale-95"><svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></svg></button>
      <button onclick="openAddModal()" title="Tambah Project" aria-label="Tambah Project" class="w-9 h-9 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 flex items-center justify-center font-semibold transition-colors active:scale-95 shadow-sm shadow-emerald-500/20"><svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/></svg></button>
      <button onclick="logout()" title="Logout" aria-label="Logout" class="w-9 h-9 rounded-lg bg-zinc-900 hover:bg-rose-950/50 border border-zinc-800 hover:border-rose-900/60 flex items-center justify-center text-zinc-400 hover:text-rose-300 transition-colors active:scale-95"><svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3"/></svg></button>`;
  } else {
    c.innerHTML = `<button onclick="openModal('loginModal')" title="Login Admin" aria-label="Login Admin" class="w-9 h-9 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 flex items-center justify-center text-zinc-300 hover:text-white transition-colors active:scale-95"><svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M12 15a3 3 0 100-6 3 3 0 000 6z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M19.5 12a7.5 7.5 0 01-15 0 7.5 7.5 0 0115 0z"/></svg></button>`;
  }
}
function logout(){ adminPass=null; localStorage.removeItem('sainbyte_admin_pass'); renderAuthControls(); renderCategoryFilter(); applyFiltersAndRender(); showToast('Berhasil logout','info'); }

// --- CHATBOX GLOBAL + EMOTE GERAK + VISIT COUNTER ---
const EMOTE_LIST = ['🥺','😍','🤭','😋','🫣','👀','✨','💖','🫶','🐱','🐶','🐰','🐻','🐼','🦊','🐥','🐣','🔥','👍','👏','😂','😮','😢','🙏','🎉','❤️'];
const CUTE_ANIMALS = ['🐰','🐱','🐶','🐻','🐼','🦊','🐥'];
function getEmoteAnimClass(emoji){
  if (['❤️','💖','🫶'].includes(emoji)) return 'emote-heartbeat';
  if (['🔥'].includes(emoji)) return 'emote-flicker';
  if (['✨','🎉'].includes(emoji)) return 'emote-sparkle';
  if (['🐱','🐶','🐰','🐻','🐼','🦊','🐥','🐣'].includes(emoji)) return 'emote-bounce';
  if (['🥺','😍','🤭'].includes(emoji)) return 'emote-wiggle';
  return 'emote-float';
}
function isOnlyEmotes(text){
  const t = (text||'').trim();
  if (!t) return false;
  const noSpace = t.replace(/\s+/g, '');
  // hitung: hapus semua emoji + kaomoji, sisa harus kosong dan panjang emote <= 3
  const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu;
  const emojis = noSpace.match(emojiRegex) || [];
  const withoutEmoji = noSpace.replace(emojiRegex, '').replace(/[()♥‿*･ﾟ✧꒳ᵔᵕ˶｡ﾉ◕ヮ´`]/g, '').trim();
  return emojis.length >= 1 && emojis.length <= 3 && withoutEmoji === '' && noSpace.length <= 12;
}
function renderMessageContent(msg){
  const esc = escapeHtml(msg);
  if (isOnlyEmotes(msg)) {
    // stiker gede + gerak
    const chars = Array.from(msg.trim());
    // pisah per emoji (sederhana: tiap karakter emoji)
    const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
    let out = '';
    for (const ch of chars) {
      if (emojiRegex.test(ch)) out += `<span class="emote-anim ${getEmoteAnimClass(ch)} emote-big">${ch}</span> `;
      else if (ch.trim()) out += escapeHtml(ch);
    }
    if (out.trim()) return `<div>${out}</div>`;
  }
  // teks biasa: emote di dalam teks tetep gerak kecil
  return esc.replace(/([\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]\uFE0F?)/gu, (m) => `<span class="emote-anim ${getEmoteAnimClass(m)}">${m}</span>`);
}
function formatRelativeTime(createdAt){
  if (!createdAt) return '';
  const parts = String(createdAt).split(' ');
  if (parts.length < 2) return createdAt;
  const d = parts[0].split('-'); const t = parts[1].split(':');
  const date = new Date(Number(d[0]), Number(d[1])-1, Number(d[2]), Number(t[0]), Number(t[1]), Number(t[2]||0));
  const diff = Date.now() - date.getTime();
  if (diff < 0) return 'baru saja';
  const mins = Math.floor(diff/60000);
  if (mins < 1) return 'baru saja';
  if (mins < 60) return mins + ' menit lalu';
  const hours = Math.floor(mins/60);
  if (hours < 24) return hours + ' jam lalu';
  const days = Math.floor(hours/24);
  if (days < 7) return days + ' hari lalu';
  return createdAt;
}
function avatarColor(name){
  const colors = ['bg-rose-500/20 text-rose-300 border-rose-500/30','bg-sky-500/20 text-sky-300 border-sky-500/30','bg-amber-500/20 text-amber-300 border-amber-500/30','bg-violet-500/20 text-violet-300 border-violet-500/30','bg-emerald-500/20 text-emerald-300 border-emerald-500/30','bg-orange-500/20 text-orange-300 border-orange-500/30'];
  let h = 0; for (const c of String(name||'')) h = (h*31 + c.charCodeAt(0)) % 1000;
  return colors[h % colors.length];
}
function renderChat(){
  const list = document.getElementById('chatList');
  const label = document.getElementById('chatCountLabel');
  if (!list) return;
  if (label) label.textContent = allComments.length + ' komentar • global';
  if (allComments.length === 0) {
    list.innerHTML = `<div class="text-center py-10 px-4"><p class="text-[34px] mb-2"><span class="emote-anim emote-bounce">🐰</span></p><p class="text-sm text-zinc-400 font-medium">Belum ada komentar</p><p class="text-xs text-zinc-600 mt-1">Jadi yang pertama yuk (˶ᵔᵕᵔ˶)</p></div>`;
    return;
  }
  list.innerHTML = allComments.map(c => {
    const initial = (c.name||'T').trim().charAt(0).toUpperCase() || 'T';
    const liked = likedCommentIds.has(String(c.id));
    const delBtn = adminPass ? `<button onclick="deleteComment('${c.id}')" title="Hapus komentar" class="text-[11px] text-zinc-600 hover:text-rose-400 px-1">Hapus</button>` : '';
    return `<div class="flex gap-2.5"><div class="w-8 h-8 rounded-full border flex items-center justify-center text-[13px] font-bold shrink-0 ${avatarColor(c.name)}">${escapeHtml(initial)}</div><div class="flex-1 min-w-0"><div class="flex items-baseline gap-2 flex-wrap"><span class="text-[13px] font-semibold text-zinc-100 truncate">${escapeHtml(c.name)}</span><span class="text-[10px] text-zinc-500">${escapeHtml(formatRelativeTime(c.createdAt))}</span></div><div class="chat-bubble mt-1 inline-block max-w-full px-3 py-2 rounded-2xl rounded-tl-md bg-zinc-800/80 border border-zinc-700/60 text-[13px] text-zinc-100 leading-relaxed">${renderMessageContent(c.message)}</div><div class="flex items-center gap-2 mt-1"><button onclick="toggleCommentLike('${c.id}')" class="flex items-center gap-1 text-[11px] ${liked ? 'text-rose-400' : 'text-zinc-500 hover:text-rose-300'}"><span class="emote-anim ${liked ? 'emote-heartbeat' : ''}">❤️</span> ${c.likes||0}</button>${delBtn}</div></div></div>`;
  }).join('');
  list.scrollTop = list.scrollHeight;
}
function updateChatBadge(){
  const badge = document.getElementById('chatBadge');
  if (!badge) return;
  if (allComments.length === 0) { badge.classList.add('hidden'); return; }
  const latestId = String(allComments[allComments.length-1].id);
  if (!chatOpen && lastSeenCommentId && latestId !== lastSeenCommentId) badge.classList.remove('hidden');
  else if (!chatOpen && !lastSeenCommentId) badge.classList.remove('hidden');
  else badge.classList.add('hidden');
}
function openChatModal(){
  chatOpen = true;
  const badge = document.getElementById('chatBadge'); if (badge) badge.classList.add('hidden');
  if (allComments.length) { lastSeenCommentId = String(allComments[allComments.length-1].id); try{ localStorage.setItem('sainbyte_last_seen_comment', lastSeenCommentId); }catch(e){} }
  openModal('chatModal');
  renderChat();
  startChatPolling();
  setTimeout(()=>{ const inp = document.getElementById('chatMessageInput'); if (inp) inp.focus(); }, 250);
}
function startChatPolling(){
  stopChatPolling();
  chatPollTimer = setInterval(()=>{ if (chatOpen) fetchCommentsOnly(); }, 20000);
}
function stopChatPolling(){ if (chatPollTimer) clearInterval(chatPollTimer); chatPollTimer = null; }
async function fetchCommentsOnly(){
  try{
    const res = await fetch(API_URL); const json = await res.json();
    if (json.status === 'success' && json.data) {
      if (Array.isArray(json.data.comments)) { allComments = json.data.comments; renderChat(); updateChatBadge(); }
      if (json.data.visits) { visitData = json.data.visits; renderVisitCount(); }
    }
  }catch(e){}
}
function renderVisitCount(){
  const el = document.getElementById('visitCount');
  if (!el) return;
  const fmt = (n) => Number(n||0).toLocaleString('id-ID');
  el.textContent = `👁 ${fmt(visitData.total)} kunjungan • ${fmt(visitData.today)} hari ini`;
}
async function trackVisit(){
  try{
    const last = Number(localStorage.getItem('sainbyte_last_visit') || 0);
    if (Date.now() - last < 30*60*1000) return; // 1 device per 30 menit
    localStorage.setItem('sainbyte_last_visit', String(Date.now()));
    const res = await fetch(API_URL, {method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body: JSON.stringify({action:'add_visit'})});
    const json = await res.json();
    if (json.status === 'success' && json.visits) { visitData = json.visits; renderVisitCount(); }
  }catch(e){}
}
function toggleEmotePicker(e){ if(e) e.stopPropagation(); const p = document.getElementById('emotePicker'); if(!p) return; const willShow = p.classList.contains('hidden'); document.getElementById('emotePicker').classList.toggle('hidden'); if (willShow) renderEmoteGrid(); }
function renderEmoteGrid(){
  const grid = document.getElementById('emoteGrid'); if (!grid || grid.dataset.done) return; grid.dataset.done = '1';
  grid.innerHTML = EMOTE_LIST.map(em => `<button type="button" onclick="insertEmote('${em}')" class="emote-picker-btn w-8 h-8 rounded-lg bg-zinc-900 hover:bg-zinc-800 flex items-center justify-center text-[17px]">${em}</button>`).join('');
}
function insertEmote(em){
  const inp = document.getElementById('chatMessageInput'); if (!inp) return;
  const start = inp.selectionStart || inp.value.length; const end = inp.selectionEnd || inp.value.length;
  inp.value = inp.value.slice(0, start) + em + inp.value.slice(end);
  inp.focus(); inp.selectionStart = inp.selectionEnd = start + em.length;
}
function insertKaomoji(txt){
  const inp = document.getElementById('chatMessageInput'); if (!inp) return;
  const start = inp.selectionStart || inp.value.length; const end = inp.selectionEnd || inp.value.length;
  inp.value = inp.value.slice(0, start) + ' ' + txt + ' ' + inp.value.slice(end);
  inp.focus();
}
async function sendChat(e){
  if (e) e.preventDefault();
  const nameInput = document.getElementById('chatNameInput');
  const msgInput = document.getElementById('chatMessageInput');
  const btn = document.getElementById('chatSendBtn');
  let name = (nameInput?.value || '').trim().slice(0,20);
  if (!name) { const a = CUTE_ANIMALS[Math.floor(Math.random()*CUTE_ANIMALS.length)]; name = 'Tamu ' + a; }
  const message = (msgInput?.value || '').trim();
  if (!message) { showToast('Tulis komentar dulu','info'); return; }
  if (message.length > 200) { showToast('Max 200 karakter','error'); return; }
  if (btn) { btn.disabled = true; btn.style.opacity = '.6'; }
  try{
    const res = await fetch(API_URL, {method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body: JSON.stringify({action:'add_comment', name, message})});
    const json = await res.json();
    if (json.status === 'success') {
      if (msgInput) msgInput.value = '';
      document.getElementById('emotePicker')?.classList.add('hidden');
      if (json.comment) { allComments.push(json.comment); lastSeenCommentId = String(json.comment.id); try{ localStorage.setItem('sainbyte_last_seen_comment', lastSeenCommentId); }catch(_){} }
      renderChat();
      // refresh dari server biar timestamp akurat
      fetchCommentsOnly();
    } else showToast(json.message || 'Gagal kirim komentar','error');
  }catch(err){ showToast('Gagal terhubung ke server','error'); }
  finally{ if (btn) { btn.disabled = false; btn.style.opacity = '1'; } }
}
async function toggleCommentLike(id){
  const liked = likedCommentIds.has(String(id));
  const delta = liked ? -1 : 1;
  const c = allComments.find(x=>String(x.id)===String(id)); if (c) c.likes = Math.max(0, (c.likes||0)+delta);
  if (liked) likedCommentIds.delete(String(id)); else likedCommentIds.add(String(id));
  try{ localStorage.setItem('sainbyte_liked_comments', JSON.stringify(Array.from(likedCommentIds))); }catch(_){}
  renderChat();
  try{
    const res = await fetch(API_URL, {method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body: JSON.stringify({action:'toggle_comment_like', id, delta})});
    const json = await res.json();
    if (json.status === 'success' && c) { c.likes = json.likes; renderChat(); }
  }catch(_){}
}
async function deleteComment(id){
  if (!adminPass) return;
  if (!confirm('Hapus komentar ini?')) return;
  try{
    const res = await fetch(API_URL, {method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body: JSON.stringify({action:'delete_comment', password: adminPass, id})});
    const json = await res.json();
    if (json.status === 'success') { allComments = allComments.filter(x=>String(x.id)!==String(id)); renderChat(); showToast('Komentar dihapus','success'); }
    else showToast(json.message||'Gagal hapus','error');
  }catch(_){ showToast('Gagal terhubung ke server','error'); }
}


async function fetchData(options={}){ const keepList=!!options.keepList; try{ const res=await fetch(API_URL); const json=await res.json(); if(json.status==='success'){ allLinks=json.data.links||[]; allCategories=json.data.categories||[]; if(Array.isArray(json.data.comments)) allComments=json.data.comments; if(json.data.visits) { visitData=json.data.visits; renderVisitCount(); } renderCategoryFilter(); applyFiltersAndRender(); renderChat(); updateChatBadge(); trackVisit(); } else showToast(json.message||'Gagal memuat data','error'); }catch(err){ if(!keepList && allLinks.length===0){ const el=document.getElementById('initialLoading'); if(el) el.innerHTML=`<span class="text-sm text-zinc-500">Gagal terhubung ke server. Periksa koneksi atau deployment GAS.</span>`; } else showToast('Gagal terhubung ke server','error'); } }
function normalizeUrl(u){ let v=(u||'').trim(); if(!v) return ''; if(!/^https?:\/\//i.test(v)) v='https://'+v; return v; }
function getCleanDomain(url){ try{ return new URL(normalizeUrl(url)).hostname.replace(/^www\./,''); }catch{ return url; } }
function openLinkConfirm(id){ const item=allLinks.find(l=>String(l.id)===String(id)); if(!item) return; pendingOpenUrl=normalizeUrl(item.url); document.getElementById('openLinkTitle').textContent=item.title||'Project'; document.getElementById('openLinkDescription').textContent=item.description||'Anda akan membuka tautan eksternal.'; document.getElementById('openLinkDomain').textContent=getCleanDomain(pendingOpenUrl); openModal('openLinkModal'); }
function confirmOpenLink(){ if(!pendingOpenUrl) return; const u=pendingOpenUrl; pendingOpenUrl=''; closeModal('openLinkModal'); window.open(u,'_blank','noopener,noreferrer'); }
async function copyPendingLink(){ if(!pendingOpenUrl) return; try{ await navigator.clipboard.writeText(pendingOpenUrl); showToast('Link disalin','success'); }catch{ showToast('Gagal menyalin link','error'); } }
function toggleAdminMenu(id,e){ if(e) e.stopPropagation(); const menu=document.getElementById('adminMenu-'+id); if(!menu) return; const wasHidden=menu.classList.contains('hidden'); closeAllAdminMenus(); if(wasHidden) menu.classList.remove('hidden'); }
function closeAllAdminMenus(){ document.querySelectorAll('.admin-menu-panel').forEach(el=>el.classList.add('hidden')); }
function renderCategoryFilter(){
  const bar=document.getElementById('categoryFilterBar'); const prevScroll=bar?bar.scrollLeft:0;
  const visibleLinks = adminPass ? allLinks : allLinks.filter(l=>!l.hidden);
  const usedCats = new Set(visibleLinks.map(l=>l.category).filter(Boolean));
  const catNames = allCategories.map(c=>c.name).filter(n=> adminPass || usedCats.has(n));
  const totalAll = visibleLinks.length;
  const totalFav = visibleLinks.filter(l=>l.favorite).length;
  const countByCat = {}; visibleLinks.forEach(l=>{ if(l.category) countByCat[l.category]=(countByCat[l.category]||0)+1; });
  const pills = ['ALL','FAVORITES', ...catNames];
  if(pills.length<=2 && totalFav===0){ bar.classList.add('hidden'); if(selectedCategory==='FAVORITES') selectedCategory='ALL'; return; }
  bar.classList.remove('hidden');
  bar.innerHTML = pills.map(cat=>{
    const isActive = selectedCategory===cat;
    let label = cat==='ALL' ? `Semua (${totalAll})` : cat==='FAVORITES' ? `★ Favorit (${totalFav})` : `${escapeHtml(cat)} (${countByCat[cat]||0})`;
    return `<button onclick="selectCategory('${escapeHtml(cat)}')" class="px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors shrink-0 ${isActive ? 'bg-emerald-500 text-zinc-950 font-semibold shadow-sm shadow-emerald-500/20' : 'bg-zinc-900/80 text-zinc-400 hover:text-zinc-200 border border-zinc-800/80'}">${label}</button>`;
  }).join('');
  requestAnimationFrame(()=>{ bar.scrollLeft=prevScroll; });
}
function selectCategory(cat){ selectedCategory=cat; renderCategoryFilter(); applyFiltersAndRender(); }
function resetFilters(e){ if(e) e.preventDefault(); selectedCategory='ALL'; const inp=document.getElementById('searchInput'); if(inp) inp.value=''; renderCategoryFilter(); applyFiltersAndRender(); }
function applyFiltersAndRender(){
  const inp=document.getElementById('searchInput'); const q=inp?inp.value.toLowerCase().trim():'';
  const filtered=allLinks.filter(item=>{
    if(!adminPass && item.hidden) return false;
    if(selectedCategory==='FAVORITES' && !item.favorite) return false;
    if(selectedCategory!=='ALL' && selectedCategory!=='FAVORITES' && item.category!==selectedCategory) return false;
    if(q){ return (item.title||'').toLowerCase().includes(q) || (item.description||'').toLowerCase().includes(q) || (item.url||'').toLowerCase().includes(q) || (item.category||'').toLowerCase().includes(q); }
    return true;
  });
  renderLinks(filtered);
}
function renderLinks(links){
  const container=document.getElementById('linksList'); const countEl=document.getElementById('projectCount');
  if(countEl) countEl.textContent=`${links.length} project`;
  const shouldAnimate=!hasAnimatedFirstLoad;
  if(links.length===0){
    const isSearching=(document.getElementById('searchInput')?.value||'').trim()!=='';
    container.innerHTML=`<div class="text-center py-14 px-4 rounded-2xl bg-zinc-900/30 border border-dashed border-zinc-800/80"><p class="text-zinc-400 text-sm font-medium">Tidak ada project yang ditampilkan.</p><p class="text-zinc-600 text-xs mt-1">${selectedCategory==='FAVORITES' ? 'Belum ada project favorit.' : adminPass ? 'Klik + di kanan atas untuk menambah link baru.' : 'Login sebagai admin untuk mengelola daftar link.'}</p>${isSearching ? `<button onclick="resetFilters(event)" class="mt-4 px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium">Reset filter</button>` : ''}</div>`;
    if(!hasAnimatedFirstLoad) hasAnimatedFirstLoad=true; return;
  }
  container.innerHTML = links.map((item, idx)=>{
    const domain=getCleanDomain(item.url); const delay=shouldAnimate ? Math.min(idx*40,240):0; const isHidden=!!item.hidden; const isFavorite=item.favorite===true || item.favorite==='true' || item.favorite===1;
    const globalIndex=allLinks.findIndex(x=>String(x.id)===String(item.id));
    const dragAttrs = adminPass ? `draggable="true" ondragstart="handleLinkDragStart(event,'${item.id}')" ondragover="handleLinkDragOver(event)" ondragleave="handleLinkDragLeave(event)" ondrop="handleLinkDrop(event,'${item.id}')" ondragend="handleLinkDragEnd(event)"` : '';
    const dragHandle = adminPass ? `<span class="drag-handle text-zinc-600 pt-1 pr-0.5 select-none" title="Drag untuk ubah urutan">⠿</span>` : '';
    const adminMenu = adminPass ? `<div class="admin-menu-wrap relative shrink-0" onclick="event.stopPropagation()"><button onclick="toggleAdminMenu('${item.id}', event)" title="Menu" aria-label="Menu project" class="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"><svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg></button><div id="adminMenu-${item.id}" class="admin-menu-panel hidden absolute right-0 top-10 z-30 w-44 rounded-xl bg-zinc-900 border border-zinc-800 shadow-2xl shadow-black/50 p-1.5"><button onclick="toggleFavorite('${item.id}')" class="w-full text-left px-3 py-2 rounded-lg text-[13px] text-zinc-200 hover:bg-zinc-800 flex items-center gap-2">${isFavorite ? '★ Hapus dari favorit' : '☆ Jadikan favorit'}</button><button onclick="toggleHideLink('${item.id}')" class="w-full text-left px-3 py-2 rounded-lg text-[13px] text-zinc-200 hover:bg-zinc-800">${isHidden ? 'Tampilkan' : 'Sembunyikan'}</button><button onclick="openEditModal('${item.id}')" class="w-full text-left px-3 py-2 rounded-lg text-[13px] text-zinc-200 hover:bg-zinc-800">Edit</button><button onclick="moveLink('${item.id}', -1)" ${globalIndex<=0 ? 'disabled':''} class="w-full text-left px-3 py-2 rounded-lg text-[13px] text-zinc-200 hover:bg-zinc-800 disabled:opacity-30 disabled:pointer-events-none">Pindah ke atas</button><button onclick="moveLink('${item.id}', 1)" ${globalIndex>=allLinks.length-1 ? 'disabled':''} class="w-full text-left px-3 py-2 rounded-lg text-[13px] text-zinc-200 hover:bg-zinc-800 disabled:opacity-30 disabled:pointer-events-none">Pindah ke bawah</button><div class="h-px bg-zinc-800 my-1"></div><button onclick="openDeleteLinkModal('${item.id}', '${escapeHtml(item.title)}')" class="w-full text-left px-3 py-2 rounded-lg text-[13px] text-rose-400 hover:bg-rose-950/40">Hapus</button></div></div>` : '';
    return `<div ${dragAttrs} onclick="openLinkConfirm('${item.id}')" ${shouldAnimate ? `style="animation-delay:${delay}ms"` : ''} class="group relative flex items-start gap-2 p-3.5 sm:p-4 rounded-xl border cursor-pointer transition-colors duration-150 ${isHidden ? 'bg-zinc-950/50 border-dashed border-zinc-800/70 opacity-60 hover:opacity-95' : 'bg-zinc-900/60 hover:bg-zinc-900 border-zinc-800/80 hover:border-zinc-700'} ${shouldAnimate ? 'animate-row' : ''}">${dragHandle}<div class="flex-1 min-w-0"><div class="flex items-center gap-2 flex-wrap"><h3 class="font-semibold text-[15px] sm:text-base text-zinc-100 group-hover:text-emerald-400 transition-colors leading-snug">${escapeHtml(item.title)}</h3>${isFavorite ? `<span class="text-amber-400 shrink-0" title="Favorit"><svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="m12 3 2.75 5.57 6.15.9-4.45 4.34 1.05 6.13L12 17.05l-5.5 2.89 1.05-6.13L3.1 9.47l6.15-.9L12 3z"/></svg></span>` : ''}${item.category ? `<span class="text-[10px] font-medium text-zinc-300 bg-zinc-800/80 border border-zinc-700/60 px-2 py-0.5 rounded-full">${escapeHtml(item.category)}</span>` : ''}${isHidden ? '<span class="text-[10px] font-mono text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded">Hidden</span>' : ''}</div>${item.description ? `<p class="text-[13px] sm:text-sm text-zinc-400 line-clamp-2 leading-relaxed mt-1">${escapeHtml(item.description)}</p>` : ''}<p class="text-[11px] font-mono text-zinc-500 mt-1.5 truncate">${escapeHtml(domain)}</p></div><div class="flex items-start gap-0.5 shrink-0 pt-0.5"><div class="text-zinc-600 group-hover:text-emerald-400 pt-2"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 17L17 7M17 7H7M17 7v10"/></svg></div>${adminMenu}</div></div>`;
  }).join('');
  if(shouldAnimate) hasAnimatedFirstLoad=true;
}
function handleLinkDragStart(e,id){ draggedLinkId=id; try{ e.dataTransfer.effectAllowed='move'; e.dataTransfer.setData('text/plain', id); }catch(_){} const card=e.currentTarget; setTimeout(()=>card.classList.add('dragging'),0); }
function handleLinkDragOver(e){ e.preventDefault(); try{ e.dataTransfer.dropEffect='move'; }catch(_){} const card=e.currentTarget; if(card) card.classList.add('drag-over'); }
function handleLinkDragLeave(e){ const card=e.currentTarget; if(card) card.classList.remove('drag-over'); }
async function handleLinkDrop(e,targetId){ e.preventDefault(); const src=draggedLinkId || (e.dataTransfer && e.dataTransfer.getData('text/plain')); if(!src || String(src)===String(targetId)) return; const from=allLinks.findIndex(x=>String(x.id)===String(src)); const to=allLinks.findIndex(x=>String(x.id)===String(targetId)); if(from<0 || to<0) return; const [moved]=allLinks.splice(from,1); allLinks.splice(to,0,moved); applyFiltersAndRender(); await saveLinkOrder(); }
function handleLinkDragEnd(e){ document.querySelectorAll('.drag-over').forEach(el=>el.classList.remove('drag-over')); document.querySelectorAll('.dragging').forEach(el=>el.classList.remove('dragging')); draggedLinkId=null; }
async function saveLinkOrder(){ try{ const res=await fetch(API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'reorder_links',password:adminPass,ids:allLinks.map(x=>x.id)})}); const json=await res.json(); if(json.status!=='success') throw new Error(json.message||'Backend belum mendukung urutan link'); showToast('Urutan project disimpan','success'); }catch(err){ await fetchData({keepList:true}); showToast(err.message||'Gagal menyimpan urutan','error'); } }
async function toggleFavorite(id){ const item=allLinks.find(x=>String(x.id)===String(id)); if(!item || !adminPass) return; const prev=!!item.favorite; item.favorite=!prev; renderCategoryFilter(); applyFiltersAndRender(); try{ const res=await fetch(API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'toggle_favorite',password:adminPass,id,favorite:item.favorite})}); const json=await res.json(); if(json.status!=='success') throw new Error(json.message||'Backend belum mendukung favorit'); showToast(item.favorite?'Ditambahkan ke favorit':'Dihapus dari favorit','success'); }catch(err){ item.favorite=prev; renderCategoryFilter(); applyFiltersAndRender(); showToast(err.message||'Gagal menyimpan favorit','error'); } }
async function moveLink(id,dir){ if(!adminPass) return; const from=allLinks.findIndex(x=>String(x.id)===String(id)); const to=from+dir; if(from<0||to<0||to>=allLinks.length) return; [allLinks[from],allLinks[to]]=[allLinks[to],allLinks[from]]; applyFiltersAndRender(); await saveLinkOrder(); }
async function moveCategory(id,dir){ if(!adminPass) return; const from=allCategories.findIndex(x=>String(x.id)===String(id)); const to=from+dir; if(from<0||to<0||to>=allCategories.length) return; [allCategories[from],allCategories[to]]=[allCategories[to],allCategories[from]]; renderCategoryManagerList(); renderCategoryFilter(); try{ const res=await fetch(API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'reorder_categories',password:adminPass,ids:allCategories.map(x=>x.id)})}); const json=await res.json(); if(json.status!=='success') throw new Error(json.message||'Backend belum mendukung urutan kategori'); showToast('Urutan kategori disimpan','success'); }catch(err){ await fetchData({keepList:true}); renderCategoryManagerList(); showToast(err.message||'Gagal menyimpan urutan kategori','error'); } }
function handleCatDragStart(e,id){ draggedCatId=id; try{ e.dataTransfer.effectAllowed='move'; e.dataTransfer.setData('text/plain',id); }catch(_){} setTimeout(()=>e.currentTarget.classList.add('dragging'),0); }
function handleCatDragOver(e){ e.preventDefault(); const el=e.currentTarget; if(el) el.classList.add('drag-over'); }
function handleCatDragLeave(e){ const el=e.currentTarget; if(el) el.classList.remove('drag-over'); }
async function handleCatDrop(e,targetId){ e.preventDefault(); const src=draggedCatId || (e.dataTransfer && e.dataTransfer.getData('text/plain')); if(!src || String(src)===String(targetId)) return; const from=allCategories.findIndex(x=>String(x.id)===String(src)); const to=allCategories.findIndex(x=>String(x.id)===String(targetId)); if(from<0||to<0) return; const [m]=allCategories.splice(from,1); allCategories.splice(to,0,m); renderCategoryManagerList(); renderCategoryFilter(); try{ const res=await fetch(API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'reorder_categories',password:adminPass,ids:allCategories.map(x=>x.id)})}); const json=await res.json(); if(json.status!=='success') throw new Error(json.message||'Gagal menyimpan urutan kategori'); showToast('Urutan kategori disimpan','success'); }catch(err){ await fetchData({keepList:true}); renderCategoryManagerList(); } }
function handleCatDragEnd(e){ document.querySelectorAll('.drag-over').forEach(el=>el.classList.remove('drag-over')); document.querySelectorAll('.dragging').forEach(el=>el.classList.remove('dragging')); draggedCatId=null; }
document.getElementById('loginForm').addEventListener('submit', async (e)=>{ e.preventDefault(); const passInput=document.getElementById('loginPassword').value; const btn=document.getElementById('loginSubmitBtn'); const orig=btn.textContent; btn.disabled=true; btn.textContent='Memverifikasi...'; try{ const res=await fetch(API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'login',password:passInput})}); const json=await res.json(); if(json.status==='success'){ adminPass=passInput; localStorage.setItem('sainbyte_admin_pass',adminPass); closeModal('loginModal'); document.getElementById('loginForm').reset(); renderAuthControls(); renderCategoryFilter(); applyFiltersAndRender(); showToast('Mode admin aktif!','success'); } else showToast(json.message||'Password salah','error'); }catch{ showToast('Terjadi kesalahan jaringan','error'); } finally{ btn.disabled=false; btn.textContent=orig; } });
function populateCategorySelect(v=''){ const s=document.getElementById('linkCategory'); s.innerHTML=`<option value="">Tanpa Kategori</option>`+allCategories.map(c=>`<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join(''); s.value=v; }
function openAddModal(){ document.getElementById('linkModalTitle').textContent='Tambah Link Project'; document.getElementById('linkForm').reset(); document.getElementById('linkId').value=''; populateCategorySelect(''); openModal('linkModal'); setTimeout(()=>document.getElementById('linkTitle').focus(),100); }
function openEditModal(id){ const item=allLinks.find(l=>String(l.id)===String(id)); if(!item) return; document.getElementById('linkModalTitle').textContent='Edit Link Project'; document.getElementById('linkId').value=item.id; document.getElementById('linkTitle').value=item.title; document.getElementById('linkDesc').value=item.description||''; document.getElementById('linkUrl').value=item.url; populateCategorySelect(item.category||''); openModal('linkModal'); }
document.getElementById('linkForm').addEventListener('submit', async (e)=>{ e.preventDefault(); const id=document.getElementById('linkId').value; const title=document.getElementById('linkTitle').value.trim(); const description=document.getElementById('linkDesc').value.trim(); const url=normalizeUrl(document.getElementById('linkUrl').value); const category=document.getElementById('linkCategory').value; const btn=document.getElementById('linkSubmitBtn'); const orig=btn.textContent; btn.disabled=true; btn.textContent='Menyimpan...'; const action=id?'edit_link':'add_link'; try{ const res=await fetch(API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action,password:adminPass,id,title,description,url,category})}); const json=await res.json(); if(json.status==='success'){ closeModal('linkModal'); showToast(id?'Link diperbarui':'Link ditambahkan','success'); await fetchData({keepList:true}); } else showToast(json.message||'Gagal menyimpan','error'); }catch{ showToast('Gagal terhubung ke server','error'); } finally{ btn.disabled=false; btn.textContent=orig; } });
async function toggleHideLink(id){ const t=allLinks.find(l=>String(l.id)===String(id)); if(t){ t.hidden=!t.hidden; applyFiltersAndRender(); } try{ const res=await fetch(API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'toggle_hide',password:adminPass,id})}); const json=await res.json(); if(json.status==='success') showToast(json.hidden?'Link disembunyikan':'Link ditampilkan kembali','info'); else { showToast(json.message||'Gagal mengubah status','error'); await fetchData({keepList:true}); } }catch{ showToast('Gagal terhubung ke server','error'); await fetchData({keepList:true}); } }
function openDeleteLinkModal(id,title){ pendingDeleteLinkId=id; document.getElementById('deleteLinkTitle').textContent=title||'project ini'; openModal('deleteLinkModal'); }
async function confirmDeleteLink(){ if(!pendingDeleteLinkId) return; const id=pendingDeleteLinkId; pendingDeleteLinkId=null; closeModal('deleteLinkModal'); showToast('Menghapus...','info'); try{ const res=await fetch(API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'delete_link',password:adminPass,id})}); const json=await res.json(); if(json.status==='success'){ allLinks=allLinks.filter(x=>String(x.id)!==String(id)); renderCategoryFilter(); applyFiltersAndRender(); showToast('Link dihapus','success'); } else showToast(json.message||'Gagal menghapus','error'); }catch{ showToast('Gagal terhubung ke server','error'); } }
function openCategoryModal(){ renderCategoryManagerList(); openModal('categoryModal'); }
function renderCategoryManagerList(){
  const container=document.getElementById('categoryManagerList');
  if(allCategories.length===0){ container.innerHTML=`<p class="text-xs text-zinc-500 text-center py-4">Belum ada kategori. Tambahkan di atas.</p>`; return; }
  const countByCat={}; allLinks.forEach(l=>{ if(l.category) countByCat[l.category]=(countByCat[l.category]||0)+1; });
  container.innerHTML=allCategories.map(cat=>`<div draggable="true" ondragstart="handleCatDragStart(event,'${cat.id}')" ondragover="handleCatDragOver(event)" ondragleave="handleCatDragLeave(event)" ondrop="handleCatDrop(event,'${cat.id}')" ondragend="handleCatDragEnd(event)" class="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-zinc-950 border border-zinc-800/80"><span class="flex items-center gap-2 min-w-0"><span class="drag-handle text-zinc-600 select-none">⠿</span><span class="text-sm text-zinc-200 truncate">${escapeHtml(cat.name)} <span class="text-xs text-zinc-500">(${countByCat[cat.name]||0})</span></span></span><div class="flex items-center gap-1 shrink-0"><button onclick="moveCategory('${cat.id}', -1)" title="Pindah ke atas" ${allCategories.indexOf(cat)===0 ? 'disabled':''} class="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-900 disabled:opacity-25"><svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m6 15 6-6 6 6"/></svg></button><button onclick="moveCategory('${cat.id}', 1)" title="Pindah ke bawah" ${allCategories.indexOf(cat)===allCategories.length-1 ? 'disabled':''} class="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-900 disabled:opacity-25"><svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m6 9 6 6 6-6"/></svg></button><button onclick="openRenameCategoryModal('${cat.id}', '${escapeHtml(cat.name)}')" title="Rename" class="p-1.5 rounded-lg text-zinc-400 hover:text-sky-400 hover:bg-zinc-900 transition-colors"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg></button><button onclick="openDeleteCategoryModal('${cat.id}', '${escapeHtml(cat.name)}')" title="Hapus" class="p-1.5 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-zinc-900 transition-colors"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button></div></div>`).join('');
}
document.getElementById('addCategoryForm').addEventListener('submit', async (e)=>{ e.preventDefault(); const input=document.getElementById('newCategoryName'); const name=input.value.trim(); if(!name) return; const btn=document.getElementById('addCatBtn'); btn.disabled=true; btn.textContent='...'; try{ const res=await fetch(API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'add_category',password:adminPass,name})}); const json=await res.json(); if(json.status==='success'){ input.value=''; showToast('Kategori ditambahkan','success'); await fetchData({keepList:true}); renderCategoryManagerList(); } else showToast(json.message||'Gagal menambah kategori','error'); }catch{ showToast('Gagal terhubung ke server','error'); } finally{ btn.disabled=false; btn.textContent='Tambah'; } });
function openRenameCategoryModal(id,oldName){ document.getElementById('renameCategoryId').value=id; document.getElementById('renameCategoryInput').value=oldName; openModal('renameCategoryModal'); setTimeout(()=>{ const inp=document.getElementById('renameCategoryInput'); inp.focus(); inp.select(); },100); }
document.getElementById('renameCategoryForm').addEventListener('submit', async (e)=>{ e.preventDefault(); const id=document.getElementById('renameCategoryId').value; const newName=document.getElementById('renameCategoryInput').value.trim(); const oldName=(allCategories.find(c=>String(c.id)===String(id))||{}).name||''; if(!newName || newName===oldName){ closeModal('renameCategoryModal'); return; } closeModal('renameCategoryModal'); showToast('Mengubah nama...','info'); try{ const res=await fetch(API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'rename_category',password:adminPass,id,name:newName})}); const json=await res.json(); if(json.status==='success'){ if(selectedCategory===oldName) selectedCategory=newName; showToast('Kategori diubah','success'); await fetchData({keepList:true}); renderCategoryManagerList(); } else showToast(json.message||'Gagal mengubah kategori','error'); }catch{ showToast('Gagal terhubung ke server','error'); } });
function openDeleteCategoryModal(id,name){ pendingDeleteCategoryId=id; pendingDeleteCategoryName=name; document.getElementById('deleteCategoryName').textContent=name; openModal('deleteCategoryModal'); }
async function confirmDeleteCategory(){ if(!pendingDeleteCategoryId) return; const id=pendingDeleteCategoryId; const name=pendingDeleteCategoryName; pendingDeleteCategoryId=null; pendingDeleteCategoryName=''; closeModal('deleteCategoryModal'); showToast('Menghapus kategori...','info'); try{ const res=await fetch(API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'delete_category',password:adminPass,id})}); const json=await res.json(); if(json.status==='success'){ if(selectedCategory===name) selectedCategory='ALL'; showToast('Kategori dihapus','success'); await fetchData({keepList:true}); renderCategoryManagerList(); } else showToast(json.message||'Gagal menghapus','error'); }catch{ showToast('Gagal terhubung ke server','error'); } }
function exportBackup(){
  const data={ exportedAt:new Date().toISOString(), app:'sainbyte', version:1, categories:allCategories, links:allLinks };
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='sainbyte-backup-'+new Date().toISOString().slice(0,10)+'.json'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000); showToast('Backup di-download','success');
}
async function handleImportFile(e){
  const file=e.target.files && e.target.files[0]; if(!file) return; e.target.value='';
  try{
    const text=await file.text(); const data=JSON.parse(text);
    const cats=data.categories||data.cats||[]; const links=data.links||data.items||[];
    if(!Array.isArray(cats) && !Array.isArray(links)) throw new Error('Format JSON tidak dikenali');
    if(!adminPass){ showToast('Login admin dulu untuk import','error'); return; }
    showToast('Import dimulai...','info');
    const existingCatNames=new Set(allCategories.map(c=>c.name));
    for(const c of cats){ const name=typeof c==='string'?c:c.name; if(name && !existingCatNames.has(name)){ try{ const r=await fetch(API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'add_category',password:adminPass,name})}); const j=await r.json(); if(j.status==='success') existingCatNames.add(name); }catch(_){} } }
    const existingUrls=new Set(allLinks.map(l=>normalizeUrl(l.url)));
    let added=0;
    for(const l of links){ const url=normalizeUrl(l.url||''); if(!url || existingUrls.has(url)) continue; try{ const r=await fetch(API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'add_link',password:adminPass,title:l.title||'Project',description:l.description||'',url,category:l.category||''})}); const j=await r.json(); if(j.status==='success'){ added++; existingUrls.add(url); } }catch(_){} }
    await fetchData({keepList:true}); renderCategoryManagerList(); showToast(`Import selesai, ${added} project ditambahkan`,'success');
  }catch(err){ showToast(err.message||'Gagal import file','error'); }
}
function openModal(id){
  if (id==='chatModal') { chatOpen=true; const b=document.getElementById('chatBadge'); if(b) b.classList.add('hidden'); } const modal=document.getElementById(id); if(!modal) return; const card=modal.querySelector('.modal-card'); modal.classList.remove('hidden'); modal.classList.add('flex'); openModalCount++; document.body.style.overflow='hidden'; requestAnimationFrame(()=>{ modal.classList.remove('opacity-0'); if(card){ card.classList.remove('scale-95','opacity-0'); card.classList.add('scale-100','opacity-100'); } }); }
function closeModal(id){
  if (id==='chatModal') { chatOpen=false; stopChatPolling(); if (allComments.length) { lastSeenCommentId=String(allComments[allComments.length-1].id); try{ localStorage.setItem('sainbyte_last_seen_comment', lastSeenCommentId); }catch(e){} } } const modal=document.getElementById(id); if(!modal || modal.classList.contains('hidden')) return; const card=modal.querySelector('.modal-card'); modal.classList.add('opacity-0'); if(card){ card.classList.remove('scale-100','opacity-100'); card.classList.add('scale-95','opacity-0'); } openModalCount=Math.max(0,openModalCount-1); if(openModalCount===0) document.body.style.overflow=''; setTimeout(()=>{ modal.classList.add('hidden'); modal.classList.remove('flex'); },240); }
function showToast(msg,type='info'){ const toast=document.getElementById('toast'); const icon=document.getElementById('toastIcon'); const message=document.getElementById('toastMessage'); const progress=document.getElementById('toastProgress'); const colors={success:'bg-emerald-400',error:'bg-rose-400',info:'bg-sky-400'}; icon.innerHTML=`<span class="w-2 h-2 rounded-full ${colors[type]||colors.info} block"></span>`; message.textContent=msg; toast.classList.remove('translate-y-20','opacity-0'); if(progress){ progress.style.transition='none'; progress.style.width='100%'; void progress.offsetWidth; progress.style.transition='width 3s linear'; progress.style.width='0%'; } clearTimeout(toastTimer); toastTimer=setTimeout(()=>hideToast(),3000); }
function hideToast(){ const toast=document.getElementById('toast'); toast.classList.add('translate-y-20','opacity-0'); clearTimeout(toastTimer); }
function escapeHtml(str){ if(!str) return ''; return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }
