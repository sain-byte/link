import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { deleteObject, ref as storageRef } from 'firebase/storage';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Copy,
  Download,
  ExternalLink,
  FileUp,
  HardDrive,
  Loader2,
  Lock,
  LogOut,
  Menu,
  Plus,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import firestoreRulesRaw from '../../firestore.rules?raw';
import { formatAuthError, useAuth } from '../context/AuthContext';
import {
  db,
  formatFirestoreError,
  getDriveAccessToken,
  getFirebaseDiagnostics,
  OperationType,
  reportFirestoreError,
  safeAddDoc,
  safeDeleteDoc,
  safeUpdateDoc,
  storage,
  subscribeFirebaseDiagnostics,
} from '../firebase';
import {
  deleteDriveFile,
  downloadDriveFile,
  DriveApiError,
  DriveFolderFile,
  fetchDriveBlobUrl,
  listVaultFolderFiles,
  uploadFileToDrive,
} from '../services/googleDrive';
import { VaultItem, VaultItemType } from '../types/models';
import { normalizeUrl } from '../utils/format';
import ConfirmDialog from '../components/ConfirmDialog';
import GoogleSignInButton from '../components/GoogleSignInButton';
import Modal from '../components/Modal';
import Toast from '../components/Toast';
import DriveFilesPanel from '../components/vault/DriveFilesPanel';
import VaultCard from '../components/vault/VaultCard';
import VaultSidebarNav from '../components/vault/VaultSidebarNav';
import {
  formatBytes,
  getVaultCategoryMeta,
  isIframePreviewable,
  isOfficeDocument,
  parseTagsInput,
  VAULT_CATEGORIES,
  VAULT_TYPES_ONLY,
  VaultCategoryFilter,
} from '../components/vault/vaultMeta';

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB for Google Drive uploads

