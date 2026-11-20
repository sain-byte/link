const API_URL = 'https://script.google.com/macros/s/AKfycbz0HZYFjnmmeqbc8glkw3aMrYP5DaXf_Ah5a3N-OAaH1dRdffY7JoUx-sluyqAqzkNFKw/exec';

let allLinks = [];
let allCategories = [];
let selectedCategory = 'ALL';
let pendingOpenUrl = '';
let adminPass = localStorage.getItem('sainbyte_admin_pass') || null;

document.getElementById('year').textContent = new Date().getFullYear();

document.addEventListener('DOMContentLoaded', () => {
  renderAuthControls();
  fetchData();
});

// --- AUTH CONTROLS ---
function renderAuthControls() {
  const container = document.getElementById('authControls');
  if (adminPass) {
    container.innerHTML = `
      <button 
        onclick="openCategoryModal()" 
        class="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white text-xs sm:text-sm font-medium transition-all active:scale-95"
      >
        Kategori
      </button>
      <button 
        onclick="openAddModal()" 
        class="px-3 sm:px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-xs sm:text-sm transition-all active:scale-95 flex items-center gap-1 shadow-sm shadow-emerald-500/20"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/></svg>
        <span>Tambah</span>
      </button>
      <button 
        onclick="logout()" 
        title="Logout"
        class="px-2.5 sm:px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-rose-950/50 border border-zinc-800 hover:border-rose-900/60 text-zinc-400 hover:text-rose-300 text-xs sm:text-sm font-medium transition-all active:scale-95"
      >
        Logout
      </button>
    `;
  } else {
    container.innerHTML = `
      <button 
        onclick="openModal('loginModal')" 
        class="px-3.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white text-xs sm:text-sm font-medium transition-all active:scale-95"
      >
        Login
      </button>
    `;
  }
}

function logout() {
  adminPass = null;
  localStorage.removeItem('sainbyte_admin_pass');
  renderAuthControls();
  renderCategoryFilter();
  applyFiltersAndRender();
  showToast('Berhasil logout', 'info');
}

// --- FETCH DATA ---
async function fetchData() {
  try {
    const res = await fetch(API_URL);
    const json = await res.json();
    if (json.status === 'success') {
      allLinks = json.data.links || [];
      allCategories = json.data.categories || [];
      renderCategoryFilter();
      applyFiltersAndRender();
    } else {
      showToast(json.message || 'Gagal memuat data', 'error');
    }
  } catch (err) {
    document.getElementById('linksList').innerHTML = `
      <div class="text-center py-12 px-4 rounded-2xl border border-dashed border-zinc-800 text-zinc-500 text-sm">
        Gagal terhubung ke server. Periksa koneksi atau deployment GAS.
      </div>
    `;
  }
}

// --- URL HELPERS ---
function normalizeUrl(rawUrl) {
  let u = (rawUrl || '').trim();
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  return u;
}

function getCleanDomain(url) {
  try { return new URL(normalizeUrl(url)).hostname.replace(/^www\./, ''); }
  catch { return url; }
}

function openLinkConfirm(id) {
  const item = allLinks.find(link => String(link.id) === String(id));
  if (!item) return;
  pendingOpenUrl = normalizeUrl(item.url);
  document.getElementById('openLinkTitle').textContent = item.title || 'Project';
  document.getElementById('openLinkDescription').textContent = item.description || 'Anda akan membuka tautan eksternal.';
  document.getElementById('openLinkDomain').textContent = getCleanDomain(pendingOpenUrl);
  openModal('openLinkModal');
}

function confirmOpenLink() {
  if (!pendingOpenUrl) return;
  const url = pendingOpenUrl;
  pendingOpenUrl = '';
  closeModal('openLinkModal');
  window.open(url, '_blank', 'noopener,noreferrer');
}

