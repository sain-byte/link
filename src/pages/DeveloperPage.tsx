import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  writeBatch,
} from 'firebase/firestore';
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ArrowUpDown,
  BarChart3,
  Check,
  Copy,
  Database,
  ExternalLink,
  Eye,
  EyeOff,
  FolderKanban,
  GripVertical,
  KeyRound,
  LayoutDashboard,
  LogIn,
  LogOut,
  MessageSquare,
  MousePointerClick,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  ShieldCheck,
  Star,
  Trash2,
  Users,
} from 'lucide-react';
import firestoreRulesRaw from '../../firestore.rules?raw';
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
import {
  CategoryItem,
  CommentItem,
  CustomCollection,
  CustomCollectionItem,
  CustomField,
  CustomFieldType,
  DailyAnalytic,
  ProjectItem,
} from '../types/models';
import { formatTanggal, normalizeUrl } from '../utils/format';
import ConfirmDialog from '../components/ConfirmDialog';
import Modal from '../components/Modal';
import Toast from '../components/Toast';

type TabKey = 'overview' | 'projects' | 'comments' | 'analytics' | 'database';

const FIELD_TYPES: { id: CustomFieldType; label: string }[] = [
  { id: 'text', label: 'Teks' },
  { id: 'number', label: 'Angka' },
  { id: 'date', label: 'Tanggal' },
  { id: 'boolean', label: 'Status (Ya/Tidak)' },
];

const NAV_ITEMS: { id: TabKey; label: string; Icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: 'Ringkasan', Icon: LayoutDashboard },
  { id: 'projects', label: 'Proyek', Icon: FolderKanban },
  { id: 'comments', label: 'Chatbox', Icon: MessageSquare },
  { id: 'analytics', label: 'Analitik', Icon: BarChart3 },
  { id: 'database', label: 'Database', Icon: Database },
];

