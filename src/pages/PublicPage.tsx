import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection,
  doc,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  Lock,
  MessageSquare,
  Monitor,
  Moon,
  Palette,
  Pencil,
  Plus,
  Search,
  Smartphone,
  Star,
  Sun,
  Tag,
  Trash2,
  Unlock,
  Upload,
} from 'lucide-react';
import {
  db,
  FirebaseDiagnostics,
  formatFirestoreError,
  getFirebaseDiagnostics,
  OperationType,
  reportFirestoreError,
  safeAddDoc,
  safeDeleteDoc,
  safeUpdateDoc,
  subscribeFirebaseDiagnostics,
  withTimeout,
} from '../firebase';
import { formatAuthError, useAuth } from '../context/AuthContext';
import { ACCENT_OPTIONS, useTheme } from '../context/ThemeContext';
import { CategoryItem, ProjectItem } from '../types/models';
import { getTodayKey, normalizeUrl } from '../utils/format';
import CategoryFilterBar from '../components/CategoryFilterBar';
import ConfirmDialog from '../components/ConfirmDialog';
import ChatBox from '../components/ChatBox';
import Modal from '../components/Modal';
import PixelLogoSB from '../components/PixelLogoSB';
import ProjectCard from '../components/ProjectCard';
import { OfflineIndicator, PWAInstallButton } from '../components/PWAInstallButton';
import { RippleLayer, useTactileRipple } from '../components/TactileRipple';
import Toast from '../components/Toast';
import VisitCounter from '../components/VisitCounter';