// --- CATEGORY FILTER BAR ---
function renderCategoryFilter() {
  const bar = document.getElementById('categoryFilterBar');
  const visibleLinks = adminPass ? allLinks : allLinks.filter(l => !l.hidden);
  const usedCats = new Set(visibleLinks.map(l => l.category).filter(Boolean));
  const catNames = allCategories.map(c => c.name).filter(name => adminPass || usedCats.has(name));
  const pills = ['ALL', 'FAVORITES', ...catNames];
  if (pills.length <= 2 && !visibleLinks.some(l => l.favorite)) {
    bar.classList.add('hidden');
    selectedCategory = selectedCategory === 'FAVORITES' ? 'ALL' : selectedCategory;
    return;
  }
  bar.classList.remove('hidden');
  bar.innerHTML = pills.map(cat => {
    const isActive = selectedCategory === cat;
    const label = cat === 'ALL' ? 'Semua' : cat === 'FAVORITES' ? '★ Favorit' : escapeHtml(cat);
    return `<button onclick="selectCategory('${escapeHtml(cat)}')" class="px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${isActive ? 'bg-emerald-500 text-zinc-950 font-semibold shadow-sm shadow-emerald-500/20' : 'bg-zinc-900/80 text-zinc-400 hover:text-zinc-200 border border-zinc-800/80'}">${label}</button>`;
  }).join('');
}

function selectCategory(cat) {
  selectedCategory = cat;
  renderCategoryFilter();
  applyFiltersAndRender();
}

function resetFilters(e) {
  if (e) e.preventDefault();
  selectedCategory = 'ALL';
  document.getElementById('searchInput').value = '';
  renderCategoryFilter();
  applyFiltersAndRender();
}

// --- FILTER & RENDER LIST ---
function applyFiltersAndRender() {
  const q = document.getElementById('searchInput').value.toLowerCase().trim();

  const filtered = allLinks.filter(item => {
    if (!adminPass && item.hidden) return false;
    if (selectedCategory === 'FAVORITES' && !item.favorite) return false;
    if (selectedCategory !== 'ALL' && selectedCategory !== 'FAVORITES' && item.category !== selectedCategory) return false;

    if (q) {
      const matchTitle = item.title.toLowerCase().includes(q);
      const matchDesc = (item.description || '').toLowerCase().includes(q);
      const matchUrl = item.url.toLowerCase().includes(q);
      const matchCat = (item.category || '').toLowerCase().includes(q);
      return matchTitle || matchDesc || matchUrl || matchCat;
    }
    return true;
  });

  renderLinks(filtered);
}

document.getElementById('searchInput').addEventListener('input', applyFiltersAndRender);

