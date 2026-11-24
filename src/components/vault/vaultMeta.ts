import {
  BellRing,
  Contact,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  KeyRound,
  Layers,
  Link2,
  LucideIcon,
  Terminal,
} from 'lucide-react';
import { VaultItemType } from '../../types/models';

export type VaultCategoryFilter = 'all' | VaultItemType;

export interface VaultCategoryDef {
  id: VaultCategoryFilter;
  label: string;
  shortCode: string;
  description: string;
  Icon: LucideIcon;
}

export const VAULT_CATEGORIES: VaultCategoryDef[] = [
  {
    id: 'all',
    label: 'Semua Arsip',
    shortCode: 'ALL',
    description: 'Seluruh item arsip digital diurutkan dari yang terbaru.',
    Icon: Layers,
  },
  {
    id: 'code',
    label: 'Terminal & Kode',
    shortCode: 'CODE',
    description: 'Skrip Termux, perintah CLI, dan cuplikan kode siap salin.',
    Icon: Terminal,
  },
  {
    id: 'note',
    label: 'Catatan & Draft',
    shortCode: 'NOTE',
    description: 'Catatan harian, draft ide, dan dokumentasi teks cepat.',
    Icon: FileText,
  },
  {
    id: 'reminder',
    label: 'Pengingat',
    shortCode: 'TASK',
    description: 'Daftar tugas dengan tenggat waktu dan status centang interaktif.',
    Icon: BellRing,
  },
  {
    id: 'doc',
    label: 'Dokumen & Sheet',
    shortCode: 'DOCS',
    description: 'Berkas Excel, CSV, PDF, dan dokumen dari Firebase Storage.',
    Icon: FileSpreadsheet,
  },
  {
    id: 'vault',
    label: 'Brankas Identitas',
    shortCode: 'KEY',
    description: 'API key, kredensial, dan informasi sensitif tersensor bawaan.',
    Icon: KeyRound,
  },
  {
    id: 'media',
    label: 'Galeri & Aset',
    shortCode: 'MEDIA',
    description: 'Aset visual, tangkapan layar, dan gambar dengan pratinjau lightbox.',
    Icon: ImageIcon,
  },
  {
    id: 'link',
    label: 'Link & Bookmark',
    shortCode: 'LINK',
    description: 'Tautan referensi penting dengan akses cepat satu klik.',
    Icon: Link2,
  },
  {
    id: 'contact',
    label: 'Kontak & Akun',
    shortCode: 'ACCT',
    description: 'Detail kontak, akun layanan, dan informasi korespondensi.',
    Icon: Contact,
  },
];

export const VAULT_TYPES_ONLY = VAULT_CATEGORIES.filter(
  (c): c is VaultCategoryDef & { id: VaultItemType } => c.id !== 'all'
);

export function getVaultCategoryMeta(id: VaultCategoryFilter): VaultCategoryDef {
  return VAULT_CATEGORIES.find((c) => c.id === id) || VAULT_CATEGORIES[0];
}

export function parseTagsInput(raw: string): string[] {
  const tokens = raw
    .split(/[\s,]+/)
    .map((t) => t.trim().replace(/^#+/, '').toLowerCase())
    .filter(Boolean);
  return Array.from(new Set(tokens)).slice(0, 15).map((t) => t.slice(0, 40));
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** idx;
  return `${value >= 10 || idx === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[idx]}`;
}

export function formatVaultTimestamp(ms: number): string {
  if (!ms || !Number.isFinite(ms)) return '-';
  try {
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toLocaleDateString('id-ID');
  }
}

export function formatDueDateLabel(dueDate?: string): string {
  if (!dueDate) return '';
  const parsed = new Date(dueDate);
  if (Number.isNaN(parsed.getTime())) return dueDate;
  try {
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(parsed);
  } catch {
    return dueDate;
  }
}

export function getDueBadgeTone(
  dueDate?: string,
  done?: boolean
): 'done' | 'overdue' | 'soon' | 'normal' {
  if (done) return 'done';
  if (!dueDate) return 'normal';
  const dueMs = new Date(dueDate).getTime();
  if (Number.isNaN(dueMs)) return 'normal';
  const diff = dueMs - Date.now();
  if (diff < 0) return 'overdue';
  if (diff <= 24 * 60 * 60 * 1000) return 'soon';
  return 'normal';
}

export function isIframePreviewable(mimeType?: string, downloadUrl?: string, content?: string): boolean {
  const mime = (mimeType || '').toLowerCase();
  const hint = `${downloadUrl || ''} ${content || ''}`.toLowerCase();
  if (
    mime.includes('pdf') ||
    mime.startsWith('text/') ||
    mime.startsWith('image/') ||
    mime.includes('json')
  ) {
    return true;
  }
  return /\.(pdf|txt|csv|json|md|png|jpe?g|webp|gif|svg)(\?|$|\s|•)/i.test(hint);
}

export function isOfficeDocument(mimeType?: string, content?: string): boolean {
  const mime = (mimeType || '').toLowerCase();
  const hint = (content || '').toLowerCase();
  return (
    mime.includes('spreadsheet') ||
    mime.includes('excel') ||
    mime.includes('wordprocessingml') ||
    mime.includes('msword') ||
    /\.(xlsx?|docx?|pptx?)(\?|$|\s|•)/i.test(hint)
  );
}