export default function PublicPage() {
  const navigate = useNavigate();
  const {
    user,
    isOwner,
    isEmailMatch,
    ownerEmail,
    loginWithGoogle,
    loginWithEmail,
    resetPassword,
    resendVerification,
    reloadUser,
  } = useAuth();
  const { themeMode, setThemeMode, accent, setAccent } = useTheme();

  // Hidden 5-tap trigger ke /developer (tanpa tombol terlihat)
  const tapTimestamps = useRef<number[]>([]);
  const handleSecretTap = () => {
    const now = Date.now();
    tapTimestamps.current = tapTimestamps.current.filter((t) => now - t < 2500);
    tapTimestamps.current.push(now);
    if (tapTimestamps.current.length >= 5) {
      tapTimestamps.current = [];
      navigate('/developer');
    }
  };

  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectsError, setProjectsError] = useState('');
  const [diagnostics, setDiagnostics] = useState<FirebaseDiagnostics>(() =>
    getFirebaseDiagnostics()
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Semua');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState('');
  const toastTimerRef = useRef<number | null>(null);
  const [viewMode, setViewMode] = useState<'auto' | 'desktop' | 'mobile'>(() => {
    const saved = localStorage.getItem('sainbyte_view_mode');
    return saved === 'desktop' || saved === 'mobile' ? saved : 'auto';
  });

  const [chatModalOpen, setChatModalOpen] = useState(false);
  const [chatCount, setChatCount] = useState(0);

  const expectedPin = (import.meta.env.VITE_ADMIN_PIN || '').trim();
  const [isPinVerified, setIsPinVerified] = useState(() => !expectedPin);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authPass, setAuthPass] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectItem | null>(null);
  const [formState, setFormState] = useState({
    title: '',
    description: '',
    url: '',
    category: '',
    favorite: false,
    hidden: false,
  });
  const [projError, setProjError] = useState('');
  const [saving, setSaving] = useState(false);

  const [catModalOpen, setCatModalOpen] = useState(false);
  const [catInput, setCatInput] = useState('');
  const [catError, setCatError] = useState('');
  const [savingCat, setSavingCat] = useState(false);

  const [themeModalOpen, setThemeModalOpen] = useState(false);
  const [previewProject, setPreviewProject] = useState<ProjectItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<
    | { type: 'project'; item: ProjectItem }
    | { type: 'category'; item: CategoryItem }
    | null
  >(null);
  const [deleting, setDeleting] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const chatRipple = useTactileRipple();
  const themeRipple = useTactileRipple();
  const adminRipple = useTactileRipple();

  useEffect(() => {
    localStorage.setItem('sainbyte_view_mode', viewMode);
  }, [viewMode]);

  useEffect(() => subscribeFirebaseDiagnostics(setDiagnostics), []);

  const showToast = (msg: string) => {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    setToastMsg(msg);
    toastTimerRef.current = window.setTimeout(() => {
      setToastMsg('');
      toastTimerRef.current = null;
    }, 4200);
  };

  const isAdminActive = Boolean((!expectedPin || isPinVerified) && isOwner);

  useEffect(() => {
    document.title = 'sainbyte';
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'projects'), orderBy('order', 'asc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: ProjectItem[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            title: String(data.title || ''),
            description: String(data.description || ''),
            url: String(data.url || ''),
            category: String(data.category || 'Umum'),
            favorite: Boolean(data.favorite),
            hidden: Boolean(data.hidden),
            clicks: Number(data.clicks) || 0,
            order: Number(data.order) || 0,
            createdAt: data.createdAt || null,
            updatedAt: data.updatedAt || null,
          };
        });
        setProjects(list);
        if (!snap.metadata.fromCache) {
          setProjectsError('');
        }
        setLoading(false);
      },
      (err) => {
        reportFirestoreError(err, OperationType.LIST, 'projects');
        setProjectsError(formatFirestoreError(err));
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'categories'), orderBy('name', 'asc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: CategoryItem[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            name: String(data.name || '').trim(),
            createdAt: data.createdAt || null,
          };
        });
        setCategories(list.filter((c) => c.name.length > 0));
      },
      (err) => {
        reportFirestoreError(err, OperationType.LIST, 'categories');
      }
    );
    return () => unsub();
  }, []);

  const visibleProjects = useMemo(
    () => (isAdminActive ? projects : projects.filter((p) => !p.hidden)),
    [projects, isAdminActive]
  );

  const favoriteCount = useMemo(
    () => visibleProjects.filter((p) => Boolean(p.favorite)).length,
    [visibleProjects]
  );

  const categoryStats = useMemo(() => {
    const counts: Record<string, number> = {};
    categories.forEach((c) => {
      if (c.name) counts[c.name] = counts[c.name] || 0;
    });
    visibleProjects.forEach((p) => {
      const cat = (p.category || 'Umum').trim() || 'Umum';
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => a[0].localeCompare(b[0]));
  }, [visibleProjects, categories]);

  const allCategoryNames = useMemo(() => {
    const names = new Set<string>();
    categories.forEach((c) => {
      if (c.name) names.add(c.name);
    });
    projects.forEach((p) => {
      const cat = (p.category || 'Umum').trim() || 'Umum';
      names.add(cat);
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [projects, categories]);

  const filteredProjects = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return visibleProjects.filter((p) => {
      const cat = (p.category || 'Umum').trim() || 'Umum';
      const matchCat =
        selectedCategory === 'Semua'
          ? true
          : selectedCategory === '__favorit__'
          ? Boolean(p.favorite)
          : cat === selectedCategory;
      const matchQuery =
        !q ||
        p.title.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.url.toLowerCase().includes(q) ||
        cat.toLowerCase().includes(q);
      return matchCat && matchQuery;
    });
  }, [visibleProjects, searchQuery, selectedCategory]);

  const requireAdmin = (callback?: () => void) => {
    if (isAdminActive) {
      callback?.();
      return;
    }
    setPendingAction(() => callback || null);
    setPinError('');
    setPinInput('');
    setPinModalOpen(true);
  };

  const handlePinSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!expectedPin) {
      setIsPinVerified(true);
      return;
    }
    if (pinInput.trim() !== expectedPin) {
      setPinError('PIN salah.');
      return;
    }
    setPinError('');
    setIsPinVerified(true);

    if (isOwner) {
      setPinModalOpen(false);
      showToast('Mode admin aktif');
      const cb = pendingAction;
      setPendingAction(null);
      cb?.();
    }
  };

  const handleInlineGoogleAuth = async () => {
    setAuthLoading(true);
    setPinError('');
    try {
      const cred = await loginWithGoogle();
      const signedEmail = (cred.user.email || '').trim().toLowerCase();
      if (signedEmail !== ownerEmail) {
        setPinError(`Akun ${cred.user.email} bukan pemilik (${ownerEmail}).`);
        return;
      }
      if (!cred.user.emailVerified) {
        setPinError('Email akun belum terverifikasi.');
        return;
      }
      setPinModalOpen(false);
      showToast('Mode admin aktif');
      const cb = pendingAction;
      setPendingAction(null);
      cb?.();
    } catch (err) {
      setPinError(formatAuthError(err));
      console.error(err);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleInlineEmailAuth = async (e: FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setPinError('');
    try {
      const cred = await loginWithEmail(authEmail, authPass);
      const signedEmail = (cred.user.email || '').trim().toLowerCase();
      if (signedEmail !== ownerEmail) {
        setPinError(`Akun ${cred.user.email} bukan pemilik (${ownerEmail}).`);
        return;
      }
      if (!cred.user.emailVerified) {
        setPinError('Email belum terverifikasi. Silakan verifikasi email terlebih dahulu.');
        return;
      }
      setPinModalOpen(false);
      showToast('Mode admin aktif');
      const cb = pendingAction;
      setPendingAction(null);
      cb?.();
    } catch (err) {
      setPinError(formatAuthError(err));
      console.error(err);
    } finally {
      setAuthLoading(false);
    }
  };

  const openAddModal = () => {
    requireAdmin(() => {
      setEditingProject(null);
      setProjError('');
      setFormState({
        title: '',
        description: '',
        url: '',
        category: '',
        favorite: false,
        hidden: false,
      });
      setProjectModalOpen(true);
    });
  };

  const openEditModal = (project: ProjectItem) => {
    requireAdmin(() => {
      setEditingProject(project);
      setProjError('');
      setFormState({
        title: project.title,
        description: project.description,
        url: project.url,
        category: project.category,
        favorite: Boolean(project.favorite),
        hidden: Boolean(project.hidden),
      });
      setProjectModalOpen(true);
    });
  };

  const openCategoryModal = () => {
    requireAdmin(() => {
      setCatError('');
      setCatInput('');
      setCatModalOpen(true);
    });
  };

  const handleSaveCategory = async (e: FormEvent) => {
    e.preventDefault();
    setCatError('');
    if (!isOwner) {
      setCatError('Sesi pemilik belum aktif. Silakan masuk sebagai pemilik terverifikasi.');
      return;
    }
    const cleanName = catInput.trim().slice(0, 60);
    if (!cleanName) {
      setCatError('Nama kategori wajib diisi.');
      return;
    }
    const exists = categories.some((c) => c.name.toLowerCase() === cleanName.toLowerCase());
    if (exists) {
      setCatError('Kategori tersebut sudah tersedia.');
      return;
    }
    setSavingCat(true);
    try {
      const res = await safeAddDoc(
        'categories',
        { name: cleanName },
        { serverTimestampFields: ['createdAt'] }
      );
      if (res.usedFallback) {
        setCategories((prev) =>
          [...prev, { id: res.id, name: cleanName, createdAt: new Date() }].sort((a, b) =>
            a.name.localeCompare(b.name)
          )
        );
      }
      setCatInput('');
      showToast('Kategori ditambahkan');
    } catch (err) {
      const msg = formatFirestoreError(err);
      setCatError(msg);
      showToast(msg);
      console.error('Save category error:', err);
    } finally {
      setSavingCat(false);
    }
  };

  const handleDeleteCategory = (cat: CategoryItem) => {
    requireAdmin(() => {
      setDeleteTarget({ type: 'category', item: cat });
    });
  };

  const handleSaveProject = async (e: FormEvent) => {
    e.preventDefault();
    setProjError('');
    if (!isOwner) {
      const msg = 'Sesi pemilik belum aktif. Silakan masuk sebagai pemilik terverifikasi.';
      setProjError(msg);
      showToast(msg);
      return;
    }
    const safeUrl = normalizeUrl(formState.url);
    if (!formState.title.trim() || !safeUrl) {
      const msg = 'Judul dan URL valid (http/https) wajib diisi.';
      setProjError(msg);
      showToast(msg);
      return;
    }
    setSaving(true);
    try {
      const cleanCategory = (formState.category.trim() || 'Umum').slice(0, 60);
      const baseFields = {
        title: formState.title.trim().slice(0, 120),
        description: formState.description.trim().slice(0, 500),
        url: safeUrl.slice(0, 500),
        category: cleanCategory,
        favorite: Boolean(formState.favorite),
        hidden: Boolean(formState.hidden),
      };

      if (editingProject) {
        const res = await safeUpdateDoc(
          `projects/${editingProject.id}`,
          baseFields,
          { serverTimestampFields: ['updatedAt'] }
        );
        if (res.usedFallback) {
          setProjects((prev) =>
            prev.map((p) =>
              p.id === editingProject.id ? { ...p, ...baseFields, updatedAt: new Date() } : p
            )
          );
        }
        showToast('Proyek diperbarui');
      } else {
        const maxOrder =
          projects.length > 0
            ? Math.max(...projects.map((p) => (Number.isFinite(p.order) ? Math.floor(p.order) : 0)))
            : -1;
        const nextOrder = Math.max(0, maxOrder + 1);
        const res = await safeAddDoc(
          'projects',
          {
            ...baseFields,
            clicks: 0,
            order: nextOrder,
          },
          { serverTimestampFields: ['createdAt', 'updatedAt'] }
        );
        if (res.usedFallback) {
          setProjects((prev) => [
            ...prev,
            {
              id: res.id,
              ...baseFields,
              clicks: 0,
              order: nextOrder,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ]);
        }
        showToast('Proyek disimpan');
      }

      if (
        cleanCategory &&
        !categories.some((c) => c.name.toLowerCase() === cleanCategory.toLowerCase())
      ) {
        void safeAddDoc(
          'categories',
          { name: cleanCategory },
          { serverTimestampFields: ['createdAt'] }
        ).catch(() => {});
      }

      setProjectModalOpen(false);
    } catch (err) {
      const msg = formatFirestoreError(err);
      setProjError(msg);
      showToast(msg);
      console.error('Save project error:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleFavorite = (project: ProjectItem) => {
    requireAdmin(async () => {
      try {
        const nextFav = !project.favorite;
        const res = await safeUpdateDoc(
          `projects/${project.id}`,
          { favorite: nextFav },
          { serverTimestampFields: ['updatedAt'] }
        );
        if (res.usedFallback) {
          setProjects((prev) =>
            prev.map((p) =>
              p.id === project.id ? { ...p, favorite: nextFav, updatedAt: new Date() } : p
            )
          );
        }
        showToast(nextFav ? 'Ditambahkan ke favorit' : 'Dihapus dari favorit');
      } catch (err) {
        showToast(formatFirestoreError(err));
        console.error(err);
      }
    });
  };

  const handleToggleHidden = (project: ProjectItem) => {
    requireAdmin(async () => {
      try {
        const nextHidden = !project.hidden;
        const res = await safeUpdateDoc(
          `projects/${project.id}`,
          { hidden: nextHidden },
          { serverTimestampFields: ['updatedAt'] }
        );
        if (res.usedFallback) {
          setProjects((prev) =>
            prev.map((p) =>
              p.id === project.id ? { ...p, hidden: nextHidden, updatedAt: new Date() } : p
            )
          );
        }
        showToast(
          nextHidden ? 'Proyek disembunyikan dari publik' : 'Proyek ditampilkan ke publik'
        );
      } catch (err) {
        showToast(formatFirestoreError(err));
        console.error(err);
      }
    });
  };

  const handleDeleteProject = (project: ProjectItem) => {
    requireAdmin(() => {
      setDeleteTarget({ type: 'project', item: project });
    });
  };

  const executeConfirmedDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget.type === 'project') {
        const target = deleteTarget.item;
        const res = await safeDeleteDoc(`projects/${target.id}`);
        if (res.usedFallback) {
          setProjects((prev) => prev.filter((p) => p.id !== target.id));
        }
        showToast('Proyek dihapus');
      } else {
        const cat = deleteTarget.item;
        const res = await safeDeleteDoc(`categories/${cat.id}`);
        if (res.usedFallback) {
          setCategories((prev) => prev.filter((c) => c.id !== cat.id));
        }
        if (selectedCategory === cat.name) {
          setSelectedCategory('Semua');
        }
        showToast('Kategori dihapus');
      }
      setDeleteTarget(null);
    } catch (err) {
      showToast(formatFirestoreError(err));
      console.error(err);
    } finally {
      setDeleting(false);
    }
  };

  const handleTrackClick = async (project: ProjectItem) => {
    try {
      await updateDoc(doc(db, 'projects', project.id), {
        clicks: increment(1),
      });
      const todayKey = getTodayKey();
      await setDoc(
        doc(db, 'analytics', todayKey),
        {
          date: todayKey,
          visits: increment(0),
          clicks: increment(1),
        },
        { merge: true }
      );
    } catch (err) {
      reportFirestoreError(err, OperationType.UPDATE, `projects/${project.id}`);
    }
  };

  const handleCopyLink = async (project: ProjectItem) => {
    const safeUrl = normalizeUrl(project.url);
    if (!safeUrl) {
      showToast('URL tidak valid');
      return;
    }
    try {
      await navigator.clipboard.writeText(safeUrl);
      setCopiedId(project.id);
      showToast('Tautan disalin');
      window.setTimeout(() => setCopiedId(null), 1600);
    } catch {
      showToast('Gagal menyalin tautan');
    }
  };

  const persistOrder = async (newList: ProjectItem[]) => {
    try {
      const batch = writeBatch(db);
      newList.forEach((item, index) => {
        batch.update(doc(db, 'projects', item.id), { order: index });
      });
      await withTimeout(batch.commit());
      showToast('Urutan disimpan');
    } catch (err) {
      reportFirestoreError(err, OperationType.WRITE, 'projects');
      showToast(formatFirestoreError(err));
    }
  };

  const handleDropOnCard = async (targetId: string) => {
    setDragOverId(null);
    if (!isAdminActive || !draggedId || draggedId === targetId) {
      setDraggedId(null);
      return;
    }
    const fromIdx = projects.findIndex((p) => p.id === draggedId);
    const toIdx = projects.findIndex((p) => p.id === targetId);
    if (fromIdx === -1 || toIdx === -1) {
      setDraggedId(null);
      return;
    }

    const updated = [...projects];
    const [moved] = updated.splice(fromIdx, 1);
    updated.splice(toIdx, 0, moved);
    setDraggedId(null);
    await persistOrder(updated);
  };

  const handleMoveStep = async (project: ProjectItem, direction: number) => {
    if (!isAdminActive) return;
    const filteredIdx = filteredProjects.findIndex((p) => p.id === project.id);
    const targetFilteredIdx = filteredIdx + direction;
    if (filteredIdx === -1 || targetFilteredIdx < 0 || targetFilteredIdx >= filteredProjects.length) {
      return;
    }
    const neighbor = filteredProjects[targetFilteredIdx];
    const fromIdx = projects.findIndex((p) => p.id === project.id);
    const toIdx = projects.findIndex((p) => p.id === neighbor.id);
    if (fromIdx === -1 || toIdx === -1) return;

    const updated = [...projects];
    [updated[fromIdx], updated[toIdx]] = [updated[toIdx], updated[fromIdx]];
    await persistOrder(updated);
  };

  const handleExportJson = () => {
    if (projects.length === 0) {
      showToast('Belum ada data untuk diekspor');
      return;
    }
    const clean = projects.map(
      ({ title, description, url, category, favorite, hidden, clicks, order }) => ({
        title,
        description,
        url,
        category,
        favorite: Boolean(favorite),
        hidden: Boolean(hidden),
        clicks: clicks || 0,
        order: order || 0,
      })
    );
    const blob = new Blob([JSON.stringify(clean, null, 2)], { type: 'application/json' });
    const dlUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = dlUrl;
    a.download = `sainbyte-projects-${getTodayKey()}.json`;
    a.click();
    URL.revokeObjectURL(dlUrl);
    showToast('JSON berhasil diekspor');
  };

  const handleImportJson = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) {
        showToast('Format JSON harus berupa daftar array');
        return;
      }
      const batch = writeBatch(db);
      let baseOrder =
        projects.length > 0 ? Math.max(...projects.map((p) => p.order || 0)) + 1 : 0;
      let count = 0;

      parsed.forEach((item) => {
        if (item && typeof item === 'object' && item.title && item.url) {
          const safeUrl = normalizeUrl(String(item.url));
          if (!safeUrl) return;
          const ref = doc(collection(db, 'projects'));
          batch.set(ref, {
            title: String(item.title).trim().slice(0, 120),
            description: String(item.description || '').trim().slice(0, 500),
            url: safeUrl.slice(0, 500),
            category: (String(item.category || 'Umum').trim() || 'Umum').slice(0, 60),
            favorite: Boolean(item.favorite),
            hidden: Boolean(item.hidden),
            clicks: Math.max(0, Math.floor(Number(item.clicks) || 0)),
            order: baseOrder++,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          count++;
        }
      });

      if (count === 0) {
        showToast('Tidak ada item valid di file JSON');
        return;
      }
      await withTimeout(batch.commit());
      showToast(`${count} proyek diimpor`);
    } catch (err) {
      reportFirestoreError(err, OperationType.WRITE, 'projects');
      showToast(formatFirestoreError(err));
    }
  };

  const activeDbError =
    projectsError ||
    (diagnostics.connectionStatus === 'error' && projects.length === 0
      ? diagnostics.connectionError || ''
      : '');

  const containerClass =
    viewMode === 'mobile'
      ? 'w-full max-w-md px-4 mx-auto'
      : viewMode === 'desktop'
      ? 'w-full max-w-4xl px-5 sm:px-8 mx-auto'
      : 'w-full max-w-2xl px-4 sm:px-6 mx-auto';

  const gridClass =
    viewMode === 'mobile'
      ? 'grid-cols-1'
      : viewMode === 'desktop'
      ? 'grid-cols-1 sm:grid-cols-2'
      : 'grid-cols-1';

  return (
    <div className="h-dvh overflow-hidden bg-slate-50 text-slate-900 dark:bg-[#0D0D0D] dark:text-zinc-100 transition-colors duration-200 flex flex-col">
      <Toast message={toastMsg} />
      <OfflineIndicator />

      {/* Header, Pencarian, & Filter Kategori Terkunci di Atas */}
      <div className="shrink-0 z-20 border-b border-slate-200/70 dark:border-[#262626] bg-slate-50/95 dark:bg-[#0D0D0D]/95 backdrop-blur-md">
        <div className={`${containerClass} py-3 space-y-2.5`}>
          <header className="flex items-center justify-between gap-2">
            <div
              onClick={handleSecretTap}
              className="flex items-center gap-2.5 min-w-0 select-none cursor-default"
            >
              <PixelLogoSB className="w-7 h-7 sm:w-8 sm:h-8 shrink-0" />
              <div className="min-w-0">
                <h1 className="text-[15px] sm:text-base font-bold tracking-tight text-slate-900 dark:text-white leading-tight truncate">
                  sainbyte
                </h1>
                <p className="text-[10px] font-mono text-slate-500 dark:text-zinc-500 leading-tight truncate">
                  dashboard list project
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <PWAInstallButton />

              <div className="relative shrink-0">
                <button
                  type="button"
                  onPointerDown={chatRipple.triggerRipple}
                  onClick={() => setChatModalOpen(true)}
                  title="Chatbox"
                  aria-label="Buka Chatbox"
                  className="relative overflow-hidden w-8 h-8 flex items-center justify-center rounded-xl bg-slate-200/70 dark:bg-[#161616] border border-slate-300/60 dark:border-[#262626] text-slate-700 dark:text-zinc-300 hover:border-[#F97316]/50 hover:text-slate-900 dark:hover:text-white transition-transform duration-150 active:scale-[0.96]"
                >
                  <RippleLayer ripples={chatRipple.ripples} />
                  <MessageSquare className="w-3.5 h-3.5 relative z-10" />
                </button>
                {chatCount > 0 && (
                  <span className="pointer-events-none absolute -top-1 -right-1 min-w-[14px] h-3.5 px-1 rounded-full accent-bg text-white text-[9px] font-mono leading-none flex items-center justify-center shadow-xs">
                    {chatCount > 99 ? '99+' : chatCount}
                  </span>
                )}
              </div>

              <button
                type="button"
                onPointerDown={themeRipple.triggerRipple}
                onClick={() => setThemeModalOpen(true)}
                title="Tema, Warna & Pengaturan"
                aria-label="Pengaturan Tema"
                className="relative overflow-hidden w-8 h-8 flex items-center justify-center rounded-xl bg-slate-200/70 dark:bg-[#161616] border border-slate-300/60 dark:border-[#262626] text-slate-700 dark:text-zinc-300 hover:border-[#F97316]/50 hover:text-slate-900 dark:hover:text-white transition-transform duration-150 active:scale-[0.96]"
              >
                <RippleLayer ripples={themeRipple.ripples} />
                <Palette className="w-3.5 h-3.5 relative z-10" />
              </button>

              <button
                type="button"
                onPointerDown={adminRipple.triggerRipple}
                onClick={() => {
                  if (isAdminActive) {
                    if (expectedPin) setIsPinVerified(false);
                    showToast('Mode admin dikunci');
                  } else {
                    requireAdmin();
                  }
                }}
                title={isAdminActive ? 'Mode Admin Aktif (Klik untuk kunci)' : 'Mode Admin'}
                aria-label="Mode Admin"
                className={`relative overflow-hidden w-8 h-8 flex items-center justify-center rounded-xl border transition-transform duration-150 active:scale-[0.96] ${
                  isAdminActive
                    ? 'accent-bg border-transparent text-white shadow-xs'
                    : 'bg-slate-200/70 dark:bg-[#161616] border-slate-300/60 dark:border-[#262626] text-slate-700 dark:text-zinc-300 hover:border-[#F97316]/50 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <RippleLayer ripples={adminRipple.ripples} />
                <span className="relative z-10 flex items-center justify-center">
                  {isAdminActive ? (
                    <Unlock className="w-3.5 h-3.5" />
                  ) : (
                    <Lock className="w-3.5 h-3.5" />
                  )}
                </span>
              </button>
            </div>
          </header>

          {/* Search + Jumlah Proyek + Kontrol Admin */}
          <div className="space-y-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari project atau keterangan..."
                className="w-full h-8 pl-8 pr-3 text-[11px] rounded-xl border border-slate-200/80 dark:border-[#262626] bg-white/80 dark:bg-[#161616] text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:border-[#F97316]/70 accent-ring transition-colors duration-200"
              />
            </div>

            <div className="flex items-center justify-between gap-2 min-h-[22px]">
              <p className="text-[10px] font-mono text-slate-500 dark:text-zinc-400 tabular-nums">
                {filteredProjects.length} project
              </p>

              {isAdminActive && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={openAddModal}
                    className="h-6 inline-flex items-center gap-1 px-2 rounded-lg accent-bg text-white text-[10px] font-medium transition-transform duration-150 active:scale-[0.96] whitespace-nowrap"
                  >
                    <Plus className="w-2.5 h-2.5" />
                    <span>Tambah</span>
                  </button>
                  <button
                    type="button"
                    onClick={openCategoryModal}
                    className="h-6 inline-flex items-center gap-1 px-2 rounded-lg bg-slate-200/70 dark:bg-[#161616] border border-slate-300/60 dark:border-[#262626] text-slate-700 dark:text-zinc-200 hover:border-[#F97316]/50 text-[10px] font-medium transition-transform duration-150 active:scale-[0.96] whitespace-nowrap"
                  >
                    <Tag className="w-2.5 h-2.5" />
                    <span>Kategori</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleExportJson}
                    title="Ekspor JSON"
                    aria-label="Ekspor JSON"
                    className="w-6 h-6 flex items-center justify-center rounded-lg bg-slate-200/70 dark:bg-[#161616] border border-slate-300/60 dark:border-[#262626] text-slate-600 dark:text-zinc-300 hover:border-[#F97316]/50 transition-transform duration-150 active:scale-[0.96]"
                  >
                    <Download className="w-2.5 h-2.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    title="Impor JSON"
                    aria-label="Impor JSON"
                    className="w-6 h-6 flex items-center justify-center rounded-lg bg-slate-200/70 dark:bg-[#161616] border border-slate-300/60 dark:border-[#262626] text-slate-600 dark:text-zinc-300 hover:border-[#F97316]/50 transition-transform duration-150 active:scale-[0.96]"
                  >
                    <Upload className="w-2.5 h-2.5" />
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/json"
                    onChange={(e) => void handleImportJson(e)}
                    className="hidden"
                  />
                </div>
              )}
            </div>

            {/* Sliding Pill Category Filter Bar */}
            <CategoryFilterBar
              selectedCategory={selectedCategory}
              onSelectCategory={setSelectedCategory}
              totalCount={visibleProjects.length}
              favoriteCount={favoriteCount}
              categoryStats={categoryStats}
            />
          </div>
        </div>
      </div>

      {/* Area Daftar Proyek yang Dapat Digulir di Tengah */}
      <main className="flex-1 min-h-0 overflow-y-auto">
        <div className={`${containerClass} py-3.5 space-y-3`}>
          {activeDbError && (
            <section className="rounded-xl border border-rose-500/40 bg-rose-50/90 dark:bg-rose-950/35 px-3.5 py-2.5 text-[11px] text-rose-800 dark:text-rose-200 leading-relaxed flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
              <div className="min-w-0 space-y-0.5">
                <p className="font-semibold">Masalah Koneksi Firestore</p>
                <p className="break-words">{activeDbError}</p>
              </div>
            </section>
          )}

          <section>
            {loading ? (
              <div className={`grid ${gridClass} gap-2.5`}>
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-20 rounded-xl border border-slate-200/70 dark:border-[#262626] bg-slate-200/60 dark:bg-[#161616] animate-pulse"
                  />
                ))}
              </div>
            ) : filteredProjects.length === 0 ? (
              activeDbError ? null : (
                <div className="text-center py-10 px-4 rounded-xl bg-white/70 dark:bg-[#161616]/60 border border-dashed border-slate-200/80 dark:border-[#262626]">
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                    Belum ada data
                  </p>
                  {isAdminActive && (
                    <button
                      type="button"
                      onClick={openAddModal}
                      className="mt-3 h-7 inline-flex items-center gap-1 px-3 rounded-lg accent-bg text-white text-[11px] font-medium transition-transform duration-150 active:scale-[0.96]"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Tambah Proyek Baru</span>
                    </button>
                  )}
                </div>
              )
            ) : (
              <div key={selectedCategory} className={`grid ${gridClass} gap-2.5`}>
                {filteredProjects.map((project, idx) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    index={idx}
                    copiedId={copiedId}
                    isAdminActive={isAdminActive}
                    isFirst={idx === 0}
                    isLast={idx === filteredProjects.length - 1}
                    draggedId={draggedId}
                    dragOverId={dragOverId}
                    onOpenPreview={setPreviewProject}
                    onCopyLink={(p) => void handleCopyLink(p)}
                    onDragStart={setDraggedId}
                    onDragOver={(e, id) => {
                      if (isAdminActive) {
                        e.preventDefault();
                        if (draggedId && draggedId !== id) setDragOverId(id);
                      }
                    }}
                    onDragLeave={(id) => {
                      if (dragOverId === id) setDragOverId(null);
                    }}
                    onDragEnd={() => {
                      setDraggedId(null);
                      setDragOverId(null);
                    }}
                    onDrop={(id) => void handleDropOnCard(id)}
                    onMoveStep={(p, dir) => void handleMoveStep(p, dir)}
                    onToggleHidden={handleToggleHidden}
                    onToggleFavorite={handleToggleFavorite}
                    onEdit={openEditModal}
                    onDelete={handleDeleteProject}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </main>

      {/* Footer Terkunci di Bawah */}
      <footer className="shrink-0 z-20 border-t border-slate-200/70 dark:border-[#262626] bg-slate-50/95 dark:bg-[#0D0D0D]/95 backdrop-blur-md py-2.5">
        <div className={containerClass}>
          <VisitCounter />
        </div>
      </footer>

      <ChatBox
        open={chatModalOpen}
        onClose={() => setChatModalOpen(false)}
        onCountChange={setChatCount}
        isAdminUnlocked={isAdminActive}
        onRequireAdmin={requireAdmin}
        showToast={showToast}
      />

      {/* Modal Verifikasi Admin (Centered) */}
      <Modal
        open={pinModalOpen}
        onClose={() => {
          setPinModalOpen(false);
          setPendingAction(null);
        }}
        title="Verifikasi Admin"
      >
        <div className="space-y-4">
          {expectedPin && !isPinVerified ? (
            <form onSubmit={handlePinSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Masukkan PIN Admin
                </label>
                <input
                  type="password"
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  autoFocus
                  placeholder="PIN"
                  className="w-full h-10 px-3 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 accent-ring"
                />
              </div>
              {pinError && <p className="text-xs text-rose-600 dark:text-rose-400">{pinError}</p>}
              <button
                type="submit"
                className="w-full h-10 rounded-xl accent-bg text-white text-sm font-medium transition-colors"
              >
                Lanjutkan
              </button>
            </form>
          ) : (
            <div className="space-y-4">
              {user && !isEmailMatch ? (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Akun saat ini ({user.email}) bukan akun pemilik. Masuk dengan akun pemilik untuk melanjutkan.
                </p>
              ) : user && isEmailMatch && !user.emailVerified ? (
                <div className="space-y-2">
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Email Anda belum terverifikasi. Verifikasi email atau masuk dengan Google.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        void resendVerification().then(() => showToast('Email verifikasi dikirim'))
                      }
                      className="flex-1 h-9 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium"
                    >
                      Kirim Verifikasi
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void reloadUser().then((ok) => {
                          if (ok) {
                            setPinModalOpen(false);
                            showToast('Mode admin aktif');
                            const cb = pendingAction;
                            setPendingAction(null);
                            cb?.();
                          } else {
                            setPinError('Status email masih belum terverifikasi.');
                          }
                        })
                      }
                      className="flex-1 h-9 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium"
                    >
                      Muat Ulang Status
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Masuk dengan akun pemilik Google atau Email/Kata Sandi agar perubahan tersimpan.
                </p>
              )}

              <button
                type="button"
                disabled={authLoading}
                onClick={() => void handleInlineGoogleAuth()}
                className="w-full h-10 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs sm:text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                {authLoading ? 'Memproses...' : 'Masuk dengan Google'}
              </button>

              <form
                onSubmit={(e) => void handleInlineEmailAuth(e)}
                className="space-y-2.5 pt-3 border-t border-slate-200 dark:border-slate-800"
              >
                <input
                  type="email"
                  required
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="Email pemilik"
                  className="w-full h-10 px-3 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 accent-ring"
                />
                <input
                  type="password"
                  required
                  value={authPass}
                  onChange={(e) => setAuthPass(e.target.value)}
                  placeholder="Kata sandi"
                  className="w-full h-10 px-3 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 accent-ring"
                />
                {pinError && <p className="text-xs text-rose-600 dark:text-rose-400">{pinError}</p>}
                <div className="flex items-center justify-between gap-2 pt-0.5">
                  <button
                    type="button"
                    disabled={authLoading}
                    onClick={() => {
                      if (!authEmail.trim()) {
                        setPinError('Masukkan email pemilik terlebih dahulu untuk reset kata sandi.');
                        return;
                      }
                      setPinError('');
                      void resetPassword(authEmail)
                        .then(() => showToast('Tautan reset kata sandi dikirim ke email'))
                        .catch((err) => setPinError(formatAuthError(err)));
                    }}
                    className="text-[11px] text-slate-500 dark:text-zinc-400 hover:underline"
                  >
                    Lupa kata sandi?
                  </button>
                </div>
                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full h-10 rounded-xl accent-bg text-white text-xs sm:text-sm font-medium transition-colors"
                >
                  Masuk dengan Email
                </button>
              </form>
            </div>
          )}
        </div>
      </Modal>

      {/* Modal Tambah / Edit Proyek (Centered) */}
      <Modal
        open={projectModalOpen}
        onClose={() => setProjectModalOpen(false)}
        title={editingProject ? 'Edit Proyek' : 'Tambah Proyek'}
      >
        <form onSubmit={(e) => void handleSaveProject(e)} className="space-y-3.5">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Judul
            </label>
            <input
              type="text"
              required
              maxLength={120}
              value={formState.title}
              onChange={(e) => setFormState((s) => ({ ...s, title: e.target.value }))}
              placeholder="Nama proyek"
              className="w-full h-10 px-3 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 accent-ring"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              URL
            </label>
            <input
              type="text"
              required
              maxLength={500}
              value={formState.url}
              onChange={(e) => setFormState((s) => ({ ...s, url: e.target.value }))}
              placeholder="https://..."
              className="w-full h-10 px-3 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 accent-ring"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                Kategori
              </label>
              <button
                type="button"
                onClick={openCategoryModal}
                className="text-[11px] accent-text hover:underline"
              >
                + Kelola Kategori
              </button>
            </div>
            <input
              type="text"
              maxLength={60}
              value={formState.category}
              onChange={(e) => setFormState((s) => ({ ...s, category: e.target.value }))}
              placeholder="Kategori (atau pilih di bawah)"
              className="w-full h-10 px-3 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 accent-ring"
            />
            {allCategoryNames.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {allCategoryNames.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setFormState((s) => ({ ...s, category: cat }))}
                    className={`h-6 px-2 rounded-full text-[10px] font-medium transition-colors ${
                      formState.category.trim().toLowerCase() === cat.toLowerCase()
                        ? 'accent-bg text-white'
                        : 'bg-slate-200/70 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-zinc-700'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Deskripsi
            </label>
            <textarea
              rows={3}
              maxLength={500}
              value={formState.description}
              onChange={(e) => setFormState((s) => ({ ...s, description: e.target.value }))}
              placeholder="Deskripsi singkat"
              className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 accent-ring"
            />
          </div>

          <button
            type="button"
            onClick={() => setFormState((s) => ({ ...s, favorite: !s.favorite }))}
            className={`w-full h-9 px-3 rounded-xl border text-xs font-medium flex items-center justify-between transition-colors ${
              formState.favorite
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-500 dark:text-amber-300'
                : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-zinc-300'
            }`}
          >
            <span className="inline-flex items-center gap-2">
              <Star
                className={`w-3.5 h-3.5 ${
                  formState.favorite ? 'fill-amber-400 text-amber-400' : 'text-slate-400'
                }`}
              />
              <span>Tandai sebagai Proyek Favorit</span>
            </span>
            <span className="text-[10px] font-mono">
              {formState.favorite ? 'Aktif' : 'Nonaktif'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFormState((s) => ({ ...s, hidden: !s.hidden }))}
            className={`w-full h-9 px-3 rounded-xl border text-xs font-medium flex items-center justify-between transition-colors ${
              formState.hidden
                ? 'border-slate-400/50 bg-slate-200/70 dark:bg-zinc-800 text-slate-800 dark:text-zinc-100'
                : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-zinc-300'
            }`}
          >
            <span className="inline-flex items-center gap-2">
              {formState.hidden ? (
                <EyeOff className="w-3.5 h-3.5 text-slate-700 dark:text-zinc-200" />
              ) : (
                <Eye className="w-3.5 h-3.5 text-slate-400" />
              )}
              <span>Sembunyikan dari Pengunjung Publik</span>
            </span>
            <span className="text-[10px] font-mono">
              {formState.hidden ? 'Tersembunyi' : 'Publik'}
            </span>
          </button>

          {projError && (
            <p className="text-xs text-rose-600 dark:text-rose-400 leading-relaxed">{projError}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setProjectModalOpen(false)}
              className="h-8 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="h-8 px-3.5 rounded-xl accent-bg text-white text-xs font-medium disabled:opacity-50"
            >
              {saving ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Tambah & Kelola Kategori (Centered) */}
      <Modal
        open={catModalOpen}
        onClose={() => setCatModalOpen(false)}
        title="Kelola Kategori"
      >
        <div className="space-y-4">
          <form onSubmit={(e) => void handleSaveCategory(e)} className="space-y-2.5">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
              Tambah Kategori Baru
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                required
                maxLength={60}
                value={catInput}
                onChange={(e) => setCatInput(e.target.value)}
                placeholder="Nama kategori..."
                className="flex-1 h-9 px-3 text-xs sm:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 accent-ring"
              />
              <button
                type="submit"
                disabled={savingCat}
                className="h-9 px-3.5 rounded-xl accent-bg text-white text-xs font-medium disabled:opacity-50 shrink-0"
              >
                {savingCat ? 'Menyimpan...' : 'Tambah'}
              </button>
            </div>
            {catError && (
              <p className="text-xs text-rose-600 dark:text-rose-400 leading-relaxed">{catError}</p>
            )}
          </form>

          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
              Daftar Kategori Tersimpan
            </p>
            {categories.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-zinc-500 py-3 text-center rounded-xl border border-dashed border-slate-200 dark:border-zinc-800">
                Belum ada kategori tersimpan
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {categories.map((cat) => (
                  <span
                    key={cat.id}
                    className="inline-flex items-center gap-1.5 h-7 pl-2.5 pr-1.5 rounded-full bg-slate-100 dark:bg-zinc-800/90 text-slate-700 dark:text-zinc-200 text-[11px]"
                  >
                    <span>{cat.name}</span>
                    <button
                      type="button"
                      onClick={() => handleDeleteCategory(cat)}
                      title={`Hapus kategori ${cat.name}`}
                      aria-label={`Hapus kategori ${cat.name}`}
                      className="w-4 h-4 rounded-full flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                    >
                      <Trash2 className="w-2.5 h-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* Modal Pengaturan Tema, Aksen & Mode Tampilan (Centered) */}
      <Modal
        open={themeModalOpen}
        onClose={() => setThemeModalOpen(false)}
        title="Pengaturan Tampilan"
      >
        <div className="space-y-5">
          <div>
            <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
              Mode Tema
            </p>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'system', label: 'Sistem', Icon: Monitor },
                  { id: 'light', label: 'Terang', Icon: Sun },
                  { id: 'dark', label: 'Gelap', Icon: Moon },
                ] as const
              ).map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setThemeMode(id)}
                  className={`flex flex-col items-center justify-center gap-1 py-2.5 px-2 rounded-xl border text-xs font-medium transition-colors ${
                    themeMode === id
                      ? 'accent-border accent-soft-bg accent-text'
                      : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
              Warna Aksen
            </p>
            <div className="grid grid-cols-2 gap-2">
              {ACCENT_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setAccent(opt.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-colors ${
                    accent === opt.id
                      ? 'accent-border accent-soft-bg text-slate-900 dark:text-slate-100'
                      : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <span
                    className="w-3.5 h-3.5 rounded-full shrink-0"
                    style={{ backgroundColor: opt.color }}
                  />
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
              Tata Letak Situs
            </p>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'auto', label: 'Otomatis', Icon: Monitor },
                  { id: 'mobile', label: 'Mobile', Icon: Smartphone },
                  { id: 'desktop', label: 'Desktop', Icon: Monitor },
                ] as const
              ).map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setViewMode(id)}
                  className={`flex flex-col items-center justify-center gap-1 py-2.5 px-2 rounded-xl border text-xs font-medium transition-colors ${
                    viewMode === id
                      ? 'accent-border accent-soft-bg accent-text'
                      : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      {/* Modal Pratinjau & Konfirmasi Buka Tautan */}
      <Modal
        open={Boolean(previewProject)}
        onClose={() => setPreviewProject(null)}
        title="Buka Tautan"
        subtitle={previewProject ? previewProject.category || 'Umum' : undefined}
        maxWidth="max-w-sm"
      >
        {previewProject && (
          <div className="space-y-3.5">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <h4 className="text-sm font-semibold text-slate-900 dark:text-zinc-100 break-words leading-snug">
                  {previewProject.title}
                </h4>
                {previewProject.favorite && (
                  <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400 shrink-0" />
                )}
              </div>
              {previewProject.description && (
                <p className="text-xs text-slate-600 dark:text-zinc-400 leading-relaxed break-words">
                  {previewProject.description}
                </p>
              )}
            </div>

            <div className="p-2.5 rounded-xl bg-slate-100/90 dark:bg-zinc-950/70 border border-slate-200/80 dark:border-zinc-800">
              <p className="text-[10px] text-slate-400 dark:text-zinc-500 mb-0.5">
                URL Tujuan
              </p>
              <p className="text-[11px] font-mono text-slate-800 dark:text-zinc-200 break-all leading-relaxed">
                {normalizeUrl(previewProject.url) || previewProject.url}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setPreviewProject(null)}
                className="h-8 px-3 rounded-xl border border-slate-200 dark:border-zinc-700 text-xs font-medium text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
              >
                Batal
              </button>

              <button
                type="button"
                onClick={() => void handleCopyLink(previewProject)}
                className="h-8 px-3 rounded-xl border border-slate-200 dark:border-zinc-700 text-xs font-medium text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 inline-flex items-center gap-1.5 transition-colors"
              >
                {copiedId === previewProject.id ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Tersalin</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Salin</span>
                  </>
                )}
              </button>

              {normalizeUrl(previewProject.url) && (
                <a
                  href={normalizeUrl(previewProject.url)!}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    const target = previewProject;
                    setPreviewProject(null);
                    void handleTrackClick(target);
                  }}
                  className="h-8 px-3.5 rounded-xl accent-bg text-white text-xs font-medium inline-flex items-center gap-1.5 transition-colors"
                >
                  <span>Buka</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Modal Konfirmasi Hapus (Proyek / Kategori) */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={executeConfirmedDelete}
        title={deleteTarget?.type === 'category' ? 'Hapus Kategori' : 'Hapus Proyek'}
        message={
          deleteTarget?.type === 'category'
            ? `Hapus kategori "${deleteTarget.item.name}"?`
            : `Hapus proyek "${deleteTarget?.item.title || ''}"?`
        }
        detail={
          deleteTarget?.type === 'project' ? deleteTarget.item.url : undefined
        }
        loading={deleting}
      />
    </div>
  );
}