function renderLinks(links) {
  const container = document.getElementById('linksList');
  const countEl = document.getElementById('projectCount');
  countEl.textContent = `${links.length} project`;
  if (links.length === 0) {
    container.innerHTML = `<div class="text-center py-14 px-4 rounded-2xl bg-zinc-900/30 border border-dashed border-zinc-800/80"><p class="text-zinc-400 text-sm font-medium">Tidak ada project yang ditampilkan.</p><p class="text-zinc-600 text-xs mt-1">${selectedCategory === 'FAVORITES' ? 'Belum ada project favorit.' : adminPass ? 'Klik "+ Tambah" di kanan atas untuk menambah link baru.' : 'Login sebagai admin untuk mengelola daftar link.'}</p></div>`;
    return;
  }
  container.innerHTML = links.map((item, idx) => {
    const domain = getCleanDomain(item.url);
    const delay = Math.min(idx * 40, 400);
    const isHidden = !!item.hidden;
    const isFavorite = item.favorite === true || item.favorite === 'true' || item.favorite === 1;
    const globalIndex = allLinks.findIndex(x => String(x.id) === String(item.id));
    const adminButtons = adminPass ? `
      <div class="flex items-center gap-0.5 pl-2 border-l border-zinc-800/80 shrink-0" onclick="event.stopPropagation()">
        <button onclick="moveLink('${item.id}', -1)" title="Pindah ke atas" ${globalIndex <= 0 ? 'disabled' : ''} class="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 disabled:opacity-25 disabled:cursor-not-allowed"><svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m6 15 6-6 6 6"/></svg></button>
        <button onclick="moveLink('${item.id}', 1)" title="Pindah ke bawah" ${globalIndex >= allLinks.length - 1 ? 'disabled' : ''} class="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 disabled:opacity-25 disabled:cursor-not-allowed"><svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m6 9 6 6 6-6"/></svg></button>
        <button onclick="toggleFavorite('${item.id}')" title="${isFavorite ? 'Hapus dari favorit' : 'Jadikan favorit'}" class="p-1.5 rounded-lg ${isFavorite ? 'text-amber-400' : 'text-zinc-500 hover:text-amber-300'} hover:bg-zinc-800"><svg class="w-4 h-4" viewBox="0 0 24 24" fill="${isFavorite ? 'currentColor' : 'none'}" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="m12 3 2.75 5.57 6.15.9-4.45 4.34 1.05 6.13L12 17.05l-5.5 2.89 1.05-6.13L3.1 9.47l6.15-.9L12 3z"/></svg></button>
        <button onclick="toggleHideLink('${item.id}')" title="${isHidden ? 'Tampilkan' : 'Sembunyikan'}" class="p-1.5 rounded-lg ${isHidden ? 'text-amber-400 bg-amber-500/10' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/80'}"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${isHidden ? 'M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 5.2A10.5 10.5 0 0112 5c4.5 0 8.3 2.9 9.5 7a10 10 0 01-2.1 3.7' : 'M2.5 12C3.7 8 7.5 5 12 5s8.3 3 9.5 7c-1.2 4-5 7-9.5 7s-8.3-3-9.5-7zm9.5-3a3 3 0 100 6 3 3 0 000-6z'}"/></svg></button>
        <button onclick="openEditModal('${item.id}')" title="Edit" class="p-1.5 rounded-lg text-zinc-400 hover:text-sky-400 hover:bg-zinc-800/80"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.4-9.4a2 2 0 112.8 2.8L11.8 15H9v-2.8l8.6-8.6z"/></svg></button>
        <button onclick="deleteLink('${item.id}', '${escapeHtml(item.title)}')" title="Hapus" class="p-1.5 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-zinc-800/80"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.9 12.1A2 2 0 0116.1 21H7.9a2 2 0 01-2-1.9L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>
      </div>` : `
      <button onclick="event.stopPropagation();" class="p-1.5 rounded-lg ${isFavorite ? 'text-amber-400' : 'text-zinc-600'}" aria-label="${isFavorite ? 'Favorit' : ''}" tabindex="-1"><svg class="w-4 h-4" viewBox="0 0 24 24" fill="${isFavorite ? 'currentColor' : 'none'}" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="m12 3 2.75 5.57 6.15.9-4.45 4.34 1.05 6.13L12 17.05l-5.5 2.89 1.05-6.13L3.1 9.47l6.15-.9L12 3z"/></svg></button>`;
    return `<div onclick="openLinkConfirm('${item.id}')" style="animation-delay:${delay}ms" class="animate-row group relative flex items-center gap-3 p-3.5 sm:p-4 rounded-xl border cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/40 ${isHidden ? 'bg-zinc-950/50 border-dashed border-zinc-800/70 opacity-60 hover:opacity-95' : 'bg-zinc-900/60 hover:bg-zinc-900 border-zinc-800/80 hover:border-zinc-700'}">
      <div class="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-zinc-950 border border-zinc-800/90 flex items-center justify-center shrink-0 text-emerald-400 font-mono font-bold text-sm">${escapeHtml((item.title || 'P').slice(0,1).toUpperCase())}</div>
      <div class="flex-1 min-w-0"><div class="flex items-center gap-2 flex-wrap"><h3 class="font-semibold text-sm sm:text-base text-zinc-100 group-hover:text-emerald-400 transition-colors truncate">${escapeHtml(item.title)}</h3>${item.category ? `<span class="text-[10px] font-medium text-emerald-300/90 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">${escapeHtml(item.category)}</span>` : ''}${isHidden ? '<span class="text-[10px] font-mono text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded">Hidden</span>' : ''}<span class="hidden md:inline-block text-[11px] font-mono text-zinc-500 bg-zinc-950/80 px-2 py-0.5 rounded-md border border-zinc-800/70 truncate max-w-[180px]">${escapeHtml(domain)}</span></div>${item.description ? `<p class="text-xs sm:text-sm text-zinc-400 truncate mt-0.5">${escapeHtml(item.description)}</p>` : `<p class="text-xs text-zinc-500 font-mono truncate mt-0.5 md:hidden">${escapeHtml(domain)}</p>`}</div>
      <div class="text-zinc-600 group-hover:text-emerald-400 shrink-0"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 17L17 7M17 7H7M17 7v10"/></svg></div>${adminButtons}
    </div>`;
  }).join('');
}