export default function VaultPage() {
  const {
    user,
    isOwner,
    isEmailMatch,
    loading: authLoading,
    ownerEmail,
    driveAccessToken,
    isDriveConnected,
    loginWithGoogle,
    connectGoogleDrive,
    disconnectGoogleDrive,
    loginWithEmail,
    resetPassword,
    resendVerification,
    reloadUser,
    logout,
  } = useAuth();

  const [diagnostics, setDiagnostics] = useState(() => getFirebaseDiagnostics());
  useEffect(() => subscribeFirebaseDiagnostics(setDiagnostics), []);

  // Auth Gate state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginNotice, setLoginNotice] = useState('');
  const [submittingLogin, setSubmittingLogin] = useState(false);

  // Google Drive connect & folder listing state
  const [connectingDrive, setConnectingDrive] = useState(false);
  const [driveFiles, setDriveFiles] = useState<DriveFolderFile[]>([]);
  const [loadingDriveFiles, setLoadingDriveFiles] = useState(false);
  const [driveFilesError, setDriveFilesError] = useState('');
  const [driveBlobUrls, setDriveBlobUrls] = useState<Record<string, string>>({});
  const driveBlobUrlsRef = useRef<Record<string, string>>({});
  const [loadingDriveMediaIds, setLoadingDriveMediaIds] = useState<Record<string, boolean>>({});
  const loadingMediaSetRef = useRef<Set<string>>(new Set());
  const [downloadingItemId, setDownloadingItemId] = useState<string | null>(null);

  // Vault Workspace state
  const [items, setItems] = useState<VaultItem[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [dataError, setDataError] = useState('');
  const [copiedRules, setCopiedRules] = useState(false);
  const [activeCategory, setActiveCategory] = useState<VaultCategoryFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  // Card interaction states
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copyTimerRef = useRef<number | null>(null);
  const [revealedIds, setRevealedIds] = useState<Record<string, boolean>>({});
  const [togglingDoneIds, setTogglingDoneIds] = useState<Record<string, boolean>>({});

  // Toast
  const [toastMsg, setToastMsg] = useState('');
  const toastTimerRef = useRef<number | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Add / Edit Modal state
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<VaultItem | null>(null);
  const [formType, setFormType] = useState<VaultItemType>('note');
  const [formTitle, setFormTitle] = useState('');
  const [formTagsRaw, setFormTagsRaw] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formDueDate, setFormDueDate] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [formError, setFormError] = useState('');
  const [savingForm, setSavingForm] = useState(false);

  // Preview / Lightbox / Delete Modals
  const [docPreviewItem, setDocPreviewItem] = useState<VaultItem | null>(null);
  const [docPreviewBlobUrl, setDocPreviewBlobUrl] = useState<string | null>(null);
  const [loadingDocPreview, setLoadingDocPreview] = useState(false);
  const [docPreviewError, setDocPreviewError] = useState('');
  const [mediaLightboxItem, setMediaLightboxItem] = useState<VaultItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<
    | { kind: 'vault'; item: VaultItem }
    | { kind: 'driveFile'; file: DriveFolderFile }
    | null
  >(null);
  const [deletingItem, setDeletingItem] = useState(false);

  const showToast = useCallback((msg: string) => {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    setToastMsg(msg);
    toastTimerRef.current = window.setTimeout(() => {
      setToastMsg('');
      toastTimerRef.current = null;
    }, 3800);
  }, []);

  // Revoke cached Drive Blob URLs on unmount or when Drive token clears
  const clearAllBlobUrls = useCallback(() => {
    Object.values(driveBlobUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
    driveBlobUrlsRef.current = {};
    loadingMediaSetRef.current.clear();
    setDriveBlobUrls({});
    setLoadingDriveMediaIds({});
  }, []);

  useEffect(() => {
    return () => {
      clearAllBlobUrls();
      if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    };
  }, [clearAllBlobUrls, filePreviewUrl]);

  useEffect(() => {
    if (!driveAccessToken) {
      clearAllBlobUrls();
    }
  }, [driveAccessToken, clearAllBlobUrls]);

  // Enforce noindex & dark mode on /vault
  useEffect(() => {
    document.title = 'VAULT — sainbyte';
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
      const savedTheme = localStorage.getItem('sainbyte_theme') || 'dark';
      const sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const shouldBeDark = savedTheme === 'system' ? sysDark : savedTheme === 'dark';
      document.documentElement.classList.toggle('dark', shouldBeDark);
    };
  }, []);

  // Keyboard shortcut: '/' focuses search, 'Escape' closes drawer/lightbox
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileDrawerOpen(false);
        setMediaLightboxItem(null);
        return;
      }
      if (
        e.key === '/' &&
        !formOpen &&
        !docPreviewItem &&
        !mediaLightboxItem &&
        !deleteTarget &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [formOpen, docPreviewItem, mediaLightboxItem, deleteTarget]);

  // Subscribe to Firestore vault collection ONLY when isOwner === true
  useEffect(() => {
    if (!isOwner) {
      setItems([]);
      setLoadingData(false);
      setDataError('');
      return;
    }

    setLoadingData(true);
    const q = query(collection(db, 'vault'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: VaultItem[] = snap.docs.map((d) => {
          const raw = d.data();
          const rawType = String(raw.type || 'note') as VaultItemType;
          const validType = VAULT_TYPES_ONLY.some((t) => t.id === rawType) ? rawType : 'note';
          return {
            id: d.id,
            type: validType,
            title: String(raw.title || ''),
            tags: Array.isArray(raw.tags)
              ? raw.tags.map((t) => String(t)).filter(Boolean)
              : [],
            content: String(raw.content || ''),
            dueDate: raw.dueDate ? String(raw.dueDate) : undefined,
            done: Boolean(raw.done),
            storagePath: raw.storagePath ? String(raw.storagePath) : undefined,
            downloadUrl: raw.downloadUrl ? String(raw.downloadUrl) : undefined,
            driveFileId: raw.driveFileId ? String(raw.driveFileId) : undefined,
            driveViewUrl: raw.driveViewUrl ? String(raw.driveViewUrl) : undefined,
            fileName: raw.fileName ? String(raw.fileName) : undefined,
            fileSize: typeof raw.fileSize === 'number' ? raw.fileSize : undefined,
            mimeType: raw.mimeType ? String(raw.mimeType) : undefined,
            createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
          };
        });
        setItems(list);
        setLoadingData(false);
        setDataError('');
      },
      (err) => {
        reportFirestoreError(err, OperationType.LIST, 'vault');
        setDataError(formatFirestoreError(err));
        setLoadingData(false);
      }
    );

    return () => unsub();
  }, [isOwner]);

  // Fetch private Google Drive image thumbnails into memory Blob URLs when Drive is connected
  useEffect(() => {
    if (!isOwner || !driveAccessToken) return;
    let cancelled = false;

    const mediaDriveItems = items.filter(
      (it) =>
        it.type === 'media' &&
        it.driveFileId &&
        !driveBlobUrlsRef.current[it.driveFileId] &&
        !loadingMediaSetRef.current.has(it.driveFileId)
    );

    mediaDriveItems.forEach((it) => {
      const fileId = it.driveFileId!;
      loadingMediaSetRef.current.add(fileId);
      setLoadingDriveMediaIds((prev) => ({ ...prev, [fileId]: true }));

      fetchDriveBlobUrl(fileId, driveAccessToken)
        .then(({ blobUrl }) => {
          if (cancelled) {
            URL.revokeObjectURL(blobUrl);
            return;
          }
          driveBlobUrlsRef.current[fileId] = blobUrl;
          setDriveBlobUrls((prev) => ({ ...prev, [fileId]: blobUrl }));
        })
        .catch((err) => {
          if (!cancelled && err instanceof DriveApiError && err.isAuthError) {
            showToast(err.message);
          }
        })
        .finally(() => {
          loadingMediaSetRef.current.delete(fileId);
          if (!cancelled) {
            setLoadingDriveMediaIds((prev) => ({ ...prev, [fileId]: false }));
          }
        });
    });

    return () => {
      cancelled = true;
    };
  }, [isOwner, driveAccessToken, items, showToast]);

  const fetchDriveFiles = useCallback(async (tokenOverride?: string) => {
    const token = tokenOverride || getDriveAccessToken();
    if (!token) {
      setDriveFiles([]);
      setDriveFilesError('');
      setLoadingDriveFiles(false);
      return;
    }
    setLoadingDriveFiles(true);
    setDriveFilesError('');
    try {
      const files = await listVaultFolderFiles(token);
      setDriveFiles(files);
    } catch (err) {
      setDriveFilesError(
        err instanceof Error ? err.message : 'Gagal memuat daftar file dari Google Drive.'
      );
    } finally {
      setLoadingDriveFiles(false);
    }
  }, []);

  useEffect(() => {
    if (!isOwner || !driveAccessToken) {
      setDriveFiles([]);
      setDriveFilesError('');
      setLoadingDriveFiles(false);
      return;
    }
    void fetchDriveFiles(driveAccessToken);
  }, [isOwner, driveAccessToken, fetchDriveFiles]);

  const handleConnectDrive = async (): Promise<string | null> => {
    setConnectingDrive(true);
    try {
      const token = await connectGoogleDrive();
      showToast('Google Drive terhubung ke folder privat sainbyte-vault');
      return token;
    } catch (err) {
      showToast(formatAuthError(err));
      return null;
    } finally {
      setConnectingDrive(false);
    }
  };

  const ensureDriveToken = async (): Promise<string | null> => {
    const existing = getDriveAccessToken();
    if (existing) return existing;
    return handleConnectDrive();
  };

  // Counts per category
  const countsByCategory = useMemo(() => {
    const counts: Record<VaultCategoryFilter, number> = {
      all: items.length,
      drive: driveFiles.length,
      code: 0,
      note: 0,
      reminder: 0,
      doc: 0,
      vault: 0,
      media: 0,
      link: 0,
      contact: 0,
    };
    items.forEach((item) => {
      counts[item.type] = (counts[item.type] || 0) + 1;
    });
    return counts;
  }, [items, driveFiles.length]);

  // Filtered items
  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const tagTerm = q.startsWith('#') ? q.slice(1) : q;

    return items.filter((item) => {
      if (activeCategory !== 'all' && item.type !== activeCategory) {
        return false;
      }
      if (!q) return true;
      const inTitle = item.title.toLowerCase().includes(q);
      const inContent =
        item.type === 'vault' ? false : item.content.toLowerCase().includes(q);
      const inTags = item.tags.some((t) => t.toLowerCase().includes(tagTerm));
      return inTitle || inContent || inTags;
    });
  }, [items, activeCategory, searchQuery]);

  const activeCategoryMeta = getVaultCategoryMeta(activeCategory);

  // Auth handlers
  const handleLoginGoogle = async () => {
    setLoginError('');
    setLoginNotice('');
    setSubmittingLogin(true);
    try {
      await loginWithGoogle();
    } catch (err) {
      setLoginError(formatAuthError(err));
    } finally {
      setSubmittingLogin(false);
    }
  };

  const handleLoginEmail = async (e: FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoginNotice('');
    setSubmittingLogin(true);
    try {
      await loginWithEmail(email, password);
    } catch (err) {
      setLoginError(formatAuthError(err));
    } finally {
      setSubmittingLogin(false);
    }
  };

  const handleResetPassword = async () => {
    const target = (email || ownerEmail).trim();
    if (!target) {
      setLoginError('Masukkan alamat email terlebih dahulu.');
      return;
    }
    setLoginError('');
    setLoginNotice('');
    setSubmittingLogin(true);
    try {
      await resetPassword(target);
      setLoginNotice(`Email pengaturan ulang kata sandi dikirim ke ${target}.`);
    } catch (err) {
      setLoginError(formatAuthError(err));
    } finally {
      setSubmittingLogin(false);
    }
  };

  // Copy handler
  const handleCopy = async (key: string, value: string, label = 'Disalin ke clipboard') => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(() => {
        setCopiedKey(null);
        copyTimerRef.current = null;
      }, 1600);
      showToast(label);
    } catch {
      showToast('Gagal menyalin ke clipboard');
    }
  };

  const handleCopyFirestoreRules = async () => {
    try {
      await navigator.clipboard.writeText(firestoreRulesRaw);
      setCopiedRules(true);
      showToast('Isi firestore.rules disalin — tempel ke Console > Firestore Database > Rules');
      window.setTimeout(() => setCopiedRules(false), 2500);
    } catch {
      showToast('Gagal menyalin isi firestore.rules');
    }
  };

  const handleToggleReveal = (id: string) => {
    setRevealedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleToggleDone = async (item: VaultItem) => {
    const nextDone = !item.done;
    setTogglingDoneIds((prev) => ({ ...prev, [item.id]: true }));
    setItems((prev) =>
      prev.map((it) => (it.id === item.id ? { ...it, done: nextDone } : it))
    );
    try {
      await safeUpdateDoc(`vault/${item.id}`, { done: nextDone });
      showToast(nextDone ? 'Pengingat ditandai selesai' : 'Pengingat dibuka kembali');
    } catch (err) {
      setItems((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, done: item.done } : it))
      );
      showToast(formatFirestoreError(err));
    } finally {
      setTogglingDoneIds((prev) => ({ ...prev, [item.id]: false }));
    }
  };

  // Download file (Drive or legacy URL)
  const handleDownloadFile = async (item: VaultItem) => {
    if (item.driveFileId) {
      setDownloadingItemId(item.id);
      try {
        const token = await ensureDriveToken();
        if (!token) return;
        await downloadDriveFile(
          item.driveFileId,
          item.fileName || item.title || 'vault-file',
          token
        );
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Gagal mengunduh file dari Google Drive.');
      } finally {
        setDownloadingItemId(null);
      }
      return;
    }

    if (item.downloadUrl) {
      const a = document.createElement('a');
      a.href = item.downloadUrl;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.download = item.fileName || item.title;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  };

  const handleDownloadDriveFolderFile = async (file: DriveFolderFile) => {
    setDownloadingItemId(file.id);
    try {
      const token = await ensureDriveToken();
      if (!token) return;
      await downloadDriveFile(file.id, file.name || 'vault-file', token);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal mengunduh file dari Google Drive.');
    } finally {
      setDownloadingItemId(null);
    }
  };

  // Open Document Preview Modal
  const handleOpenDocPreview = async (item: VaultItem) => {
    if (docPreviewBlobUrl) {
      URL.revokeObjectURL(docPreviewBlobUrl);
      setDocPreviewBlobUrl(null);
    }
    setDocPreviewError('');
    setDocPreviewItem(item);

    const canIframe = isIframePreviewable(
      item.mimeType,
      item.downloadUrl || item.fileName,
      item.content
    );
    const isOffice = isOfficeDocument(item.mimeType, item.fileName || item.content);

    if (item.driveFileId && canIframe && !isOffice) {
      setLoadingDocPreview(true);
      try {
        const token = await ensureDriveToken();
        if (!token) {
          setDocPreviewError('Hubungkan Google Drive untuk memuat pratinjau dokumen privat.');
          return;
        }
        const { blobUrl } = await fetchDriveBlobUrl(item.driveFileId, token);
        setDocPreviewBlobUrl(blobUrl);
      } catch (err) {
        setDocPreviewError(
          err instanceof Error ? err.message : 'Gagal memuat pratinjau dokumen dari Google Drive.'
        );
      } finally {
        setLoadingDocPreview(false);
      }
    }
  };

  const closeDocPreview = () => {
    if (docPreviewBlobUrl) {
      URL.revokeObjectURL(docPreviewBlobUrl);
    }
    setDocPreviewBlobUrl(null);
    setDocPreviewError('');
    setLoadingDocPreview(false);
    setDocPreviewItem(null);
  };

  const handleOpenMediaLightbox = async (item: VaultItem) => {
    setMediaLightboxItem(item);
    if (item.driveFileId && !driveBlobUrlsRef.current[item.driveFileId]) {
      const token = await ensureDriveToken();
      if (!token) return;
      try {
        const { blobUrl } = await fetchDriveBlobUrl(item.driveFileId, token);
        driveBlobUrlsRef.current[item.driveFileId] = blobUrl;
        setDriveBlobUrls((prev) => ({ ...prev, [item.driveFileId!]: blobUrl }));
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Gagal memuat foto dari Google Drive.');
      }
    }
  };

  // Open Create / Edit Modal
  const openCreateModal = (presetType?: VaultItemType) => {
    const defaultType: VaultItemType =
      presetType ||
      (activeCategory === 'all'
        ? 'note'
        : activeCategory === 'drive'
          ? 'doc'
          : activeCategory);
    setEditingItem(null);
    setFormType(defaultType);
    setFormTitle('');
    setFormTagsRaw('');
    setFormContent('');
    setFormDueDate('');
    setSelectedFile(null);
    if (filePreviewUrl) {
      URL.revokeObjectURL(filePreviewUrl);
    }
    setFilePreviewUrl(null);
    setUploadProgress(null);
    setFormError('');
    setFormOpen(true);
    setMobileDrawerOpen(false);
  };

  const openEditModal = (item: VaultItem) => {
    setEditingItem(item);
    setFormType(item.type);
    setFormTitle(item.title);
    setFormTagsRaw(item.tags.map((t) => `#${t}`).join(' '));
    setFormContent(item.content);
    setFormDueDate(item.dueDate || '');
    setSelectedFile(null);
    if (filePreviewUrl) {
      URL.revokeObjectURL(filePreviewUrl);
    }
    setFilePreviewUrl(null);
    setUploadProgress(null);
    setFormError('');
    setFormOpen(true);
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setFormError('');
    if (filePreviewUrl) {
      URL.revokeObjectURL(filePreviewUrl);
      setFilePreviewUrl(null);
    }
    if (!file) {
      setSelectedFile(null);
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setFormError('Ukuran file melebihi batas maksimum 50 MB.');
      setSelectedFile(null);
      e.target.value = '';
      return;
    }
    setSelectedFile(file);
    if (!formTitle.trim()) {
      setFormTitle(file.name.replace(/\.[^/.]+$/, '').slice(0, 160));
    }
    if (formType === 'media' && file.type.startsWith('image/')) {
      setFilePreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleSaveForm = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');

    const title = formTitle.trim().slice(0, 160);
    if (!title) {
      setFormError('Judul arsip wajib diisi.');
      return;
    }

    const tags = parseTagsInput(formTagsRaw);
    const isFileType = formType === 'doc' || formType === 'media';
    const hasExistingFile = Boolean(editingItem?.driveFileId || editingItem?.downloadUrl);

    if (isFileType && !editingItem && !selectedFile) {
      setFormError(
        formType === 'media'
          ? 'Pilih file gambar untuk disimpan ke Google Drive.'
          : 'Pilih file Excel, PDF, atau dokumen untuk disimpan ke Google Drive.'
      );
      return;
    }

    if (isFileType && editingItem && !hasExistingFile && !selectedFile) {
      setFormError('Pilih file untuk diunggah ke Google Drive.');
      return;
    }

    let finalContent = formContent.slice(0, 50000);
    if (formType === 'link') {
      const normalized = normalizeUrl(formContent);
      if (!normalized) {
        setFormError('Masukkan URL tautan yang valid (contoh: https://contoh.com).');
        return;
      }
      finalContent = normalized.slice(0, 50000);
    } else if (!isFileType && !finalContent.trim()) {
      setFormError('Isi konten tidak boleh kosong.');
      return;
    }

    setSavingForm(true);
    let activeToken = getDriveAccessToken();
    let newlyUploadedDriveFileId: string | undefined;
    let newlyUploadedViewUrl: string | undefined;
    let newlyUploadedFileName: string | undefined;
    let newlyUploadedFileSize: number | undefined;
    let newlyUploadedMimeType: string | undefined;

    try {
      if (isFileType && selectedFile) {
        if (!activeToken) {
          activeToken = await handleConnectDrive();
          if (!activeToken) {
            setFormError('Hubungkan Google Drive terlebih dahulu untuk mengunggah file.');
            setSavingForm(false);
            return;
          }
        }
        setUploadProgress(0);
        const uploaded = await uploadFileToDrive(selectedFile, activeToken, (pct) =>
          setUploadProgress(pct)
        );
        newlyUploadedDriveFileId = uploaded.driveFileId;
        newlyUploadedViewUrl = uploaded.driveViewUrl;
        newlyUploadedFileName = uploaded.fileName;
        newlyUploadedFileSize = uploaded.fileSize;
        newlyUploadedMimeType = uploaded.mimeType;
        finalContent = `${uploaded.fileName} • ${formatBytes(uploaded.fileSize)}`;
      }

      const payload: Record<string, unknown> = {
        type: formType,
        title,
        tags,
        content: finalContent,
        done: editingItem ? editingItem.done : false,
      };

      if (formType === 'reminder') {
        payload.dueDate = formDueDate.trim().slice(0, 64);
      } else if (editingItem?.dueDate !== undefined) {
        payload.dueDate = '';
      }

      if (isFileType) {
        if (newlyUploadedDriveFileId) {
          payload.driveFileId = newlyUploadedDriveFileId;
          payload.driveViewUrl = newlyUploadedViewUrl || '';
          payload.fileName = newlyUploadedFileName || '';
          payload.fileSize = newlyUploadedFileSize ?? 0;
          payload.mimeType = newlyUploadedMimeType || '';
          if (editingItem?.storagePath !== undefined) payload.storagePath = '';
          if (editingItem?.downloadUrl !== undefined) payload.downloadUrl = '';
        } else if (editingItem) {
          if (editingItem.driveFileId !== undefined) payload.driveFileId = editingItem.driveFileId;
          if (editingItem.driveViewUrl !== undefined) payload.driveViewUrl = editingItem.driveViewUrl;
          if (editingItem.fileName !== undefined) payload.fileName = editingItem.fileName;
          if (editingItem.fileSize !== undefined) payload.fileSize = editingItem.fileSize;
          if (editingItem.mimeType !== undefined) payload.mimeType = editingItem.mimeType;
          if (editingItem.storagePath !== undefined) payload.storagePath = editingItem.storagePath;
          if (editingItem.downloadUrl !== undefined) payload.downloadUrl = editingItem.downloadUrl;
        }
      } else if (editingItem) {
        if (editingItem.driveFileId !== undefined) payload.driveFileId = '';
        if (editingItem.driveViewUrl !== undefined) payload.driveViewUrl = '';
        if (editingItem.fileName !== undefined) payload.fileName = '';
        if (editingItem.fileSize !== undefined) payload.fileSize = 0;
        if (editingItem.storagePath !== undefined) payload.storagePath = '';
        if (editingItem.downloadUrl !== undefined) payload.downloadUrl = '';
        if (editingItem.mimeType !== undefined) payload.mimeType = '';
      }

      if (editingItem) {
        const res = await safeUpdateDoc(`vault/${editingItem.id}`, payload);
        if (res.usedFallback) {
          setItems((prev) =>
            prev.map((it) =>
              it.id === editingItem.id
                ? {
                    ...it,
                    type: formType,
                    title,
                    tags,
                    content: finalContent,
                    dueDate: formType === 'reminder' ? formDueDate.trim() : undefined,
                    driveFileId: isFileType
                      ? newlyUploadedDriveFileId || editingItem.driveFileId
                      : undefined,
                    driveViewUrl: isFileType
                      ? newlyUploadedViewUrl || editingItem.driveViewUrl
                      : undefined,
                    fileName: isFileType
                      ? newlyUploadedFileName || editingItem.fileName
                      : undefined,
                    fileSize: isFileType
                      ? newlyUploadedFileSize ?? editingItem.fileSize
                      : undefined,
                    mimeType: isFileType
                      ? newlyUploadedMimeType || editingItem.mimeType
                      : undefined,
                  }
                : it
            )
          );
        }

        // Clean up replaced Drive/Storage file
        const shouldRemoveOldFile =
          (Boolean(newlyUploadedDriveFileId) || !isFileType) &&
          (editingItem.driveFileId || editingItem.storagePath);
        if (shouldRemoveOldFile) {
          if (
            editingItem.driveFileId &&
            editingItem.driveFileId !== newlyUploadedDriveFileId &&
            activeToken
          ) {
            void deleteDriveFile(editingItem.driveFileId, activeToken).catch(() => {});
          }
          if (editingItem.storagePath) {
            void deleteObject(storageRef(storage, editingItem.storagePath)).catch(() => {});
          }
        }
        showToast('Arsip diperbarui');
      } else {
        const createdAt = Date.now();
        const createPayload = { ...payload, createdAt };
        const res = await safeAddDoc('vault', createPayload);
        if (res.usedFallback) {
          setItems((prev) => [
            {
              id: res.id,
              type: formType,
              title,
              tags,
              content: finalContent,
              dueDate: formType === 'reminder' && formDueDate.trim() ? formDueDate.trim() : undefined,
              done: false,
              driveFileId: newlyUploadedDriveFileId,
              driveViewUrl: newlyUploadedViewUrl,
              fileName: newlyUploadedFileName,
              fileSize: newlyUploadedFileSize,
              mimeType: newlyUploadedMimeType,
              createdAt,
            },
            ...prev,
          ]);
        }
        showToast(
          newlyUploadedDriveFileId
            ? 'File disimpan ke Google Drive (sainbyte-vault)'
            : 'Arsip baru disimpan ke Vault'
        );
      }

      if (newlyUploadedDriveFileId && activeToken) {
        void fetchDriveFiles(activeToken);
      }

      setFormOpen(false);
    } catch (err) {
      const msg =
        err instanceof DriveApiError ? err.message : formatFirestoreError(err);
      setFormError(msg);
      showToast(msg);
      // Rollback newly uploaded Drive file if Firestore write failed
      if (newlyUploadedDriveFileId && activeToken) {
        void deleteDriveFile(newlyUploadedDriveFileId, activeToken).catch(() => {});
      }
    } finally {
      setSavingForm(false);
      setUploadProgress(null);
    }
  };

  // Delete handler (always gated by ConfirmDialog)
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeletingItem(true);
    try {
      if (deleteTarget.kind === 'driveFile') {
        const token = await ensureDriveToken();
        if (!token) {
          setDeletingItem(false);
          showToast('Hubungkan Google Drive untuk menghapus file ini.');
          return;
        }
        await deleteDriveFile(deleteTarget.file.id, token);
        setDriveFiles((prev) => prev.filter((f) => f.id !== deleteTarget.file.id));
        setDeleteTarget(null);
        showToast('File dihapus dari Google Drive');
        return;
      }

      const targetItem = deleteTarget.item;
      if (targetItem.driveFileId) {
        const token = await ensureDriveToken();
        if (!token) {
          setDeletingItem(false);
          showToast('Hubungkan Google Drive untuk menghapus file terkait.');
          return;
        }
        await deleteDriveFile(targetItem.driveFileId, token);
        setDriveFiles((prev) => prev.filter((f) => f.id !== targetItem.driveFileId));
      }

      if (targetItem.storagePath) {
        try {
          await deleteObject(storageRef(storage, targetItem.storagePath));
        } catch (storageErr) {
          const code = ((storageErr as { code?: string })?.code || '').toLowerCase();
          if (code !== 'storage/object-not-found') {
            throw storageErr;
          }
        }
      }

      const res = await safeDeleteDoc(`vault/${targetItem.id}`);
      if (res.usedFallback) {
        setItems((prev) => prev.filter((it) => it.id !== targetItem.id));
      }
      setDeleteTarget(null);
      showToast('Arsip dihapus permanen');
    } catch (err) {
      const msg =
        err instanceof DriveApiError ? err.message : formatFirestoreError(err);
      showToast(msg);
    } finally {
      setDeletingItem(false);
    }
  };

  // Auth loading state
  if (authLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#09090b] text-zinc-300">
        <div className="flex items-center gap-2.5 font-mono text-xs tracking-wide text-zinc-400">
          <Loader2 className="h-4 w-4 animate-spin text-[#10b981]" />
          <span>MEMERIKSA SESI VAULT...</span>
        </div>
      </div>
    );
  }

  // Login Gate (when unauthenticated or not verified owner)
  if (!user || !isOwner) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#09090b] p-4 text-zinc-100">
        <Toast message={toastMsg} />
        <div className="w-full max-w-sm space-y-5 rounded-xl border border-[#27272a] bg-[#121216] p-6">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] font-medium tracking-wider text-emerald-400">
              <Lock className="h-3 w-3" />
              <span>VAULT // OWNER ONLY</span>
            </div>
            <h1 className="text-lg font-semibold tracking-tight text-zinc-50">
              Personal Digital Vault
            </h1>
            <p className="text-xs leading-relaxed text-zinc-400">
              Masuk dengan akun Google pemilik untuk membuka brankas kode, catatan, kredensial, dan penyimpanan Google Drive privat.
            </p>
          </div>

          {user && !isEmailMatch && (
            <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-950/30 p-3 text-xs text-amber-200">
              <p>
                Akun <strong>{user.email}</strong> tidak memiliki izin akses Vault ({ownerEmail}).
              </p>
              <button
                type="button"
                onClick={() => void logout()}
                className="font-mono text-[11px] text-amber-300 underline hover:text-amber-100"
              >
                Keluar dan ganti akun
              </button>
            </div>
          )}

          {user && isEmailMatch && !user.emailVerified && (
            <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-950/30 p-3 text-xs text-amber-200">
              <p>
                Email Anda belum terverifikasi. Verifikasi email lalu muat ulang status, atau masuk dengan Google.
              </p>
              <div className="flex flex-wrap items-center gap-3 font-mono text-[11px]">
                <button
                  type="button"
                  onClick={() =>
                    void resendVerification()
                      .then(() => setLoginNotice('Tautan verifikasi dikirim ke email Anda.'))
                      .catch((err) => setLoginError(formatAuthError(err)))
                  }
                  className="text-amber-300 underline hover:text-amber-100"
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
                  className="text-emerald-300 underline hover:text-emerald-100"
                >
                  Muat ulang status
                </button>
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="text-zinc-300 underline hover:text-white"
                >
                  Keluar
                </button>
              </div>
            </div>
          )}

          <GoogleSignInButton
            label="Sign in with Google"
            disabled={submittingLogin}
            onClick={() => void handleLoginGoogle()}
            className="w-full"
          />

          <div className="relative flex items-center justify-center">
            <span className="h-px w-full bg-[#27272a]" />
            <span className="shrink-0 bg-[#121216] px-3 font-mono text-[11px] text-zinc-500">
              atau
            </span>
            <span className="h-px w-full bg-[#27272a]" />
          </div>

          <form onSubmit={(e) => void handleLoginEmail(e)} className="space-y-3">
            <div>
              <label className="mb-1 block font-mono text-[11px] text-zinc-400">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@domain.com"
                className="h-10 w-full rounded-lg border border-[#27272a] bg-[#09090b] px-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-[#10b981] focus:outline-none"
              />
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="block font-mono text-[11px] text-zinc-400">Kata Sandi</label>
                <button
                  type="button"
                  disabled={submittingLogin}
                  onClick={() => void handleResetPassword()}
                  className="font-mono text-[11px] text-zinc-400 underline hover:text-emerald-300"
                >
                  Lupa sandi?
                </button>
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="h-10 w-full rounded-lg border border-[#27272a] bg-[#09090b] px-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-[#10b981] focus:outline-none"
              />
            </div>

            {loginNotice && <p className="text-xs text-emerald-400">{loginNotice}</p>}
            {loginError && <p className="text-xs leading-relaxed text-rose-400">{loginError}</p>}

            <button
              type="submit"
              disabled={submittingLogin}
              className="h-10 w-full rounded-lg border border-[#27272a] bg-[#09090b] text-xs sm:text-sm font-medium text-zinc-200 transition-colors hover:border-zinc-600 hover:bg-zinc-900 disabled:opacity-50"
            >
              {submittingLogin ? 'Memverifikasi...' : 'Masuk dengan Email'}
            </button>
          </form>

          <div className="flex items-center justify-between border-t border-[#27272a] pt-3">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-xs text-zinc-400 transition-colors hover:text-zinc-100"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Kembali ke Beranda</span>
            </Link>
            <span className="font-mono text-[10px] text-zinc-600">{diagnostics.projectId}</span>
          </div>
        </div>
      </div>
    );
  }

  const sidebarContent = (
    <div className="flex h-full flex-col justify-between bg-[#0c0c0f]">
      <div className="space-y-4 p-4">
        {/* Brand */}
        <div className="flex items-center justify-between border-b border-[#27272a] pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-500/35 bg-emerald-500/10 text-[#10b981]">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-sm font-semibold tracking-wider text-zinc-50">
                  VAULT
                </span>
                <span className="h-1.5 w-1.5 rounded-full bg-[#10b981]" />
              </div>
              <p className="font-mono text-[10px] text-zinc-500">sainbyte workspace</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMobileDrawerOpen(false)}
            aria-label="Tutup menu"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#27272a] text-zinc-400 hover:text-zinc-100 lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Primary CTA */}
        <button
          type="button"
          onClick={() => openCreateModal()}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#10b981] px-3 text-xs sm:text-sm font-semibold text-zinc-950 transition-colors hover:bg-[#34d399]"
        >
          <Plus className="h-4 w-4 stroke-[2.5]" />
          <span>Tambah Arsip Baru</span>
        </button>

        {/* Category List with Smooth Sliding Indicator */}
        <VaultSidebarNav
          categories={VAULT_CATEGORIES}
          activeCategory={activeCategory}
          countsByCategory={countsByCategory}
          onSelectCategory={(id) => {
            setActiveCategory(id);
            setMobileDrawerOpen(false);
          }}
        />
      </div>

      {/* Bottom Footer Actions */}
      <div className="space-y-2 border-t border-[#27272a] p-4">
        <div className="flex items-center justify-between rounded-lg border border-[#27272a] bg-[#09090b] px-2.5 py-2">
          <span className="flex items-center gap-1.5 font-mono text-[10px] text-zinc-400">
            <HardDrive
              className={`h-3.5 w-3.5 ${isDriveConnected ? 'text-[#10b981]' : 'text-zinc-500'}`}
            />
            <span>{isDriveConnected ? 'Drive Terhubung' : 'Drive Belum Aktif'}</span>
          </span>
          {isDriveConnected ? (
            <button
              type="button"
              onClick={() => void disconnectGoogleDrive()}
              className="font-mono text-[10px] text-zinc-400 underline hover:text-zinc-200"
            >
              Putus
            </button>
          ) : (
            <button
              type="button"
              disabled={connectingDrive}
              onClick={() => void handleConnectDrive()}
              className="font-mono text-[10px] text-emerald-400 underline hover:text-emerald-300 disabled:opacity-50"
            >
              {connectingDrive ? '...' : 'Hubungkan'}
            </button>
          )}
        </div>

        <Link
          to="/"
          className="flex h-9 w-full items-center gap-2 rounded-lg border border-[#27272a] bg-[#121216] px-3 text-xs font-medium text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Kembali ke Beranda</span>
        </Link>
        <button
          type="button"
          onClick={() => void logout()}
          className="flex h-9 w-full items-center gap-2 rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 text-xs font-medium text-rose-300 transition-colors hover:bg-rose-500/20"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>Kunci / Logout</span>
        </button>
      </div>
    </div>
  );

  const previewUrl = docPreviewItem?.driveFileId
    ? docPreviewBlobUrl || ''
    : docPreviewItem?.downloadUrl || '';
  const canDirectIframe = docPreviewItem
    ? isIframePreviewable(
        docPreviewItem.mimeType,
        docPreviewItem.downloadUrl || docPreviewItem.fileName,
        docPreviewItem.content
      )
    : false;
  const isOffice = docPreviewItem
    ? isOfficeDocument(docPreviewItem.mimeType, docPreviewItem.fileName || docPreviewItem.content)
    : false;
  const iframeSrc =
    docPreviewItem && previewUrl
      ? !docPreviewItem.driveFileId && isOffice
        ? `https://docs.google.com/gview?url=${encodeURIComponent(previewUrl)}&embedded=true`
        : previewUrl
      : '';

  const lightboxImageUrl = mediaLightboxItem
    ? mediaLightboxItem.driveFileId
      ? driveBlobUrls[mediaLightboxItem.driveFileId]
      : mediaLightboxItem.downloadUrl
    : undefined;

  return (
    <div className="flex h-dvh overflow-hidden bg-[#09090b] text-zinc-100">
      <Toast message={toastMsg} />

      {/* Desktop Fixed Left Sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-[#27272a] bg-[#0c0c0f] lg:block">
        {sidebarContent}
      </aside>

      {/* Mobile Slide-Over Drawer (always mounted for smooth GPU slide transition) */}
      <div
        aria-hidden={!mobileDrawerOpen}
        className={`fixed inset-0 z-50 flex lg:hidden ${
          mobileDrawerOpen ? 'pointer-events-auto' : 'pointer-events-none'
        }`}
      >
        <div
          onClick={() => setMobileDrawerOpen(false)}
          className={`fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-300 ease-out ${
            mobileDrawerOpen ? 'opacity-100' : 'opacity-0'
          }`}
        />
        <aside
          className={`relative z-10 h-full w-72 max-w-[85vw] border-r border-[#27272a] bg-[#0c0c0f] shadow-2xl transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform ${
            mobileDrawerOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          {sidebarContent}
        </aside>
      </div>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Sticky Top Header */}
        <header className="shrink-0 border-b border-[#27272a] bg-[#09090b]/95 px-4 py-3 backdrop-blur-md sm:px-6">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileDrawerOpen(true)}
              aria-label="Buka menu kategori"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#27272a] bg-[#121216] text-zinc-300 hover:border-[#10b981]/50 hover:text-white lg:hidden"
            >
              <Menu className="h-4 w-4" />
            </button>

            {/* Live Search Input */}
            <div className="relative min-w-[180px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari judul, konten, atau #tag... (tekan /)"
                className="h-9 w-full rounded-lg border border-[#27272a] bg-[#121216] pl-9 pr-9 text-xs sm:text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-[#10b981] focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Bersihkan pencarian"
                  className="absolute right-2.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-zinc-400 hover:text-zinc-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => openCreateModal()}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-[#10b981] px-3 text-xs font-semibold text-zinc-950 transition-colors hover:bg-[#34d399]"
            >
              <Plus className="h-4 w-4 stroke-[2.5]" />
              <span className="hidden sm:inline">Tambah Arsip</span>
              <span className="sm:hidden">Baru</span>
            </button>
          </div>
        </header>

        {/* Scrollable Workspace Viewport */}
        <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          <div className="mx-auto max-w-6xl space-y-5">
            {/* Google Drive Connect Banner when viewing categories that don't embed DriveFilesPanel */}
            {!isDriveConnected &&
              activeCategory !== 'all' &&
              activeCategory !== 'drive' &&
              activeCategory !== 'doc' &&
              activeCategory !== 'media' && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#27272a] bg-[#121216] px-4 py-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                      <HardDrive className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-zinc-100">
                        Google Drive Privat (Folder{' '}
                        <span className="font-mono text-emerald-400">sainbyte-vault</span>)
                      </p>
                      <p className="text-[11px] text-zinc-400">
                        Hubungkan Google Drive di sesi ini untuk mengunggah, menampilkan foto, dan mengunduh dokumen privat.
                      </p>
                    </div>
                  </div>
                  <GoogleSignInButton
                    label={connectingDrive ? 'Menghubungkan...' : 'Hubungkan Google Drive'}
                    disabled={connectingDrive}
                    onClick={() => void handleConnectDrive()}
                    className="h-9 shrink-0 px-3 text-xs"
                  />
                </div>
              )}

            {/* Section Title Bar with smooth fade transition on category switch */}
            <div
              key={`header-${activeCategory}`}
              className="animate-fade-in-up flex flex-wrap items-end justify-between gap-2 border-b border-[#27272a] pb-3.5"
            >
              <div>
                <div className="flex items-center gap-2">
                  <activeCategoryMeta.Icon className="h-4 w-4 text-[#10b981]" />
                  <h1 className="text-base sm:text-lg font-semibold tracking-tight text-zinc-50">
                    {activeCategoryMeta.label}
                  </h1>
                  <span className="rounded-md border border-[#27272a] bg-[#121216] px-2 py-0.5 font-mono text-[11px] text-emerald-400 tabular-nums">
                    {activeCategory === 'drive'
                      ? `${driveFiles.length} file`
                      : `${filteredItems.length} item`}
                  </span>
                </div>
                <p className="mt-1 text-xs text-zinc-400">
                  {activeCategoryMeta.description}
                </p>
              </div>
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="font-mono text-[11px] text-emerald-400 underline hover:text-emerald-300"
                >
                  Reset filter: &quot;{searchQuery}&quot;
                </button>
              )}
            </div>

            {/* Authorized Google Drive Folder Files List */}
            {(activeCategory === 'drive' ||
              activeCategory === 'all' ||
              activeCategory === 'doc' ||
              activeCategory === 'media') && (
              <DriveFilesPanel
                files={driveFiles}
                loading={loadingDriveFiles}
                error={driveFilesError}
                isDriveConnected={isDriveConnected}
                connectingDrive={connectingDrive}
                downloadingFileId={downloadingItemId}
                searchQuery={searchQuery}
                forceExpanded={activeCategory === 'drive'}
                onConnectDrive={() => void handleConnectDrive()}
                onRefresh={() => void fetchDriveFiles()}
                onDownload={(file) => void handleDownloadDriveFolderFile(file)}
                onDelete={(file) => setDeleteTarget({ kind: 'driveFile', file })}
                onUploadNew={() =>
                  openCreateModal(activeCategory === 'media' ? 'media' : 'doc')
                }
              />
            )}

            {activeCategory !== 'drive' && (
              <>
                {/* Data Error Banner + 1-click firestore.rules copy helper for custom project */}
                {dataError && (
                  <div className="space-y-3 rounded-xl border border-rose-500/40 bg-rose-950/30 p-4 text-xs text-rose-200">
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                      <p className="leading-relaxed">{dataError}</p>
                    </div>
                    {diagnostics.isCustomProject && (
                      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-rose-500/25 pt-2.5">
                        <span className="font-mono text-[11px] text-rose-200/80">
                          Proyek aktif: <strong>{diagnostics.projectId}</strong> → Salin rules terbaru lalu Publish di Firebase Console.
                        </span>
                        <button
                          type="button"
                          onClick={() => void handleCopyFirestoreRules()}
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-rose-400/40 bg-rose-900/40 px-3 font-mono text-[11px] font-medium text-rose-100 hover:bg-rose-900/70"
                        >
                          {copiedRules ? (
                            <Check className="h-3.5 w-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                          <span>{copiedRules ? 'firestore.rules Disalin' : 'Salin firestore.rules'}</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Loading Skeletons */}
                {loadingData ? (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {[1, 2, 3, 4, 5, 6].map((idx) => (
                      <div
                        key={idx}
                        className="h-44 animate-pulse rounded-xl border border-[#27272a] bg-[#121216] p-4"
                      >
                        <div className="h-4 w-20 rounded bg-zinc-800" />
                        <div className="mt-3 h-5 w-3/4 rounded bg-zinc-800" />
                        <div className="mt-4 h-16 w-full rounded bg-[#09090b]" />
                      </div>
                    ))}
                  </div>
                ) : filteredItems.length === 0 ? (
                  /* Empty State */
                  <div className="animate-fade-in-up flex flex-col items-center justify-center rounded-xl border border-dashed border-[#27272a] bg-[#121216]/60 px-6 py-14 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[#27272a] bg-[#09090b] text-[#10b981]">
                      <activeCategoryMeta.Icon className="h-5 w-5" />
                    </div>
                    <h2 className="mt-3.5 text-sm font-semibold text-zinc-100">
                      {searchQuery
                        ? 'Tidak ada arsip yang cocok'
                        : `Belum ada item di ${activeCategoryMeta.label}`}
                    </h2>
                    <p className="mt-1 max-w-sm text-xs leading-relaxed text-zinc-400">
                      {searchQuery
                        ? 'Coba kata kunci judul, konten, atau #tag lain, atau bersihkan filter pencarian.'
                        : 'Simpan skrip kode, catatan penting, pengingat, kredensial rahasia, tautan, atau unggah foto & Excel ke Google Drive privat Anda.'}
                    </p>
                    <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
                      {searchQuery ? (
                        <button
                          type="button"
                          onClick={() => setSearchQuery('')}
                          className="h-9 rounded-lg border border-[#27272a] bg-[#09090b] px-4 text-xs font-medium text-zinc-200 hover:border-zinc-600"
                        >
                          Bersihkan Pencarian
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => openCreateModal()}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#10b981] px-4 text-xs font-semibold text-zinc-950 transition-colors hover:bg-[#34d399]"
                      >
                        <Plus className="h-4 w-4 stroke-[2.5]" />
                        <span>Tambah Arsip Pertama</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Cards Grid with smooth stagger transition on category switch */
                  <div
                    key={`grid-${activeCategory}`}
                    className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
                  >
                    {filteredItems.map((item, idx) => (
                      <div
                        key={item.id}
                        style={{ animationDelay: `${Math.min(idx, 10) * 32}ms` }}
                        className="animate-card-stagger"
                      >
                        <VaultCard
                          item={item}
                          copiedKey={copiedKey}
                          isRevealed={Boolean(revealedIds[item.id])}
                          togglingDone={Boolean(togglingDoneIds[item.id])}
                          isDriveConnected={isDriveConnected}
                          resolvedMediaUrl={
                            item.driveFileId ? driveBlobUrls[item.driveFileId] : undefined
                          }
                          loadingMedia={
                            item.driveFileId
                              ? Boolean(loadingDriveMediaIds[item.driveFileId])
                              : false
                          }
                          downloadingFile={downloadingItemId === item.id}
                          onConnectDrive={() => void handleConnectDrive()}
                          onCopy={(key, val, label) => void handleCopy(key, val, label)}
                          onToggleReveal={handleToggleReveal}
                          onToggleDone={(it) => void handleToggleDone(it)}
                          onPreviewDoc={(it) => void handleOpenDocPreview(it)}
                          onPreviewMedia={(it) => void handleOpenMediaLightbox(it)}
                          onDownloadFile={(it) => void handleDownloadFile(it)}
                          onSelectTag={(tag) => setSearchQuery(`#${tag}`)}
                          onEdit={openEditModal}
                          onDelete={(it) => setDeleteTarget({ kind: 'vault', item: it })}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </main>
      </div>

      {/* Add / Edit Vault Item Modal */}
      <Modal
        open={formOpen}
        onClose={savingForm ? () => {} : () => setFormOpen(false)}
        title={editingItem ? 'Edit Arsip Vault' : 'Tambah Arsip Vault'}
        maxWidth="max-w-xl"
      >
        <form onSubmit={(e) => void handleSaveForm(e)} className="space-y-4">
          {/* Type Selector */}
          <div>
            <label className="mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-zinc-400">
              Kategori Arsip
            </label>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              {VAULT_TYPES_ONLY.map((t) => {
                const selected = formType === t.id;
                const Icon = t.Icon;
                return (
                  <button
                    key={t.id}
                    type="button"
                    disabled={savingForm}
                    onClick={() => {
                      setFormType(t.id);
                      setFormError('');
                      setSelectedFile(null);
                      if (filePreviewUrl) {
                        URL.revokeObjectURL(filePreviewUrl);
                        setFilePreviewUrl(null);
                      }
                    }}
                    className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-left text-[11px] font-medium transition-colors ${
                      selected
                        ? 'border-[#10b981] bg-emerald-500/15 text-emerald-300'
                        : 'border-[#27272a] bg-[#09090b] text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{t.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="mb-1 block font-mono text-[11px] text-zinc-400">
              Judul Item
            </label>
            <input
              type="text"
              required
              maxLength={160}
              disabled={savingForm}
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              placeholder="Contoh: Rekap Keuangan Excel, Foto Aset, Skrip Deploy..."
              className="h-10 w-full rounded-lg border border-[#27272a] bg-[#09090b] px-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-[#10b981] focus:outline-none"
            />
          </div>

          {/* Tags */}
          <div>
            <label className="mb-1 block font-mono text-[11px] text-zinc-400">
              Tag Pencarian (pisahkan spasi/koma, maks 15)
            </label>
            <input
              type="text"
              disabled={savingForm}
              value={formTagsRaw}
              onChange={(e) => setFormTagsRaw(e.target.value)}
              placeholder="#excel, #foto, #penting"
              className="h-9 w-full rounded-lg border border-[#27272a] bg-[#09090b] px-3 font-mono text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-[#10b981] focus:outline-none"
            />
            {parseTagsInput(formTagsRaw).length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {parseTagsInput(formTagsRaw).map((tag) => (
                  <span
                    key={tag}
                    className="rounded bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] text-emerald-300"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Type-Specific Inputs */}
          {formType === 'code' && (
            <div>
              <label className="mb-1 block font-mono text-[11px] text-zinc-400">
                Blok Skrip / Perintah Terminal
              </label>
              <textarea
                rows={7}
                required
                disabled={savingForm}
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                placeholder="pkg update && pkg upgrade -y..."
                className="w-full rounded-lg border border-[#27272a] bg-[#09090b] p-3 font-mono text-xs leading-relaxed text-emerald-300 placeholder:text-zinc-600 focus:border-[#10b981] focus:outline-none"
              />
            </div>
          )}

          {formType === 'note' && (
            <div>
              <label className="mb-1 block font-mono text-[11px] text-zinc-400">
                Isi Catatan / Draft
              </label>
              <textarea
                rows={6}
                required
                disabled={savingForm}
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                placeholder="Tulis catatan atau ide Anda di sini..."
                className="w-full rounded-lg border border-[#27272a] bg-[#09090b] p-3 text-sm leading-relaxed text-zinc-100 placeholder:text-zinc-600 focus:border-[#10b981] focus:outline-none"
              />
            </div>
          )}

          {formType === 'reminder' && (
            <div className="space-y-3">
              <div>
                <label className="mb-1 block font-mono text-[11px] text-zinc-400">
                  Detail Tugas / Pengingat
                </label>
                <textarea
                  rows={4}
                  required
                  disabled={savingForm}
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
                  placeholder="Rincian tugas yang harus diselesaikan..."
                  className="w-full rounded-lg border border-[#27272a] bg-[#09090b] p-3 text-sm leading-relaxed text-zinc-100 placeholder:text-zinc-600 focus:border-[#10b981] focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block font-mono text-[11px] text-zinc-400">
                  Tenggat Waktu (Opsional)
                </label>
                <input
                  type="datetime-local"
                  disabled={savingForm}
                  value={formDueDate}
                  onChange={(e) => setFormDueDate(e.target.value)}
                  className="h-10 w-full rounded-lg border border-[#27272a] bg-[#09090b] px-3 font-mono text-xs text-zinc-100 focus:border-[#10b981] focus:outline-none"
                />
              </div>
            </div>
          )}

          {formType === 'vault' && (
            <div>
              <label className="mb-1 block font-mono text-[11px] text-zinc-400">
                Data Sensitif / Kunci / Kredensial (tersensor di kartu)
              </label>
              <textarea
                rows={4}
                required
                disabled={savingForm}
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                placeholder="SECRET_KEY=..., PIN, atau catatan rahasia..."
                className="w-full rounded-lg border border-[#27272a] bg-[#09090b] p-3 font-mono text-xs leading-relaxed text-amber-200 placeholder:text-zinc-600 focus:border-[#10b981] focus:outline-none"
              />
            </div>
          )}

          {formType === 'link' && (
            <div>
              <label className="mb-1 block font-mono text-[11px] text-zinc-400">
                URL Tautan / Bookmark
              </label>
              <input
                type="url"
                required
                disabled={savingForm}
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                placeholder="https://example.com/resource"
                className="h-10 w-full rounded-lg border border-[#27272a] bg-[#09090b] px-3 font-mono text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-[#10b981] focus:outline-none"
              />
            </div>
          )}

          {formType === 'contact' && (
            <div>
              <label className="mb-1 block font-mono text-[11px] text-zinc-400">
                Detail Kontak / Akun Layanan
              </label>
              <textarea
                rows={5}
                required
                disabled={savingForm}
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                placeholder="Nama, email, nomor HP, username, atau catatan akun..."
                className="w-full rounded-lg border border-[#27272a] bg-[#09090b] p-3 text-sm leading-relaxed text-zinc-100 placeholder:text-zinc-600 focus:border-[#10b981] focus:outline-none"
              />
            </div>
          )}

          {(formType === 'doc' || formType === 'media') && (
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="block font-mono text-[11px] text-zinc-400">
                  {formType === 'media'
                    ? 'Unggah Foto ke Google Drive (.jpg, .png, .webp, .gif, .svg — maks 50 MB)'
                    : 'Unggah Dokumen / Excel ke Google Drive (.xlsx, .csv, .pdf, .docx, .txt — maks 50 MB)'}
                </label>
                {!isDriveConnected && (
                  <button
                    type="button"
                    disabled={connectingDrive || savingForm}
                    onClick={() => void handleConnectDrive()}
                    className="font-mono text-[10px] text-emerald-400 underline hover:text-emerald-300"
                  >
                    {connectingDrive ? 'Menghubungkan...' : 'Hubungkan Drive dulu'}
                  </button>
                )}
              </div>

              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[#27272a] bg-[#09090b] px-4 py-5 text-center transition-colors hover:border-[#10b981]/60">
                <FileUp className="h-5 w-5 text-[#10b981]" />
                <div className="space-y-0.5">
                  <p className="text-xs font-medium text-zinc-200">
                    {selectedFile
                      ? `${selectedFile.name} (${formatBytes(selectedFile.size)})`
                      : editingItem?.driveFileId || editingItem?.downloadUrl
                        ? `File tersimpan: ${editingItem.content} (klik untuk ganti)`
                        : 'Pilih file dari perangkat'}
                  </p>
                  <p className="font-mono text-[10px] text-zinc-500">
                    Disimpan privat ke folder Google Drive: sainbyte-vault
                  </p>
                </div>
                <input
                  type="file"
                  disabled={savingForm}
                  accept={
                    formType === 'media'
                      ? 'image/jpeg,image/png,image/webp,image/gif,image/svg+xml'
                      : '.xlsx,.xls,.csv,.pdf,.txt,.json,.md,.doc,.docx,.pptx'
                  }
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>

              {formType === 'media' &&
                (filePreviewUrl ||
                  (editingItem?.driveFileId && driveBlobUrls[editingItem.driveFileId]) ||
                  editingItem?.downloadUrl) && (
                  <div className="overflow-hidden rounded-lg border border-[#27272a] bg-[#09090b]">
                    <img
                      src={
                        filePreviewUrl ||
                        (editingItem?.driveFileId
                          ? driveBlobUrls[editingItem.driveFileId]
                          : editingItem?.downloadUrl)
                      }
                      alt="Preview"
                      className="max-h-40 w-full object-contain"
                    />
                  </div>
                )}

              {uploadProgress !== null && (
                <div className="space-y-1.5 rounded-lg border border-[#27272a] bg-[#09090b] p-3">
                  <div className="flex items-center justify-between font-mono text-[11px] text-emerald-300">
                    <span className="inline-flex items-center gap-1.5">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Mengunggah ke Google Drive...</span>
                    </span>
                    <span className="tabular-nums">{uploadProgress}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                    <div
                      className="h-full bg-[#10b981] transition-all duration-150"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {formError && (
            <div className="rounded-lg border border-rose-500/40 bg-rose-950/30 p-2.5 text-xs leading-relaxed text-rose-300">
              {formError}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-[#27272a] pt-3">
            <button
              type="button"
              disabled={savingForm}
              onClick={() => setFormOpen(false)}
              className="h-9 rounded-lg border border-[#27272a] bg-[#09090b] px-4 text-xs font-medium text-zinc-300 hover:border-zinc-600 disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={savingForm}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#10b981] px-4 text-xs font-semibold text-zinc-950 transition-colors hover:bg-[#34d399] disabled:opacity-50"
            >
              {savingForm ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Menyimpan...</span>
                </>
              ) : (
                <span>{editingItem ? 'Simpan Perubahan' : 'Simpan ke Vault'}</span>
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* Document Preview Modal */}
      <Modal
        open={Boolean(docPreviewItem)}
        onClose={closeDocPreview}
        title={docPreviewItem?.title || 'Preview Dokumen'}
        maxWidth="max-w-4xl"
      >
        {docPreviewItem && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#27272a] bg-[#09090b] px-3 py-2">
              <span className="font-mono text-xs text-zinc-300 break-words">
                {docPreviewItem.content}
              </span>
              <div className="flex items-center gap-2">
                {docPreviewItem.driveViewUrl && (
                  <a
                    href={docPreviewItem.driveViewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-7 items-center gap-1 rounded-md border border-[#27272a] bg-[#121216] px-2.5 font-mono text-[11px] text-zinc-200 hover:border-[#10b981]/50"
                  >
                    <ExternalLink className="h-3 w-3" />
                    <span>Buka di Google Drive</span>
                  </a>
                )}
                {(docPreviewItem.driveFileId || docPreviewItem.downloadUrl) && (
                  <button
                    type="button"
                    disabled={downloadingItemId === docPreviewItem.id}
                    onClick={() => void handleDownloadFile(docPreviewItem)}
                    className="inline-flex h-7 items-center gap-1 rounded-md bg-[#10b981] px-2.5 font-mono text-[11px] font-semibold text-zinc-950 hover:bg-[#34d399] disabled:opacity-50"
                  >
                    <Download className="h-3 w-3" />
                    <span>Unduh</span>
                  </button>
                )}
              </div>
            </div>

            {loadingDocPreview ? (
              <div className="flex h-[55vh] flex-col items-center justify-center gap-2 rounded-xl border border-[#27272a] bg-[#09090b] text-xs text-zinc-400">
                <Loader2 className="h-5 w-5 animate-spin text-[#10b981]" />
                <span className="font-mono">Memuat dokumen privat dari Google Drive...</span>
              </div>
            ) : docPreviewError ? (
              <div className="rounded-xl border border-rose-500/40 bg-rose-950/25 p-6 text-center space-y-3">
                <p className="text-xs text-rose-200">{docPreviewError}</p>
                <div className="flex flex-wrap justify-center gap-2">
                  <GoogleSignInButton
                    label="Hubungkan Google Drive"
                    onClick={() => void handleOpenDocPreview(docPreviewItem)}
                    className="h-8 px-3 text-xs"
                  />
                </div>
              </div>
            ) : iframeSrc && canDirectIframe ? (
              <div className="overflow-hidden rounded-xl border border-[#27272a] bg-[#09090b]">
                <iframe
                  src={iframeSrc}
                  title={docPreviewItem.title}
                  className="h-[65vh] w-full bg-white"
                />
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-[#27272a] bg-[#09090b] p-8 text-center">
                <p className="text-xs text-zinc-300">
                  {isOffice
                    ? 'Berkas Excel / Office privat dapat dibuka langsung melalui Google Drive atau diunduh ke perangkat.'
                    : 'Format berkas ini tidak mendukung pratinjau langsung di browser.'}
                </p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  {docPreviewItem.driveViewUrl && (
                    <a
                      href={docPreviewItem.driveViewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#27272a] bg-[#121216] px-4 text-xs font-medium text-zinc-100 hover:border-[#10b981]/50"
                    >
                      <ExternalLink className="h-4 w-4" />
                      <span>Buka di Google Drive</span>
                    </a>
                  )}
                  {(docPreviewItem.driveFileId || docPreviewItem.downloadUrl) && (
                    <button
                      type="button"
                      onClick={() => void handleDownloadFile(docPreviewItem)}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#10b981] px-4 text-xs font-semibold text-zinc-950 hover:bg-[#34d399]"
                    >
                      <Download className="h-4 w-4" />
                      <span>Unduh Berkas</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Media Lightbox Modal */}
      {mediaLightboxItem && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={mediaLightboxItem.title}
          className="fixed inset-0 z-[60] flex flex-col bg-black/90 p-4 backdrop-blur-sm"
          onClick={() => setMediaLightboxItem(null)}
        >
          <div
            className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 pb-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-zinc-100">
                {mediaLightboxItem.title}
              </h2>
              <p className="truncate font-mono text-[11px] text-zinc-400">
                {mediaLightboxItem.content}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {mediaLightboxItem.driveViewUrl && (
                <a
                  href={mediaLightboxItem.driveViewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#27272a] bg-[#121216] px-3 font-mono text-xs text-zinc-200 hover:border-[#10b981]/50"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>Buka Drive</span>
                </a>
              )}
              {(mediaLightboxItem.driveFileId || mediaLightboxItem.downloadUrl) && (
                <button
                  type="button"
                  disabled={downloadingItemId === mediaLightboxItem.id}
                  onClick={() => void handleDownloadFile(mediaLightboxItem)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#10b981] px-3 font-mono text-xs font-semibold text-zinc-950 hover:bg-[#34d399]"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Unduh</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setMediaLightboxItem(null)}
                aria-label="Tutup lightbox"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#27272a] bg-[#121216] text-zinc-300 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div
            className="flex min-h-0 flex-1 items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            {lightboxImageUrl ? (
              <img
                src={lightboxImageUrl}
                alt={mediaLightboxItem.title}
                className="max-h-full max-w-full rounded-xl border border-[#27272a] object-contain shadow-2xl"
              />
            ) : (
              <div className="flex flex-col items-center gap-2 text-zinc-400">
                <Loader2 className="h-6 w-6 animate-spin text-[#10b981]" />
                <span className="font-mono text-xs">Memuat gambar privat dari Google Drive...</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        title={deleteTarget?.kind === 'driveFile' ? 'Hapus File Google Drive' : 'Hapus Item Vault'}
        message={
          deleteTarget?.kind === 'driveFile'
            ? 'Hapus file ini secara permanen dari folder Google Drive (sainbyte-vault)?'
            : deleteTarget?.item.driveFileId
              ? 'Hapus arsip ini beserta file privatnya di Google Drive (sainbyte-vault)?'
              : deleteTarget?.item.storagePath
                ? 'Hapus arsip ini beserta file di Firebase Storage?'
                : 'Hapus item arsip ini dari Vault?'
        }
        detail={
          deleteTarget?.kind === 'driveFile'
            ? deleteTarget.file.name
            : deleteTarget?.item.title
        }
        confirmLabel="Ya, Hapus Permanen"
        loading={deletingItem}
      />
    </div>
  );
}