export default function DeveloperPage() {
  const {
    user,
    isOwner,
    isEmailMatch,
    hasPasswordProvider,
    hasGoogleProvider,
    loading: authLoading,
    ownerEmail,
    loginWithGoogle,
    loginWithEmail,
    linkOrUpdatePassword,
    resetPassword,
    resendVerification,
    reloadUser,
    logout,
  } = useAuth();

  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [toastMsg, setToastMsg] = useState('');
  const toastTimerRef = useRef<number | null>(null);
  const [dataError, setDataError] = useState('');
  const [diagnostics, setDiagnostics] = useState<FirebaseDiagnostics>(() =>
    getFirebaseDiagnostics()
  );

  // Login Form
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginNotice, setLoginNotice] = useState('');
  const [submittingLogin, setSubmittingLogin] = useState(false);

  // Keamanan Akun / Kata Sandi Tambahan
  const [securityModalOpen, setSecurityModalOpen] = useState(false);
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [passError, setPassError] = useState('');
  const [savingPass, setSavingPass] = useState(false);

  // Data States (Hanya dimuat setelah login pemilik terverifikasi)
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [visitStats, setVisitStats] = useState({ total: 0, today: 0 });
  const [analytics, setAnalytics] = useState<DailyAnalytic[]>([]);
  const [customCollections, setCustomCollections] = useState<CustomCollection[]>([]);

  // Projects Table Controls
  const [projSearch, setProjSearch] = useState('');
  const [projCategory, setProjCategory] = useState('Semua');
  const [projSort, setProjSort] = useState<{
    key: 'order' | 'title' | 'category' | 'clicks' | 'updatedAt';
    dir: 'asc' | 'desc';
  }>({ key: 'order', dir: 'asc' });
  const [projModalOpen, setProjModalOpen] = useState(false);
  const [editingProj, setEditingProj] = useState<ProjectItem | null>(null);
  const [projForm, setProjForm] = useState({
    title: '',
    description: '',
    url: '',
    category: '',
    favorite: false,
    hidden: false,
  });
  const [projError, setProjError] = useState('');
  const [savingProj, setSavingProj] = useState(false);
  const [draggedProjId, setDraggedProjId] = useState<string | null>(null);
  const [dragOverProjId, setDragOverProjId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<
    | { kind: 'project'; project: ProjectItem }
    | { kind: 'comment'; comment: CommentItem }
    | { kind: 'collection'; col: CustomCollection }
    | { kind: 'item'; item: CustomCollectionItem }
    | null
  >(null);
  const [deletingItem, setDeletingItem] = useState(false);

  // Comments Table Controls
  const [commSearch, setCommSearch] = useState('');
  const [commFilter, setCommFilter] = useState<'all' | 'pinned'>('all');

  // Custom Database States
  const [selectedColId, setSelectedColId] = useState<string | null>(null);
  const [colItems, setColItems] = useState<CustomCollectionItem[]>([]);
  const [colSearch, setColSearch] = useState('');
  const [colFilterField, setColFilterField] = useState('all');
  const [newColModalOpen, setNewColModalOpen] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [newColDesc, setNewColDesc] = useState('');
  const [newColFields, setNewColFields] = useState<CustomField[]>([
    { id: 'f1', name: '', type: 'text' },
  ]);
  const [colError, setColError] = useState('');
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<CustomCollectionItem | null>(null);
  const [itemDataForm, setItemDataForm] = useState<Record<string, string | number | boolean>>({});
  const [itemError, setItemError] = useState('');

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

  // Enforce noindex & default dark theme on /developer
  useEffect(() => {
    document.title = 'Panel Developer — sainbyte';
    document.documentElement.classList.add('dark');

    let metaRobots = document.querySelector('meta[name="robots"]') as HTMLMetaElement | null;
    const createdMeta = !metaRobots;
    if (!metaRobots) {
      metaRobots = document.createElement('meta');
      metaRobots.name = 'robots';
      document.head.appendChild(metaRobots);
    }
    const prevContent = metaRobots.content;
    metaRobots.content = 'noindex, nofollow, noarchive';

    return () => {
      if (createdMeta) {
        metaRobots?.remove();
      } else if (metaRobots) {
        metaRobots.content = prevContent || '';
      }
      const savedTheme = localStorage.getItem('sainbyte_theme') || 'system';
      const sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const shouldBeDark = savedTheme === 'system' ? sysDark : savedTheme === 'dark';
      document.documentElement.classList.toggle('dark', shouldBeDark);
    };
  }, []);

  // Subscribe data HANYA jika isOwner === true
  useEffect(() => {
    if (!isOwner) {
      setProjects([]);
      setCategories([]);
      setComments([]);
      setVisitStats({ total: 0, today: 0 });
      setAnalytics([]);
      setCustomCollections([]);
      setDataError('');
      return;
    }

    const unsubProj = onSnapshot(
      query(collection(db, 'projects'), orderBy('order', 'asc')),
      (snap) => {
        setProjects(
          snap.docs.map((d) => {
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
          })
        );
        if (!snap.metadata.fromCache) setDataError('');
      },
      (err) => {
        reportFirestoreError(err, OperationType.LIST, 'projects');
        setDataError(formatFirestoreError(err));
      }
    );

    const unsubCats = onSnapshot(
      query(collection(db, 'categories'), orderBy('name', 'asc')),
      (snap) => {
        setCategories(
          snap.docs
            .map((d) => {
              const data = d.data();
              return {
                id: d.id,
                name: String(data.name || '').trim(),
                createdAt: data.createdAt || null,
              };
            })
            .filter((c) => c.name.length > 0)
        );
      },
      (err) => {
        reportFirestoreError(err, OperationType.LIST, 'categories');
      }
    );

    const unsubComm = onSnapshot(
      query(collection(db, 'comments'), orderBy('createdAt', 'desc')),
      (snap) => {
        setComments(
          snap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              clientId: String(data.clientId || ''),
              name: String(data.name || 'Anonim'),
              message: String(data.message || ''),
              replyToId: String(data.replyToId || ''),
              replyToName: String(data.replyToName || ''),
              replyToMessage: String(data.replyToMessage || ''),
              likes: Number(data.likes) || 0,
              pinned: Boolean(data.pinned),
              createdAt: data.createdAt || null,
            };
          })
        );
      },
      (err) => {
        reportFirestoreError(err, OperationType.LIST, 'comments');
        setDataError(formatFirestoreError(err));
      }
    );

    const unsubVisit = onSnapshot(
      doc(db, 'visits', 'stats'),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setVisitStats({
            total: Number(data.total) || 0,
            today: Number(data.today) || 0,
          });
        }
      },
      (err) => {
        reportFirestoreError(err, OperationType.GET, 'visits/stats');
      }
    );

    const unsubAnalytics = onSnapshot(
      query(collection(db, 'analytics'), orderBy('date', 'desc')),
      (snap) => {
        setAnalytics(
          snap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              date: String(data.date || d.id),
              visits: Number(data.visits) || 0,
              clicks: Number(data.clicks) || 0,
            };
          })
        );
      },
      (err) => {
        reportFirestoreError(err, OperationType.LIST, 'analytics');
      }
    );

    const unsubCustomCols = onSnapshot(
      query(collection(db, 'customCollections'), orderBy('createdAt', 'asc')),
      (snap) => {
        const cols: CustomCollection[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            name: String(data.name || ''),
            description: String(data.description || ''),
            fields: Array.isArray(data.fields) ? data.fields : [],
            createdAt: data.createdAt || null,
          };
        });
        setCustomCollections(cols);
        if (cols.length > 0) {
          setSelectedColId((prev) => (cols.some((c) => c.id === prev) ? prev : cols[0].id));
        } else {
          setSelectedColId(null);
        }
      },
      (err) => {
        reportFirestoreError(err, OperationType.LIST, 'customCollections');
        setDataError(formatFirestoreError(err));
      }
    );

    return () => {
      unsubProj();
      unsubCats();
      unsubComm();
      unsubVisit();
      unsubAnalytics();
      unsubCustomCols();
    };
  }, [isOwner]);

  useEffect(() => {
    if (!isOwner || !selectedColId) {
      setColItems([]);
      return;
    }
    const unsub = onSnapshot(
      query(
        collection(db, 'customCollections', selectedColId, 'items'),
        orderBy('createdAt', 'desc')
      ),
      (snap) => {
        setColItems(
          snap.docs.map((d) => {
            const raw = d.data();
            return {
              id: d.id,
              data: (raw.data as Record<string, string | number | boolean>) || {},
              createdAt: raw.createdAt || null,
              updatedAt: raw.updatedAt || null,
            };
          })
        );
      },
      (err) => {
        reportFirestoreError(err, OperationType.LIST, `customCollections/${selectedColId}/items`);
        setDataError(formatFirestoreError(err));
      }
    );
    return () => unsub();
  }, [isOwner, selectedColId]);

  const handleLoginEmail = async (e: FormEvent) => {
    e.preventDefault();
    setSubmittingLogin(true);
    setLoginError('');
    setLoginNotice('');
    try {
      await loginWithEmail(email, password);
    } catch (err) {
      setLoginError(formatAuthError(err));
    } finally {
      setSubmittingLogin(false);
    }
  };

  const handleLoginGoogle = async () => {
    setSubmittingLogin(true);
    setLoginError('');
    setLoginNotice('');
    try {
      await loginWithGoogle();
    } catch (err) {
      setLoginError(formatAuthError(err));
    } finally {
      setSubmittingLogin(false);
    }
  };

  const handleResetPassword = async () => {
    if (!email.trim()) {
      setLoginError('Masukkan alamat email terlebih dahulu untuk reset kata sandi.');
      return;
    }
    setSubmittingLogin(true);
    setLoginError('');
    setLoginNotice('');
    try {
      await resetPassword(email);
      setLoginNotice('Tautan reset kata sandi telah dikirim ke email Anda.');
    } catch (err) {
      setLoginError(formatAuthError(err));
    } finally {
      setSubmittingLogin(false);
    }
  };

  const handleSaveAdditionalPassword = async (e: FormEvent) => {
    e.preventDefault();
    setPassError('');
    if (newPass.length < 6) {
      setPassError('Kata sandi minimal 6 karakter.');
      return;
    }
    if (newPass !== confirmPass) {
      setPassError('Konfirmasi kata sandi tidak cocok.');
      return;
    }
    setSavingPass(true);
    try {
      const action = await linkOrUpdatePassword(newPass);
      setNewPass('');
      setConfirmPass('');
      setSecurityModalOpen(false);
      showToast(
        action === 'linked'
          ? 'Kata sandi tambahan berhasil ditautkan'
          : 'Kata sandi berhasil diperbarui'
      );
    } catch (err) {
      setPassError(formatAuthError(err));
    } finally {
      setSavingPass(false);
    }
  };

  const totalClicks = useMemo(
    () => projects.reduce((sum, p) => sum + (p.clicks || 0), 0),
    [projects]
  );

  const projectCategories = useMemo(() => {
    const set = new Set<string>();
    categories.forEach((c) => {
      if (c.name) set.add(c.name);
    });
    projects.forEach((p) => {
      set.add((p.category || 'Umum').trim() || 'Umum');
    });
    return ['Semua', '__favorit__', ...Array.from(set).sort()];
  }, [projects, categories]);

  const selectableCategoryNames = useMemo(
    () => projectCategories.filter((c) => c !== 'Semua' && c !== '__favorit__'),
    [projectCategories]
  );

  const filteredProjects = useMemo(() => {
    const q = projSearch.trim().toLowerCase();
    const list = projects.filter((p) => {
      const cat = (p.category || 'Umum').trim() || 'Umum';
      const matchCat =
        projCategory === 'Semua'
          ? true
          : projCategory === '__favorit__'
          ? Boolean(p.favorite)
          : cat === projCategory;
      const matchQ =
        !q ||
        p.title.toLowerCase().includes(q) ||
        p.url.toLowerCase().includes(q) ||
        cat.toLowerCase().includes(q);
      return matchCat && matchQ;
    });

    return [...list].sort((a, b) => {
      const dir = projSort.dir === 'asc' ? 1 : -1;
      if (projSort.key === 'clicks') return (a.clicks - b.clicks) * dir;
      if (projSort.key === 'title') return a.title.localeCompare(b.title) * dir;
      if (projSort.key === 'category') return a.category.localeCompare(b.category) * dir;
      if (projSort.key === 'updatedAt') {
        const ta =
          a.updatedAt && typeof a.updatedAt === 'object' && 'toMillis' in a.updatedAt
            ? a.updatedAt.toMillis()
            : 0;
        const tb =
          b.updatedAt && typeof b.updatedAt === 'object' && 'toMillis' in b.updatedAt
            ? b.updatedAt.toMillis()
            : 0;
        return (ta - tb) * dir;
      }
      return (a.order - b.order) * dir;
    });
  }, [projects, projSearch, projCategory, projSort]);

  const toggleSort = (key: 'title' | 'category' | 'clicks' | 'updatedAt') => {
    setProjSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' }
    );
  };

  const isManualOrderActive = projSort.key === 'order' && projSort.dir === 'asc';

  const openAddProj = () => {
    setEditingProj(null);
    setProjError('');
    setProjForm({
      title: '',
      description: '',
      url: '',
      category: '',
      favorite: false,
      hidden: false,
    });
    setProjModalOpen(true);
  };

  const openEditProj = (p: ProjectItem) => {
    setEditingProj(p);
    setProjError('');
    setProjForm({
      title: p.title,
      description: p.description,
      url: p.url,
      category: p.category,
      favorite: Boolean(p.favorite),
      hidden: Boolean(p.hidden),
    });
    setProjModalOpen(true);
  };

  const handleSaveProject = async (e: FormEvent) => {
    e.preventDefault();
    setProjError('');
    if (!isOwner) {
      const msg = 'Sesi pemilik belum terverifikasi. Silakan login ulang.';
      setProjError(msg);
      showToast(msg);
      return;
    }
    const safeUrl = normalizeUrl(projForm.url);
    if (!projForm.title.trim() || !safeUrl) {
      const msg = 'Judul dan URL valid (http/https) wajib diisi.';
      setProjError(msg);
      showToast(msg);
      return;
    }
    setSavingProj(true);
    try {
      const cleanCategory = (projForm.category.trim() || 'Umum').slice(0, 60);
      const baseFields = {
        title: projForm.title.trim().slice(0, 120),
        description: projForm.description.trim().slice(0, 500),
        url: safeUrl.slice(0, 500),
        category: cleanCategory,
        favorite: Boolean(projForm.favorite),
        hidden: Boolean(projForm.hidden),
      };
      if (editingProj) {
        const res = await safeUpdateDoc(
          `projects/${editingProj.id}`,
          baseFields,
          { serverTimestampFields: ['updatedAt'] }
        );
        if (res.usedFallback) {
          setProjects((prev) =>
            prev.map((p) =>
              p.id === editingProj.id ? { ...p, ...baseFields, updatedAt: new Date() } : p
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
      setProjModalOpen(false);
    } catch (err) {
      const msg = formatFirestoreError(err);
      setProjError(msg);
      showToast(msg);
      console.error('Developer save project error:', err);
    } finally {
      setSavingProj(false);
    }
  };

  const handleToggleFavoriteProject = async (p: ProjectItem) => {
    try {
      const nextFav = !p.favorite;
      const res = await safeUpdateDoc(
        `projects/${p.id}`,
        { favorite: nextFav },
        { serverTimestampFields: ['updatedAt'] }
      );
      if (res.usedFallback) {
        setProjects((prev) =>
          prev.map((item) =>
            item.id === p.id ? { ...item, favorite: nextFav, updatedAt: new Date() } : item
          )
        );
      }
      showToast(nextFav ? 'Ditambahkan ke favorit' : 'Dihapus dari favorit');
    } catch (err) {
      showToast(formatFirestoreError(err));
      console.error(err);
    }
  };

  const handleToggleHiddenProject = async (p: ProjectItem) => {
    try {
      const nextHidden = !p.hidden;
      const res = await safeUpdateDoc(
        `projects/${p.id}`,
        { hidden: nextHidden },
        { serverTimestampFields: ['updatedAt'] }
      );
      if (res.usedFallback) {
        setProjects((prev) =>
          prev.map((item) =>
            item.id === p.id ? { ...item, hidden: nextHidden, updatedAt: new Date() } : item
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
  };

  const persistProjectOrder = async (newList: ProjectItem[]) => {
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

  const handleDropProjectRow = async (targetId: string) => {
    setDragOverProjId(null);
    if (!isManualOrderActive || !draggedProjId || draggedProjId === targetId) {
      setDraggedProjId(null);
      return;
    }
    const fromIdx = projects.findIndex((p) => p.id === draggedProjId);
    const toIdx = projects.findIndex((p) => p.id === targetId);
    if (fromIdx === -1 || toIdx === -1) {
      setDraggedProjId(null);
      return;
    }
    const updated = [...projects];
    const [moved] = updated.splice(fromIdx, 1);
    updated.splice(toIdx, 0, moved);
    setDraggedProjId(null);
    await persistProjectOrder(updated);
  };

  const handleMoveProjectStep = async (p: ProjectItem, direction: -1 | 1) => {
    if (!isManualOrderActive) return;
    const filteredIdx = filteredProjects.findIndex((item) => item.id === p.id);
    const neighborIdx = filteredIdx + direction;
    if (filteredIdx === -1 || neighborIdx < 0 || neighborIdx >= filteredProjects.length) return;

    const neighbor = filteredProjects[neighborIdx];
    const fromIdx = projects.findIndex((item) => item.id === p.id);
    const toIdx = projects.findIndex((item) => item.id === neighbor.id);
    if (fromIdx === -1 || toIdx === -1) return;

    const updated = [...projects];
    [updated[fromIdx], updated[toIdx]] = [updated[toIdx], updated[fromIdx]];
    await persistProjectOrder(updated);
  };

  const executeConfirmedDelete = async () => {
    if (!deleteConfirm) return;
    setDeletingItem(true);
    try {
      if (deleteConfirm.kind === 'project') {
        const id = deleteConfirm.project.id;
        const res = await safeDeleteDoc(`projects/${id}`);
        if (res.usedFallback) {
          setProjects((prev) => prev.filter((p) => p.id !== id));
        }
        showToast('Proyek dihapus');
      } else if (deleteConfirm.kind === 'comment') {
        const id = deleteConfirm.comment.id;
        const res = await safeDeleteDoc(`comments/${id}`);
        if (res.usedFallback) {
          setComments((prev) => prev.filter((c) => c.id !== id));
        }
        showToast('Komentar dihapus');
      } else if (deleteConfirm.kind === 'collection') {
        const col = deleteConfirm.col;
        const batch = writeBatch(db);
        colItems.forEach((item) => {
          batch.delete(doc(db, 'customCollections', col.id, 'items', item.id));
        });
        batch.delete(doc(db, 'customCollections', col.id));
        await withTimeout(batch.commit());
        showToast('Koleksi dihapus');
      } else if (deleteConfirm.kind === 'item') {
        if (!selectedCollection) return;
        const itemId = deleteConfirm.item.id;
        const res = await safeDeleteDoc(
          `customCollections/${selectedCollection.id}/items/${itemId}`
        );
        if (res.usedFallback) {
          setColItems((prev) => prev.filter((it) => it.id !== itemId));
        }
        showToast('Data dihapus');
      }
      setDeleteConfirm(null);
    } catch (err) {
      if (deleteConfirm.kind === 'collection') {
        reportFirestoreError(
          err,
          OperationType.DELETE,
          `customCollections/${deleteConfirm.col.id}`
        );
      }
      showToast(formatFirestoreError(err));
      console.error(err);
    } finally {
      setDeletingItem(false);
    }
  };

  const filteredComments = useMemo(() => {
    const q = commSearch.trim().toLowerCase();
    return comments.filter((c) => {
      if (commFilter === 'pinned' && !c.pinned) return false;
      if (!q) return true;
      return c.name.toLowerCase().includes(q) || c.message.toLowerCase().includes(q);
    });
  }, [comments, commSearch, commFilter]);

  const handleTogglePinComment = async (comment: CommentItem) => {
    try {
      const pinnedOthers = comments.filter((c) => c.pinned && c.id !== comment.id);
      if (pinnedOthers.length > 0) {
        const batch = writeBatch(db);
        pinnedOthers.forEach((c) => batch.update(doc(db, 'comments', c.id), { pinned: false }));
        batch.update(doc(db, 'comments', comment.id), { pinned: !comment.pinned });
        await withTimeout(batch.commit());
      } else {
        const res = await safeUpdateDoc(`comments/${comment.id}`, { pinned: !comment.pinned });
        if (res.usedFallback) {
          setComments((prev) =>
            prev.map((c) => (c.id === comment.id ? { ...c, pinned: !comment.pinned } : c))
          );
        }
      }
      showToast(comment.pinned ? 'Sematan dilepas' : 'Komentar disematkan');
    } catch (err) {
      showToast(formatFirestoreError(err));
      console.error(err);
    }
  };

  const chartData = useMemo(() => [...analytics].slice(0, 14).reverse(), [analytics]);
  const maxChartVal = useMemo(() => {
    const vals = chartData.flatMap((d) => [d.visits || 0, d.clicks || 0]);
    return Math.max(...vals, 1);
  }, [chartData]);

  const selectedCollection = useMemo(
    () => customCollections.find((c) => c.id === selectedColId) || null,
    [customCollections, selectedColId]
  );

  const filteredColItems = useMemo(() => {
    const q = colSearch.trim().toLowerCase();
    return colItems.filter((item) => {
      const data = item.data || {};
      if (colFilterField !== 'all') {
        const val = data[colFilterField];
        if (val === undefined || val === '' || val === false) return false;
      }
      if (!q) return true;
      return Object.values(data).some((v) => String(v ?? '').toLowerCase().includes(q));
    });
  }, [colItems, colSearch, colFilterField]);

  const handleCreateCustomCollection = async (e: FormEvent) => {
    e.preventDefault();
    setColError('');
    const cleanName = newColName.trim().slice(0, 60);
    const validFields = newColFields
      .map((f) => ({ ...f, name: f.name.trim() }))
      .filter((f) => f.name.length > 0);
    if (!cleanName || validFields.length === 0) {
      const msg = 'Isi nama koleksi dan minimal 1 kolom.';
      setColError(msg);
      showToast(msg);
      return;
    }
    try {
      const res = await safeAddDoc(
        'customCollections',
        {
          name: cleanName,
          description: newColDesc.trim().slice(0, 300),
          fields: validFields,
        },
        { serverTimestampFields: ['createdAt'] }
      );
      if (res.usedFallback) {
        setCustomCollections((prev) => [
          ...prev,
          {
            id: res.id,
            name: cleanName,
            description: newColDesc.trim().slice(0, 300),
            fields: validFields,
            createdAt: new Date(),
          },
        ]);
      }
      setSelectedColId(res.id);
      setNewColModalOpen(false);
      setNewColName('');
      setNewColDesc('');
      setNewColFields([{ id: 'f1', name: '', type: 'text' }]);
      showToast('Koleksi dibuat');
    } catch (err) {
      const msg = formatFirestoreError(err);
      setColError(msg);
      showToast(msg);
    }
  };

  const openAddItemModal = () => {
    if (!selectedCollection) return;
    const initData: Record<string, string | number | boolean> = {};
    selectedCollection.fields.forEach((f) => {
      initData[f.name] = f.type === 'boolean' ? false : '';
    });
    setEditingItem(null);
    setItemError('');
    setItemDataForm(initData);
    setItemModalOpen(true);
  };

  const openEditItemModal = (item: CustomCollectionItem) => {
    if (!selectedCollection) return;
    const initData: Record<string, string | number | boolean> = {};
    selectedCollection.fields.forEach((f) => {
      initData[f.name] = item.data?.[f.name] ?? (f.type === 'boolean' ? false : '');
    });
    setEditingItem(item);
    setItemError('');
    setItemDataForm(initData);
    setItemModalOpen(true);
  };

  const handleSaveItem = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedCollection) return;
    setItemError('');
    try {
      if (editingItem) {
        const res = await safeUpdateDoc(
          `customCollections/${selectedCollection.id}/items/${editingItem.id}`,
          { data: itemDataForm },
          { serverTimestampFields: ['updatedAt'] }
        );
        if (res.usedFallback) {
          setColItems((prev) =>
            prev.map((it) =>
              it.id === editingItem.id ? { ...it, data: itemDataForm, updatedAt: new Date() } : it
            )
          );
        }
        showToast('Data diperbarui');
      } else {
        const res = await safeAddDoc(
          `customCollections/${selectedCollection.id}/items`,
          { data: itemDataForm },
          { serverTimestampFields: ['createdAt', 'updatedAt'] }
        );
        if (res.usedFallback) {
          setColItems((prev) => [
            {
              id: res.id,
              data: itemDataForm,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            ...prev,
          ]);
        }
        showToast('Data ditambahkan');
      }
      setItemModalOpen(false);
    } catch (err) {
      const msg = formatFirestoreError(err);
      setItemError(msg);
      showToast(msg);
    }
  };

  // Loading Screen
  if (authLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-200 flex items-center justify-center">
        <p className="text-sm font-mono text-zinc-400">Memeriksa sesi...</p>
      </div>
    );
  }

  // Gate: Jika belum login atau bukan pemilik terverifikasi, tampilkan HANYA halaman login
  if (!user || !isOwner) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-xl border border-zinc-800 bg-zinc-900 p-6 space-y-5">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-zinc-50">
              Konsol Developer
            </h1>
            <p className="text-xs text-zinc-400 mt-1">
              Masuk untuk mengakses data pribadi dan analitik.
            </p>
          </div>

          {user && !isEmailMatch && (
            <div className="p-3 rounded-lg border border-amber-800/60 bg-amber-950/40 text-xs text-amber-200 space-y-2">
              <p>
                Akun <strong>{user.email}</strong> tidak memiliki izin pemilik ({ownerEmail}).
              </p>
              <button
                type="button"
                onClick={() => void logout()}
                className="underline text-amber-300 hover:text-amber-100"
              >
                Keluar dan ganti akun
              </button>
            </div>
          )}

          {user && isEmailMatch && !user.emailVerified && (
            <div className="p-3 rounded-lg border border-amber-800/60 bg-amber-950/40 text-xs text-amber-200 space-y-2">
              <p>
                Email Anda belum terverifikasi. Verifikasi email lalu muat ulang status, atau masuk dengan Google.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() =>
                    void resendVerification()
                      .then(() => setLoginNotice('Tautan verifikasi dikirim ke email Anda.'))
                      .catch((err) => setLoginError(formatAuthError(err)))
                  }
                  className="underline text-amber-300 hover:text-amber-100"
                >
                  Kirim ulang verifikasi
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void reloadUser().then((ok) => {
                      if (!ok) {
                        setLoginError('Status email masih belum terverifikasi.');
                      }
                    })
                  }
                  className="underline text-emerald-300 hover:text-emerald-100"
                >
                  Muat ulang status
                </button>
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="underline text-zinc-300 hover:text-white"
                >
                  Keluar
                </button>
              </div>
            </div>
          )}

          <button
            type="button"
            disabled={submittingLogin}
            onClick={() => void handleLoginGoogle()}
            className="w-full h-10 px-4 rounded-lg bg-zinc-100 text-zinc-950 hover:bg-white text-xs sm:text-sm font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Masuk dengan Google</span>
          </button>

          <div className="relative flex items-center justify-center">
            <span className="h-px w-full bg-zinc-800" />
            <span className="px-3 text-[11px] text-zinc-500 bg-zinc-900 shrink-0">atau</span>
            <span className="h-px w-full bg-zinc-800" />
          </div>

          <form onSubmit={(e) => void handleLoginEmail(e)} className="space-y-3">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@domain.com"
                className="w-full h-10 px-3 text-sm rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs text-zinc-400">Kata Sandi</label>
                <button
                  type="button"
                  disabled={submittingLogin}
                  onClick={() => void handleResetPassword()}
                  className="text-[11px] text-zinc-400 hover:text-zinc-200 underline"
                >
                  Lupa kata sandi?
                </button>
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full h-10 px-3 text-sm rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
              />
            </div>

            {loginNotice && <p className="text-xs text-emerald-400">{loginNotice}</p>}
            {loginError && <p className="text-xs text-rose-400 leading-relaxed">{loginError}</p>}

            <button
              type="submit"
              disabled={submittingLogin}
              className="w-full h-10 rounded-lg border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs sm:text-sm font-medium transition-colors disabled:opacity-50"
            >
              {submittingLogin ? 'Memproses...' : 'Masuk dengan Email'}
            </button>
          </form>

          <p className="text-[11px] text-zinc-500 leading-relaxed">
            Tips: Masuk dengan Google lalu tambahkan kata sandi alternatif di menu Keamanan Akun agar dapat login menggunakan email &amp; kata sandi.
          </p>

          <div className="pt-2 border-t border-zinc-800 flex justify-center">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Kembali ke Beranda</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col lg:flex-row pb-16 lg:pb-0">
      <Toast message={toastMsg} />

      {/* Sidebar Desktop */}
      <aside className="hidden lg:flex lg:flex-col w-60 shrink-0 border-r border-zinc-800 bg-zinc-900/70">
        <div className="px-4 py-4 border-b border-zinc-800 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold tracking-tight text-zinc-100">sainbyte</p>
            <p className="text-[11px] text-zinc-400 font-mono truncate max-w-[160px]">
              {user.email}
            </p>
          </div>
        </div>

        <nav className="flex-1 p-2.5 space-y-1">
          {NAV_ITEMS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`w-full min-h-[40px] flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                activeTab === id
                  ? 'bg-zinc-800 text-zinc-50 border border-zinc-700'
                  : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="p-2.5 border-t border-zinc-800 space-y-1">
          <button
            type="button"
            onClick={() => {
              setPassError('');
              setSecurityModalOpen(true);
            }}
            className="w-full h-9 flex items-center justify-between px-3 rounded-lg text-xs text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800/50 transition-colors"
          >
            <span className="inline-flex items-center gap-2">
              <KeyRound className="w-3.5 h-3.5" />
              <span>Keamanan Akun</span>
            </span>
            {!hasPasswordProvider && (
              <span className="text-[10px] text-amber-400 font-mono">Belum ada sandi</span>
            )}
          </button>
          <Link
            to="/"
            className="w-full h-9 flex items-center gap-2 px-3 rounded-lg text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Halaman Publik</span>
          </Link>
          <button
            type="button"
            onClick={() => void logout()}
            className="w-full h-9 flex items-center gap-2 px-3 rounded-lg text-xs text-rose-400 hover:bg-rose-950/40 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Keluar</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Context Bar */}
        <header className="h-12 px-4 lg:px-6 border-b border-zinc-800 bg-zinc-900/50 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-2 text-xs text-zinc-400 truncate">
            <span className="font-medium text-zinc-200">sainbyte</span>
            <span>/</span>
            <span className="text-zinc-300">
              {NAV_ITEMS.find((n) => n.id === activeTab)?.label}
            </span>
          </div>

          <div className="flex items-center gap-1.5 lg:hidden shrink-0">
            <button
              type="button"
              onClick={() => {
                setPassError('');
                setSecurityModalOpen(true);
              }}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-zinc-800 text-zinc-300 hover:bg-zinc-800"
              title="Keamanan Akun & Kata Sandi"
              aria-label="Keamanan Akun"
            >
              <KeyRound className="w-3.5 h-3.5" />
            </button>
            <Link
              to="/"
              className="h-8 px-2.5 inline-flex items-center rounded-lg border border-zinc-800 text-[11px] text-zinc-300"
            >
              Publik
            </Link>
            <button
              type="button"
              onClick={() => void logout()}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-zinc-800 text-rose-400"
              aria-label="Keluar"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6 space-y-5 overflow-x-hidden">
          {(diagnostics.connectionStatus === 'error' || dataError) && (
            <div className="rounded-xl border border-rose-800/70 bg-rose-950/40 px-4 py-3 text-xs text-rose-200 space-y-2.5 leading-relaxed">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div className="min-w-0 space-y-1">
                  <p className="font-semibold text-rose-100">
                    Masalah Koneksi Firestore ({diagnostics.projectId})
                  </p>
                  <p className="break-words text-rose-300">
                    {dataError || diagnostics.connectionError}
                  </p>
                </div>
              </div>
              {diagnostics.isCustomProject && (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-rose-800/50 pt-2">
                  <span className="font-mono text-[11px] text-rose-200/80">
                    Salin isi firestore.rules lalu Publish di Firebase Console proyek {diagnostics.projectId}.
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard
                        .writeText(firestoreRulesRaw)
                        .then(() => showToast('firestore.rules disalin ke clipboard'))
                        .catch(() => showToast('Gagal menyalin firestore.rules'));
                    }}
                    className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-rose-700/60 bg-rose-900/50 px-2.5 font-mono text-[11px] text-rose-100 hover:bg-rose-900"
                  >
                    <Copy className="w-3 h-3" />
                    <span>Salin firestore.rules</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 1: RINGKASAN */}
          {activeTab === 'overview' && (
            <div className="space-y-5">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 text-xs">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-zinc-200 font-medium truncate">
                      Metode Login: {hasGoogleProvider ? 'Google' : ''}{hasGoogleProvider && hasPasswordProvider ? ' & ' : ''}{hasPasswordProvider ? 'Email/Kata Sandi' : !hasGoogleProvider ? 'Aktif' : ''}
                    </p>
                    <p className="text-[11px] text-zinc-400">
                      {hasPasswordProvider
                        ? 'Kata sandi tambahan aktif sebagai alternatif login.'
                        : 'Tambahkan kata sandi alternatif agar dapat login juga dengan email & kata sandi.'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPassError('');
                    setSecurityModalOpen(true);
                  }}
                  className="h-8 px-3 rounded-lg border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-100 whitespace-nowrap shrink-0 self-start sm:self-auto"
                >
                  {hasPasswordProvider ? 'Ubah Kata Sandi' : 'Tambah Kata Sandi'}
                </button>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { label: 'Total Proyek', value: projects.length, Icon: FolderKanban },
                  { label: 'Total Kunjungan', value: visitStats.total, Icon: Users },
                  { label: 'Total Klik', value: totalClicks, Icon: MousePointerClick },
                  { label: 'Total Komentar', value: comments.length, Icon: MessageSquare },
                ].map(({ label, value, Icon }) => (
                  <div
                    key={label}
                    className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-4 space-y-2"
                  >
                    <div className="flex items-center justify-between text-zinc-400">
                      <span className="text-xs">{label}</span>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <p className="text-2xl font-semibold font-mono tabular-nums text-zinc-50">
                      {value.toLocaleString('id-ID')}
                    </p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-xs font-semibold text-zinc-200">Proyek Terbaru</h2>
                    <button
                      type="button"
                      onClick={() => setActiveTab('projects')}
                      className="text-xs text-zinc-400 hover:text-zinc-200"
                    >
                      Lihat semua
                    </button>
                  </div>
                  {projects.length === 0 ? (
                    <div className="py-6 text-center space-y-2">
                      <p className="text-xs text-zinc-500">Belum ada data</p>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab('projects');
                          openAddProj();
                        }}
                        className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200"
                      >
                        Tambah Proyek
                      </button>
                    </div>
                  ) : (
                    <div className="divide-y divide-zinc-800/80">
                      {projects.slice(0, 5).map((p) => (
                        <div
                          key={p.id}
                          className="py-2.5 flex items-center justify-between gap-3 text-xs"
                        >
                          <div className="min-w-0">
                            <p className="font-medium text-zinc-200 truncate">{p.title}</p>
                            <p className="text-[11px] text-zinc-500 truncate">{p.category}</p>
                          </div>
                          <span className="font-mono tabular-nums text-zinc-400 shrink-0">
                            {p.clicks} klik
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-xs font-semibold text-zinc-200">Komentar Terbaru</h2>
                    <button
                      type="button"
                      onClick={() => setActiveTab('comments')}
                      className="text-xs text-zinc-400 hover:text-zinc-200"
                    >
                      Moderasi
                    </button>
                  </div>
                  {comments.length === 0 ? (
                    <p className="py-8 text-center text-xs text-zinc-500">Belum ada data</p>
                  ) : (
                    <div className="divide-y divide-zinc-800/80">
                      {comments.slice(0, 5).map((c) => (
                        <div key={c.id} className="py-2.5 space-y-0.5 text-xs">
                          <div className="flex items-center justify-between text-zinc-400">
                            <span className="font-medium text-zinc-200">{c.name}</span>
                            <span className="text-[11px] font-mono tabular-nums">
                              {formatTanggal(c.createdAt)}
                            </span>
                          </div>
                          <p className="text-zinc-400 truncate">{c.message}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PROYEK CRUD TABLE */}
          {activeTab === 'projects' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="flex flex-1 gap-2">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={projSearch}
                      onChange={(e) => setProjSearch(e.target.value)}
                      placeholder="Cari proyek..."
                      className="w-full min-h-[38px] pl-9 pr-3 py-1.5 text-xs rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600"
                    />
                  </div>
                  <select
                    value={projCategory}
                    onChange={(e) => setProjCategory(e.target.value)}
                    className="min-h-[38px] px-3 py-1.5 text-xs rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-200 focus:outline-none focus:border-zinc-600"
                  >
                    {projectCategories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat === '__favorit__' ? '★ Favorit' : cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {!isManualOrderActive && (
                    <button
                      type="button"
                      onClick={() => setProjSort({ key: 'order', dir: 'asc' })}
                      className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 text-xs whitespace-nowrap"
                    >
                      Urutan Asli
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={openAddProj}
                    className="min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-zinc-100 text-zinc-950 hover:bg-white text-xs font-medium whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Tambah Proyek</span>
                  </button>
                </div>
              </div>

              {filteredProjects.length === 0 ? (
                <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/40 py-12 text-center space-y-3">
                  <p className="text-xs text-zinc-400">Belum ada data</p>
                  <button
                    type="button"
                    onClick={openAddProj}
                    className="min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-zinc-100 text-zinc-950 text-xs font-medium"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Tambah Proyek Baru</span>
                  </button>
                </div>
              ) : (
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-zinc-800 text-zinc-400 bg-zinc-900">
                        <th className="py-2.5 px-3 font-medium whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setProjSort({ key: 'order', dir: 'asc' })}
                            className={`inline-flex items-center gap-1 hover:text-zinc-200 ${
                              isManualOrderActive ? 'text-zinc-200' : ''
                            }`}
                            title="Aktifkan urutan manual untuk geser & panah naik/turun"
                          >
                            Urutan
                          </button>
                        </th>
                        <th className="py-2.5 px-3 font-medium">
                          <button
                            type="button"
                            onClick={() => toggleSort('title')}
                            className="inline-flex items-center gap-1 hover:text-zinc-200"
                          >
                            Judul <ArrowUpDown className="w-3 h-3" />
                          </button>
                        </th>
                        <th className="py-2.5 px-3 font-medium">
                          <button
                            type="button"
                            onClick={() => toggleSort('category')}
                            className="inline-flex items-center gap-1 hover:text-zinc-200"
                          >
                            Kategori <ArrowUpDown className="w-3 h-3" />
                          </button>
                        </th>
                        <th className="py-2.5 px-3 font-medium">URL</th>
                        <th className="py-2.5 px-3 font-medium text-right">
                          <button
                            type="button"
                            onClick={() => toggleSort('clicks')}
                            className="inline-flex items-center gap-1 hover:text-zinc-200"
                          >
                            Klik <ArrowUpDown className="w-3 h-3" />
                          </button>
                        </th>
                        <th className="py-2.5 px-3 font-medium">
                          <button
                            type="button"
                            onClick={() => toggleSort('updatedAt')}
                            className="inline-flex items-center gap-1 hover:text-zinc-200"
                          >
                            Diperbarui <ArrowUpDown className="w-3 h-3" />
                          </button>
                        </th>
                        <th className="py-2.5 px-3 font-medium text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/80">
                      {filteredProjects.map((p, idx) => (
                        <tr
                          key={p.id}
                          draggable={isManualOrderActive}
                          onDragStart={() => setDraggedProjId(p.id)}
                          onDragOver={(e) => {
                            if (!isManualOrderActive) return;
                            e.preventDefault();
                            if (dragOverProjId !== p.id) setDragOverProjId(p.id);
                          }}
                          onDragLeave={() => {
                            if (dragOverProjId === p.id) setDragOverProjId(null);
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            void handleDropProjectRow(p.id);
                          }}
                          onDragEnd={() => {
                            setDraggedProjId(null);
                            setDragOverProjId(null);
                          }}
                          className={`hover:bg-zinc-800/40 transition-colors ${
                            p.hidden ? 'opacity-70' : ''
                          } ${
                            dragOverProjId === p.id && draggedProjId !== p.id
                              ? 'bg-zinc-800/70 outline outline-1 outline-zinc-500'
                              : ''
                          }`}
                        >
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            {isManualOrderActive ? (
                              <div className="inline-flex items-center gap-0.5 text-zinc-400">
                                <span
                                  className="p-1 cursor-grab active:cursor-grabbing text-zinc-500 hover:text-zinc-300"
                                  title="Seret untuk mengurutkan"
                                >
                                  <GripVertical className="w-3.5 h-3.5" />
                                </span>
                                <button
                                  type="button"
                                  disabled={idx === 0}
                                  onClick={() => void handleMoveProjectStep(p, -1)}
                                  className="p-1 rounded hover:bg-zinc-700 text-zinc-300 disabled:opacity-25 disabled:pointer-events-none"
                                  title="Geser naik"
                                  aria-label="Geser naik"
                                >
                                  <ArrowUp className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  disabled={idx === filteredProjects.length - 1}
                                  onClick={() => void handleMoveProjectStep(p, 1)}
                                  className="p-1 rounded hover:bg-zinc-700 text-zinc-300 disabled:opacity-25 disabled:pointer-events-none"
                                  title="Geser turun"
                                  aria-label="Geser turun"
                                >
                                  <ArrowDown className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <span className="font-mono tabular-nums text-zinc-500">
                                #{idx + 1}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-medium text-zinc-100 max-w-[220px]">
                            <div className="flex items-center gap-1.5 min-w-0">
                              {p.favorite && (
                                <Star className="w-3 h-3 text-amber-400 fill-amber-400 shrink-0" />
                              )}
                              <span className="truncate">{p.title}</span>
                              {p.hidden && (
                                <span
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-zinc-700 bg-zinc-800/80 text-[10px] font-normal text-zinc-400 shrink-0"
                                  title="Disembunyikan dari pengunjung publik"
                                >
                                  <EyeOff className="w-2.5 h-2.5" />
                                  Tersembunyi
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-zinc-300 whitespace-nowrap">
                            {p.category}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-zinc-400 max-w-[200px] truncate">
                            {p.url}
                          </td>
                          <td className="py-2.5 px-3 font-mono tabular-nums text-right text-zinc-200">
                            {p.clicks}
                          </td>
                          <td className="py-2.5 px-3 font-mono tabular-nums text-zinc-400 whitespace-nowrap">
                            {formatTanggal(p.updatedAt || p.createdAt)}
                          </td>
                          <td className="py-2.5 px-3 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => void handleToggleHiddenProject(p)}
                                className={`p-1.5 rounded hover:bg-zinc-700 ${
                                  p.hidden ? 'text-amber-300' : 'text-zinc-400'
                                }`}
                                title={
                                  p.hidden
                                    ? 'Tampilkan ke Publik'
                                    : 'Sembunyikan dari Publik'
                                }
                                aria-label={
                                  p.hidden
                                    ? 'Tampilkan ke Publik'
                                    : 'Sembunyikan dari Publik'
                                }
                              >
                                {p.hidden ? (
                                  <EyeOff className="w-3.5 h-3.5" />
                                ) : (
                                  <Eye className="w-3.5 h-3.5" />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleToggleFavoriteProject(p)}
                                className={`p-1.5 rounded hover:bg-zinc-700 ${
                                  p.favorite ? 'text-amber-400' : 'text-zinc-400'
                                }`}
                                title={p.favorite ? 'Hapus dari Favorit' : 'Tandai Favorit'}
                              >
                                <Star className={`w-3.5 h-3.5 ${p.favorite ? 'fill-amber-400' : ''}`} />
                              </button>
                              <a
                                href={normalizeUrl(p.url) || '#'}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1.5 rounded hover:bg-zinc-700 text-zinc-300"
                                title="Buka"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                              <button
                                type="button"
                                onClick={() => openEditProj(p)}
                                className="p-1.5 rounded hover:bg-zinc-700 text-zinc-300"
                                title="Edit"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteConfirm({ kind: 'project', project: p })}
                                className="p-1.5 rounded hover:bg-rose-950/60 text-rose-400"
                                title="Hapus"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: MODERASI KOMENTAR */}
          {activeTab === 'comments' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="relative flex-1 max-w-sm">
                  <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={commSearch}
                    onChange={(e) => setCommSearch(e.target.value)}
                    placeholder="Cari nama atau pesan..."
                    className="w-full min-h-[38px] pl-9 pr-3 py-1.5 text-xs rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600"
                  />
                </div>

                <div className="flex items-center gap-1 p-1 rounded-lg bg-zinc-900 border border-zinc-800 self-start">
                  {(
                    [
                      { id: 'all', label: 'Semua' },
                      { id: 'pinned', label: 'Disematkan' },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setCommFilter(f.id)}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                        commFilter === f.id
                          ? 'bg-zinc-800 text-zinc-100'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {filteredComments.length === 0 ? (
                <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/40 py-12 text-center">
                  <p className="text-xs text-zinc-400">Belum ada data</p>
                </div>
              ) : (
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-zinc-800 text-zinc-400 bg-zinc-900">
                        <th className="py-2.5 px-3 font-medium">Pengirim</th>
                        <th className="py-2.5 px-3 font-medium">Pesan</th>
                        <th className="py-2.5 px-3 font-medium text-right">Suka</th>
                        <th className="py-2.5 px-3 font-medium">Status</th>
                        <th className="py-2.5 px-3 font-medium">Waktu</th>
                        <th className="py-2.5 px-3 font-medium text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/80">
                      {filteredComments.map((c) => (
                        <tr key={c.id} className="hover:bg-zinc-800/40 transition-colors">
                          <td className="py-2.5 px-3 font-medium text-zinc-100 whitespace-nowrap">
                            {c.name}
                          </td>
                          <td className="py-2.5 px-3 text-zinc-300 max-w-xs">
                            <p className="line-clamp-2 break-words">{c.message}</p>
                            {c.replyToName && (
                              <p className="text-[11px] text-zinc-500 mt-0.5">
                                Membalas {c.replyToName}
                              </p>
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-mono tabular-nums text-right text-zinc-300">
                            {c.likes}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span
                              className={
                                c.pinned ? 'text-amber-400 font-medium' : 'text-zinc-500'
                              }
                            >
                              {c.pinned ? 'Disematkan' : 'Normal'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-mono tabular-nums text-zinc-400 whitespace-nowrap">
                            {formatTanggal(c.createdAt)}
                          </td>
                          <td className="py-2.5 px-3 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => void handleTogglePinComment(c)}
                                className="p-1.5 rounded hover:bg-zinc-700 text-zinc-300"
                                title={c.pinned ? 'Lepas sematan' : 'Sematkan'}
                              >
                                {c.pinned ? (
                                  <PinOff className="w-3.5 h-3.5" />
                                ) : (
                                  <Pin className="w-3.5 h-3.5" />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteConfirm({ kind: 'comment', comment: c })}
                                className="p-1.5 rounded hover:bg-rose-950/60 text-rose-400"
                                title="Hapus"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: ANALITIK HARIAN */}
          {activeTab === 'analytics' && (
            <div className="space-y-6">
              {analytics.length === 0 ? (
                <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/40 py-12 text-center">
                  <p className="text-xs text-zinc-400">Belum ada data</p>
                </div>
              ) : (
                <>
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className="text-xs font-semibold text-zinc-200">
                        Grafik Harian (14 Hari Terakhir)
                      </h2>
                      <div className="flex items-center gap-4 text-[11px] text-zinc-400">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-sm bg-blue-500" />
                          Kunjungan
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
                          Klik Proyek
                        </span>
                      </div>
                    </div>

                    <div className="h-44 flex items-end gap-2 pt-4 overflow-x-auto">
                      {chartData.map((d) => {
                        const visitH = Math.max(
                          4,
                          Math.round(((d.visits || 0) / maxChartVal) * 100)
                        );
                        const clickH = Math.max(
                          4,
                          Math.round(((d.clicks || 0) / maxChartVal) * 100)
                        );
                        return (
                          <div
                            key={d.id}
                            className="flex-1 min-w-[36px] flex flex-col items-center gap-1.5 h-full justify-end"
                          >
                            <div className="w-full flex items-end justify-center gap-1 h-32">
                              <div
                                title={`Kunjungan: ${d.visits}`}
                                style={{ height: `${visitH}%` }}
                                className="w-2.5 rounded-t bg-blue-500/90 transition-all"
                              />
                              <div
                                title={`Klik: ${d.clicks}`}
                                style={{ height: `${clickH}%` }}
                                className="w-2.5 rounded-t bg-emerald-500/90 transition-all"
                              />
                            </div>
                            <span className="text-[10px] font-mono text-zinc-500 whitespace-nowrap">
                              {d.date.slice(5)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-zinc-800 text-zinc-400 bg-zinc-900">
                          <th className="py-2.5 px-3 font-medium">Tanggal</th>
                          <th className="py-2.5 px-3 font-medium text-right">Kunjungan</th>
                          <th className="py-2.5 px-3 font-medium text-right">Klik Proyek</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/80">
                        {analytics.map((row) => (
                          <tr key={row.id} className="hover:bg-zinc-800/40">
                            <td className="py-2.5 px-3 font-mono tabular-nums text-zinc-200">
                              {row.date}
                            </td>
                            <td className="py-2.5 px-3 font-mono tabular-nums text-right text-zinc-300">
                              {row.visits}
                            </td>
                            <td className="py-2.5 px-3 font-mono tabular-nums text-right text-zinc-300">
                              {row.clicks}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

          {/* TAB 5: DATABASE KOLEKSI KUSTOM */}
          {activeTab === 'database' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  {customCollections.map((col) => (
                    <button
                      key={col.id}
                      type="button"
                      onClick={() => {
                        setSelectedColId(col.id);
                        setColSearch('');
                        setColFilterField('all');
                      }}
                      className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                        selectedColId === col.id
                          ? 'bg-zinc-100 text-zinc-950'
                          : 'bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800'
                      }`}
                    >
                      {col.name}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setNewColModalOpen(true)}
                  className="min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-zinc-100 text-zinc-950 hover:bg-white text-xs font-medium whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Koleksi Baru</span>
                </button>
              </div>

              {customCollections.length === 0 || !selectedCollection ? (
                <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/40 py-14 text-center space-y-3">
                  <p className="text-xs text-zinc-400">Belum ada data</p>
                  <button
                    type="button"
                    onClick={() => setNewColModalOpen(true)}
                    className="min-h-[40px] inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-zinc-100 text-zinc-950 text-xs font-medium"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Buat Koleksi Pertama</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-semibold text-zinc-100">
                        {selectedCollection.name}
                      </h2>
                      {selectedCollection.description && (
                        <p className="text-xs text-zinc-400 mt-0.5">
                          {selectedCollection.description}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={openAddItemModal}
                        className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-100 text-zinc-950 text-xs font-medium"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Tambah Baris</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setDeleteConfirm({ kind: 'collection', col: selectedCollection })
                        }
                        className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-900/60 text-rose-400 hover:bg-rose-950/40 text-xs"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Hapus Koleksi</span>
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="relative flex-1 max-w-sm">
                      <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={colSearch}
                        onChange={(e) => setColSearch(e.target.value)}
                        placeholder="Cari di koleksi ini..."
                        className="w-full min-h-[38px] pl-9 pr-3 py-1.5 text-xs rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600"
                      />
                    </div>
                    <select
                      value={colFilterField}
                      onChange={(e) => setColFilterField(e.target.value)}
                      className="min-h-[38px] px-3 py-1.5 text-xs rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-200 focus:outline-none focus:border-zinc-600"
                    >
                      <option value="all">Semua Kolom Terisi</option>
                      {selectedCollection.fields.map((f) => (
                        <option key={f.id} value={f.name}>
                          Filter terisi: {f.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {filteredColItems.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/40 py-12 text-center space-y-3">
                      <p className="text-xs text-zinc-400">Belum ada data</p>
                      <button
                        type="button"
                        onClick={openAddItemModal}
                        className="min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-zinc-100 text-zinc-950 text-xs font-medium"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Tambah Data Baru</span>
                      </button>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-zinc-800 text-zinc-400 bg-zinc-900">
                            {selectedCollection.fields.map((f) => (
                              <th key={f.id} className="py-2.5 px-3 font-medium whitespace-nowrap">
                                {f.name}
                              </th>
                            ))}
                            <th className="py-2.5 px-3 font-medium text-right">Aksi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/80">
                          {filteredColItems.map((item) => (
                            <tr key={item.id} className="hover:bg-zinc-800/40 transition-colors">
                              {selectedCollection.fields.map((f) => {
                                const val = item.data?.[f.name];
                                return (
                                  <td
                                    key={f.id}
                                    className={`py-2.5 px-3 text-zinc-200 max-w-[200px] truncate ${
                                      f.type === 'number' || f.type === 'date'
                                        ? 'font-mono tabular-nums'
                                        : ''
                                    }`}
                                  >
                                    {f.type === 'boolean'
                                      ? val
                                        ? 'Ya'
                                        : 'Tidak'
                                      : String(val ?? '-')}
                                  </td>
                                );
                              })}
                              <td className="py-2.5 px-3 text-right whitespace-nowrap">
                                <div className="inline-flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => openEditItemModal(item)}
                                    className="p-1.5 rounded hover:bg-zinc-700 text-zinc-300"
                                    title="Edit"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setDeleteConfirm({ kind: 'item', item })}
                                    className="p-1.5 rounded hover:bg-rose-950/60 text-rose-400"
                                    title="Hapus"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Bottom Navigation Mobile (<= 60px high, well below 15% cap) */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 h-14 bg-zinc-900/95 backdrop-blur-md border-t border-zinc-800 grid grid-cols-5">
        {NAV_ITEMS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors ${
              activeTab === id ? 'text-zinc-50' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Icon className="w-4 h-4" />
            <span className="truncate max-w-full px-1">{label}</span>
          </button>
        ))}
      </nav>

      {/* Modal Tambah / Edit Proyek */}
      <Modal
        open={projModalOpen}
        onClose={() => setProjModalOpen(false)}
        title={editingProj ? 'Edit Proyek' : 'Tambah Proyek'}
      >
        <form onSubmit={(e) => void handleSaveProject(e)} className="space-y-3">
          <div>
            <label className="block text-xs text-slate-500 dark:text-zinc-400 mb-1">Judul</label>
            <input
              type="text"
              required
              maxLength={120}
              value={projForm.title}
              onChange={(e) => setProjForm((s) => ({ ...s, title: e.target.value }))}
              placeholder="Judul proyek"
              className="w-full min-h-[42px] px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-slate-900 dark:text-zinc-100"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 dark:text-zinc-400 mb-1">URL</label>
            <input
              type="text"
              required
              maxLength={500}
              value={projForm.url}
              onChange={(e) => setProjForm((s) => ({ ...s, url: e.target.value }))}
              placeholder="https://..."
              className="w-full min-h-[42px] px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-slate-900 dark:text-zinc-100"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 dark:text-zinc-400 mb-1">Kategori</label>
            <input
              type="text"
              maxLength={60}
              value={projForm.category}
              onChange={(e) => setProjForm((s) => ({ ...s, category: e.target.value }))}
              placeholder="Kategori"
              className="w-full min-h-[42px] px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-slate-900 dark:text-zinc-100"
            />
            {selectableCategoryNames.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {selectableCategoryNames.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setProjForm((s) => ({ ...s, category: cat }))}
                    className={`h-6 px-2 rounded-full text-[10px] font-medium transition-colors ${
                      projForm.category.trim().toLowerCase() === cat.toLowerCase()
                        ? 'bg-zinc-100 text-zinc-950'
                        : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs text-slate-500 dark:text-zinc-400 mb-1">Deskripsi</label>
            <textarea
              rows={3}
              maxLength={500}
              value={projForm.description}
              onChange={(e) => setProjForm((s) => ({ ...s, description: e.target.value }))}
              placeholder="Deskripsi singkat"
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-slate-900 dark:text-zinc-100"
            />
          </div>
          <button
            type="button"
            onClick={() => setProjForm((s) => ({ ...s, favorite: !s.favorite }))}
            className={`w-full h-9 px-3 rounded-xl border text-xs font-medium flex items-center justify-between transition-colors ${
              projForm.favorite
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                : 'border-zinc-700 bg-zinc-800/70 text-zinc-300'
            }`}
          >
            <span className="inline-flex items-center gap-2">
              <Star
                className={`w-3.5 h-3.5 ${
                  projForm.favorite ? 'fill-amber-400 text-amber-400' : 'text-zinc-400'
                }`}
              />
              <span>Tandai sebagai Proyek Favorit</span>
            </span>
            <span className="text-[10px] font-mono">
              {projForm.favorite ? 'Aktif' : 'Nonaktif'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setProjForm((s) => ({ ...s, hidden: !s.hidden }))}
            className={`w-full h-9 px-3 rounded-xl border text-xs font-medium flex items-center justify-between transition-colors ${
              projForm.hidden
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                : 'border-zinc-700 bg-zinc-800/70 text-zinc-300'
            }`}
          >
            <span className="inline-flex items-center gap-2">
              {projForm.hidden ? (
                <EyeOff className="w-3.5 h-3.5 text-amber-400" />
              ) : (
                <Eye className="w-3.5 h-3.5 text-zinc-400" />
              )}
              <span>Sembunyikan dari Halaman Publik</span>
            </span>
            <span className="text-[10px] font-mono">
              {projForm.hidden ? 'Tersembunyi' : 'Publik'}
            </span>
          </button>
          {projError && (
            <p className="text-xs text-rose-400 leading-relaxed">{projError}</p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setProjModalOpen(false)}
              className="h-8 px-3.5 rounded-xl border border-zinc-700 text-xs"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={savingProj}
              className="h-8 px-3.5 rounded-xl bg-zinc-100 text-zinc-950 text-xs font-medium disabled:opacity-50"
            >
              {savingProj ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Buat Koleksi Kustom */}
      <Modal
        open={newColModalOpen}
        onClose={() => setNewColModalOpen(false)}
        title="Buat Koleksi Baru"
      >
        <form onSubmit={(e) => void handleCreateCustomCollection(e)} className="space-y-4">
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Nama Koleksi</label>
            <input
              type="text"
              required
              maxLength={60}
              value={newColName}
              onChange={(e) => setNewColName(e.target.value)}
              placeholder="Misal: Catatan, Keuangan, Tugas"
              className="w-full min-h-[42px] px-3 py-2 text-sm rounded-xl border border-zinc-700 bg-zinc-800 text-zinc-100"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Deskripsi (opsional)</label>
            <input
              type="text"
              maxLength={300}
              value={newColDesc}
              onChange={(e) => setNewColDesc(e.target.value)}
              placeholder="Keterangan singkat"
              className="w-full min-h-[42px] px-3 py-2 text-sm rounded-xl border border-zinc-700 bg-zinc-800 text-zinc-100"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-300">Kolom Data</span>
              <button
                type="button"
                onClick={() =>
                  setNewColFields((prev) => [
                    ...prev,
                    { id: `f_${Date.now()}`, name: '', type: 'text' },
                  ])
                }
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                + Tambah Kolom
              </button>
            </div>

            {newColFields.map((field, index) => (
              <div key={field.id} className="flex gap-2">
                <input
                  type="text"
                  required
                  value={field.name}
                  onChange={(e) =>
                    setNewColFields((prev) =>
                      prev.map((f, i) => (i === index ? { ...f, name: e.target.value } : f))
                    )
                  }
                  placeholder={`Nama kolom ${index + 1}`}
                  className="flex-1 min-h-[38px] px-3 py-1.5 text-xs rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-100"
                />
                <select
                  value={field.type}
                  onChange={(e) =>
                    setNewColFields((prev) =>
                      prev.map((f, i) =>
                        i === index ? { ...f, type: e.target.value as CustomFieldType } : f
                      )
                    )
                  }
                  className="min-h-[38px] px-2 py-1.5 text-xs rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-100"
                >
                  {FIELD_TYPES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
                {newColFields.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      setNewColFields((prev) => prev.filter((_, i) => i !== index))
                    }
                    className="p-2 text-rose-400 hover:bg-rose-950/50 rounded-lg"
                    aria-label="Hapus kolom"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {colError && (
            <p className="text-xs text-rose-400 leading-relaxed">{colError}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setNewColModalOpen(false)}
              className="px-4 py-2 rounded-xl border border-zinc-700 text-xs"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-zinc-100 text-zinc-950 text-xs font-medium"
            >
              Buat Koleksi
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Tambah / Edit Baris Koleksi Kustom */}
      <Modal
        open={itemModalOpen}
        onClose={() => setItemModalOpen(false)}
        title={editingItem ? 'Edit Data' : 'Tambah Data'}
      >
        {selectedCollection && (
          <form onSubmit={(e) => void handleSaveItem(e)} className="space-y-3">
            {selectedCollection.fields.map((field) => (
              <div key={field.id}>
                <label className="block text-xs text-zinc-400 mb-1">{field.name}</label>
                {field.type === 'boolean' ? (
                  <label className="inline-flex items-center gap-2 text-sm text-zinc-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(itemDataForm[field.name])}
                      onChange={(e) =>
                        setItemDataForm((prev) => ({
                          ...prev,
                          [field.name]: e.target.checked,
                        }))
                      }
                      className="rounded border-zinc-700 bg-zinc-800"
                    />
                    <span>Ya / Selesai</span>
                  </label>
                ) : (
                  <input
                    type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                    value={String(itemDataForm[field.name] ?? '')}
                    onChange={(e) =>
                      setItemDataForm((prev) => ({
                        ...prev,
                        [field.name]:
                          field.type === 'number' && e.target.value !== ''
                            ? Number(e.target.value)
                            : e.target.value,
                      }))
                    }
                    className="w-full min-h-[42px] px-3 py-2 text-sm rounded-xl border border-zinc-700 bg-zinc-800 text-zinc-100"
                  />
                )}
              </div>
            ))}

            {itemError && (
              <p className="text-xs text-rose-400 leading-relaxed">{itemError}</p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setItemModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-zinc-700 text-xs"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-zinc-100 text-zinc-950 text-xs font-medium"
              >
                Simpan
              </button>
            </div>
          </form>
        )}
      </Modal>
      {/* Modal Keamanan Akun & Kata Sandi Tambahan */}
      <Modal
        open={securityModalOpen}
        onClose={() => setSecurityModalOpen(false)}
        title="Keamanan Akun"
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 space-y-1.5 text-xs">
            <p className="text-zinc-400">
              Email Pemilik: <span className="text-zinc-100 font-mono">{user.email}</span>
            </p>
            <p className="text-zinc-400">
              Login Google:{' '}
              <span className={hasGoogleProvider ? 'text-emerald-400' : 'text-zinc-500'}>
                {hasGoogleProvider ? 'Tertaut' : 'Tidak aktif'}
              </span>
            </p>
            <p className="text-zinc-400">
              Login Kata Sandi:{' '}
              <span className={hasPasswordProvider ? 'text-emerald-400' : 'text-amber-400'}>
                {hasPasswordProvider ? 'Aktif' : 'Belum ditambahkan'}
              </span>
            </p>
          </div>

          <form onSubmit={(e) => void handleSaveAdditionalPassword(e)} className="space-y-3">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">
                {hasPasswordProvider ? 'Kata Sandi Baru' : 'Tambah Kata Sandi Alternatif'}
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
                placeholder="Minimal 6 karakter"
                className="w-full h-10 px-3 text-sm rounded-xl border border-zinc-700 bg-zinc-800 text-zinc-100"
              />
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1">
                Konfirmasi Kata Sandi
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={confirmPass}
                onChange={(e) => setConfirmPass(e.target.value)}
                placeholder="Ulangi kata sandi"
                className="w-full h-10 px-3 text-sm rounded-xl border border-zinc-700 bg-zinc-800 text-zinc-100"
              />
            </div>

            {passError && <p className="text-xs text-rose-400 leading-relaxed">{passError}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setSecurityModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-zinc-700 text-xs text-zinc-300"
              >
                Tutup
              </button>
              <button
                type="submit"
                disabled={savingPass}
                className="px-4 py-2 rounded-xl bg-zinc-100 text-zinc-950 text-xs font-medium disabled:opacity-50"
              >
                {savingPass
                  ? 'Menyimpan...'
                  : hasPasswordProvider
                  ? 'Perbarui Kata Sandi'
                  : 'Simpan Kata Sandi'}
              </button>
            </div>
          </form>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteConfirm)}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={executeConfirmedDelete}
        loading={deletingItem}
        title={
          deleteConfirm?.kind === 'project'
            ? 'Hapus Proyek'
            : deleteConfirm?.kind === 'comment'
            ? 'Hapus Komentar'
            : deleteConfirm?.kind === 'collection'
            ? 'Hapus Koleksi'
            : 'Hapus Baris Data'
        }
        message={
          deleteConfirm?.kind === 'project'
            ? `Yakin ingin menghapus proyek "${deleteConfirm.project.title}"?`
            : deleteConfirm?.kind === 'comment'
            ? `Yakin ingin menghapus komentar dari "${deleteConfirm.comment.name}"?`
            : deleteConfirm?.kind === 'collection'
            ? `Yakin ingin menghapus koleksi "${deleteConfirm.col.name}" beserta seluruh baris datanya?`
            : 'Yakin ingin menghapus baris data ini?'
        }
        detail={
          deleteConfirm?.kind === 'project'
            ? deleteConfirm.project.url
            : deleteConfirm?.kind === 'comment'
            ? deleteConfirm.comment.message
            : deleteConfirm?.kind === 'collection'
            ? deleteConfirm.col.description || `${colItems.length} baris data akan ikut terhapus`
            : deleteConfirm?.kind === 'item' && selectedCollection
            ? selectedCollection.fields
                .slice(0, 2)
                .map((f) => `${f.name}: ${String(deleteConfirm.item.data?.[f.name] ?? '-')}`)
                .join(' · ')
            : undefined
        }
      />
    </div>
  );
}