// --- FAVORITE & CUSTOM ORDER ---
async function toggleFavorite(id) {
  const item = allLinks.find(x => String(x.id) === String(id));
  if (!item || !adminPass) return;
  const previous = !!item.favorite;
  item.favorite = !previous;
  renderCategoryFilter(); applyFiltersAndRender();
  try {
    const res = await fetch(API_URL, {method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body:JSON.stringify({action:'toggle_favorite', password:adminPass, id, favorite:item.favorite})});
    const json = await res.json();
    if (json.status !== 'success') throw new Error(json.message || 'Backend belum mendukung favorit');
    showToast(item.favorite ? 'Ditambahkan ke favorit' : 'Dihapus dari favorit', 'success');
  } catch (err) {
    item.favorite = previous; renderCategoryFilter(); applyFiltersAndRender();
    showToast(err.message || 'Gagal menyimpan favorit', 'error');
  }
}

async function moveLink(id, direction) {
  if (!adminPass) return;
  const from = allLinks.findIndex(x => String(x.id) === String(id));
  const to = from + direction;
  if (from < 0 || to < 0 || to >= allLinks.length) return;
  [allLinks[from], allLinks[to]] = [allLinks[to], allLinks[from]];
  applyFiltersAndRender();
  try {
    const res = await fetch(API_URL, {method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body:JSON.stringify({action:'reorder_links', password:adminPass, ids:allLinks.map(x => x.id)})});
    const json = await res.json();
    if (json.status !== 'success') throw new Error(json.message || 'Backend belum mendukung urutan link');
    await fetchData(); showToast('Urutan project disimpan', 'success');
  } catch (err) { await fetchData(); showToast(err.message || 'Gagal menyimpan urutan', 'error'); }
}

async function moveCategory(id, direction) {
  if (!adminPass) return;
  const from = allCategories.findIndex(x => String(x.id) === String(id));
  const to = from + direction;
  if (from < 0 || to < 0 || to >= allCategories.length) return;
  [allCategories[from], allCategories[to]] = [allCategories[to], allCategories[from]];
  renderCategoryManagerList(); renderCategoryFilter();
  try {
    const res = await fetch(API_URL, {method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body:JSON.stringify({action:'reorder_categories', password:adminPass, ids:allCategories.map(x => x.id)})});
    const json = await res.json();
    if (json.status !== 'success') throw new Error(json.message || 'Backend belum mendukung urutan kategori');
    await fetchData(); renderCategoryManagerList(); showToast('Urutan kategori disimpan', 'success');
  } catch (err) { await fetchData(); renderCategoryManagerList(); showToast(err.message || 'Gagal menyimpan urutan kategori', 'error'); }
}

// --- LOGIN ---
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const passInput = document.getElementById('loginPassword').value;
  const btn = document.getElementById('loginSubmitBtn');
  const orig = btn.textContent;

  btn.disabled = true;
  btn.textContent = 'Memverifikasi...';

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'login', password: passInput })
    });
    const json = await res.json();

    if (json.status === 'success') {
      adminPass = passInput;
      localStorage.setItem('sainbyte_admin_pass', adminPass);
      closeModal('loginModal');
      document.getElementById('loginForm').reset();
      renderAuthControls();
      renderCategoryFilter();
      applyFiltersAndRender();
      showToast('Mode admin aktif!', 'success');
    } else {
      showToast(json.message || 'Password salah', 'error');
    }
  } catch {
    showToast('Terjadi kesalahan jaringan', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
});

// --- ADD / EDIT LINK MODAL ---
function populateCategorySelect(selectedVal = '') {
  const select = document.getElementById('linkCategory');
  select.innerHTML = `<option value="">Tanpa Kategori</option>` + 
    allCategories.map(c => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join('');
  select.value = selectedVal;
}

function openAddModal() {
  document.getElementById('linkModalTitle').textContent = 'Tambah Link Project';
  document.getElementById('linkForm').reset();
  document.getElementById('linkId').value = '';
  populateCategorySelect('');
  openModal('linkModal');
  setTimeout(() => document.getElementById('linkTitle').focus(), 100);
}

function openEditModal(id) {
  const item = allLinks.find(l => l.id === id);
  if (!item) return;

  document.getElementById('linkModalTitle').textContent = 'Edit Link Project';
  document.getElementById('linkId').value = item.id;
  document.getElementById('linkTitle').value = item.title;
  document.getElementById('linkDesc').value = item.description || '';
  document.getElementById('linkUrl').value = item.url;
  populateCategorySelect(item.category || '');
  openModal('linkModal');
}

document.getElementById('linkForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('linkId').value;
  const title = document.getElementById('linkTitle').value.trim();
  const description = document.getElementById('linkDesc').value.trim();
  const url = normalizeUrl(document.getElementById('linkUrl').value);
  const category = document.getElementById('linkCategory').value;

  const btn = document.getElementById('linkSubmitBtn');
  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Menyimpan...';

  const action = id ? 'edit_link' : 'add_link';
  const payload = { action, password: adminPass, id, title, description, url, category };

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    const json = await res.json();

    if (json.status === 'success') {
      closeModal('linkModal');
      showToast(id ? 'Link diperbarui' : 'Link ditambahkan', 'success');
      await fetchData();
    } else {
      showToast(json.message || 'Gagal menyimpan', 'error');
    }
  } catch {
    showToast('Gagal terhubung ke server', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
});

// --- TOGGLE HIDE ---
async function toggleHideLink(id) {
  const target = allLinks.find(l => l.id === id);
  if (target) {
    target.hidden = !target.hidden;
    applyFiltersAndRender();
  }

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'toggle_hide', password: adminPass, id })
    });
    const json = await res.json();
    if (json.status === 'success') {
      showToast(json.hidden ? 'Link disembunyikan' : 'Link ditampilkan kembali', 'info');
    } else {
      showToast(json.message || 'Gagal mengubah status', 'error');
      await fetchData();
    }
  } catch {
    showToast('Gagal terhubung ke server', 'error');
    await fetchData();
  }
}

// --- DELETE LINK ---
async function deleteLink(id, title) {
  if (!confirm(`Hapus project "${title}"?`)) return;

  showToast('Menghapus...', 'info');
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'delete_link', password: adminPass, id })
    });
    const json = await res.json();
    if (json.status === 'success') {
      showToast('Link dihapus', 'success');
      await fetchData();
    } else {
      showToast(json.message || 'Gagal menghapus', 'error');
    }
  } catch {
    showToast('Gagal terhubung ke server', 'error');
  }
}

// --- CATEGORY MANAGER ---
function openCategoryModal() {
  renderCategoryManagerList();
  openModal('categoryModal');
}

function renderCategoryManagerList() {
  const container = document.getElementById('categoryManagerList');
  if (allCategories.length === 0) {
    container.innerHTML = `<p class="text-xs text-zinc-500 text-center py-4">Belum ada kategori. Tambahkan di atas.</p>`;
    return;
  }

  container.innerHTML = allCategories.map(cat => `
    <div class="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-zinc-950 border border-zinc-800/80">
      <span class="text-sm text-zinc-200 truncate pl-1">${escapeHtml(cat.name)}</span>
      <div class="flex items-center gap-1 shrink-0">
        <button onclick="moveCategory('${cat.id}', -1)" title="Pindah kiri/atas" ${allCategories.indexOf(cat) === 0 ? 'disabled' : ''} class="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-900 disabled:opacity-25"><svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m6 15 6-6 6 6"/></svg></button>
        <button onclick="moveCategory('${cat.id}', 1)" title="Pindah kanan/bawah" ${allCategories.indexOf(cat) === allCategories.length - 1 ? 'disabled' : ''} class="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-900 disabled:opacity-25"><svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m6 9 6 6 6-6"/></svg></button>
        <button 
          onclick="renameCategory('${cat.id}', '${escapeHtml(cat.name)}')" 
          title="Rename"
          class="p-1.5 rounded-lg text-zinc-400 hover:text-sky-400 hover:bg-zinc-900 transition-colors"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
        </button>
        <button 
          onclick="deleteCategory('${cat.id}', '${escapeHtml(cat.name)}')" 
          title="Hapus"
          class="p-1.5 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-zinc-900 transition-colors"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
        </button>
      </div>
    </div>
  `).join('');
}

document.getElementById('addCategoryForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('newCategoryName');
  const name = input.value.trim();
  if (!name) return;

  const btn = document.getElementById('addCatBtn');
  btn.disabled = true;
  btn.textContent = '...';

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'add_category', password: adminPass, name })
    });
    const json = await res.json();
    if (json.status === 'success') {
      input.value = '';
      showToast('Kategori ditambahkan', 'success');
      await fetchData();
      renderCategoryManagerList();
    } else {
      showToast(json.message || 'Gagal menambah kategori', 'error');
    }
  } catch {
    showToast('Gagal terhubung ke server', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Tambah';
  }
});

async function renameCategory(id, oldName) {
  const newName = prompt('Ubah nama kategori:', oldName);
  if (!newName || newName.trim() === '' || newName.trim() === oldName) return;

  showToast('Mengubah nama...', 'info');
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'rename_category', password: adminPass, id, name: newName.trim() })
    });
    const json = await res.json();
    if (json.status === 'success') {
      if (selectedCategory === oldName) selectedCategory = newName.trim();
      showToast('Kategori diubah', 'success');
      await fetchData();
      renderCategoryManagerList();
    } else {
      showToast(json.message || 'Gagal mengubah kategori', 'error');
    }
  } catch {
    showToast('Gagal terhubung ke server', 'error');
  }
}

async function deleteCategory(id, name) {
  if (!confirm(`Hapus kategori "${name}"? (Project di dalamnya tidak terhapus, hanya jadi Tanpa Kategori)`)) return;

  showToast('Menghapus kategori...', 'info');
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'delete_category', password: adminPass, id })
    });
    const json = await res.json();
    if (json.status === 'success') {
      if (selectedCategory === name) selectedCategory = 'ALL';
      showToast('Kategori dihapus', 'success');
      await fetchData();
      renderCategoryManagerList();
    } else {
      showToast(json.message || 'Gagal menghapus', 'error');
    }
  } catch {
    showToast('Gagal terhubung ke server', 'error');
  }
}

// --- MODAL ANIMATION HELPERS ---
function openModal(id) {
  const modal = document.getElementById(id);
  const card = modal.querySelector('.modal-card');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  requestAnimationFrame(() => {
    modal.classList.remove('opacity-0');
    card.classList.remove('scale-95', 'opacity-0');
    card.classList.add('scale-100', 'opacity-100');
  });
}

function closeModal(id) {
  const modal = document.getElementById(id);
  const card = modal.querySelector('.modal-card');
  modal.classList.add('opacity-0');
  card.classList.remove('scale-100', 'opacity-100');
  card.classList.add('scale-95', 'opacity-0');
  setTimeout(() => {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }, 220);
}

['loginModal', 'linkModal', 'categoryModal', 'openLinkModal'].forEach(id => {
  document.getElementById(id).addEventListener('click', (e) => {
    if (e.target.id === id) closeModal(id);
  });
});

// --- TOAST ---
let toastTimer;
function showToast(msg, type = 'info') {
  const toast = document.getElementById('toast');
  const icon = document.getElementById('toastIcon');
  const message = document.getElementById('toastMessage');

  const colors = {
    success: 'bg-emerald-400',
    error: 'bg-rose-400',
    info: 'bg-sky-400'
  };
  icon.innerHTML = `<span class="w-2 h-2 rounded-full ${colors[type] || colors.info}"></span>`;
  message.textContent = msg;

  toast.classList.remove('translate-y-20', 'opacity-0');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.add('translate-y-20', 'opacity-0');
  }, 3000);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
