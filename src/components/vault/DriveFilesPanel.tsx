import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  Download,
  ExternalLink,
  File,
  FileCode2,
  FileSpreadsheet,
  FileText,
  FileUp,
  Film,
  FolderOpen,
  HardDrive,
  Image as ImageIcon,
  Loader2,
  Music,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { DriveFolderFile, formatDriveMimeLabel } from '../../services/googleDrive';
import GoogleSignInButton from '../GoogleSignInButton';
import { formatBytes } from './vaultMeta';

interface DriveFilesPanelProps {
  files: DriveFolderFile[];
  loading: boolean;
  error: string;
  isDriveConnected: boolean;
  connectingDrive: boolean;
  downloadingFileId: string | null;
  searchQuery: string;
  forceExpanded?: boolean;
  onConnectDrive: () => void;
  onRefresh: () => void;
  onDownload: (file: DriveFolderFile) => void;
  onDelete: (file: DriveFolderFile) => void;
  onUploadNew: () => void;
}

function formatDriveDate(iso?: string): string {
  if (!iso) return '-';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '-';
  try {
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(parsed);
  } catch {
    return parsed.toLocaleDateString('id-ID');
  }
}

function getFileVisualMeta(mimeType: string, fileName: string) {
  const mime = mimeType.toLowerCase();
  const lowerName = fileName.toLowerCase();

  if (mime === 'application/vnd.google-apps.folder') {
    return {
      Icon: FolderOpen,
      toneClass: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
      badgeClass: 'border-amber-500/25 bg-amber-500/10 text-amber-300',
    };
  }
  if (mime.startsWith('image/')) {
    return {
      Icon: ImageIcon,
      toneClass: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
      badgeClass: 'border-sky-500/25 bg-sky-500/10 text-sky-300',
    };
  }
  if (
    mime.includes('spreadsheet') ||
    mime.includes('excel') ||
    mime === 'text/csv' ||
    lowerName.endsWith('.xlsx') ||
    lowerName.endsWith('.xls') ||
    lowerName.endsWith('.csv')
  ) {
    return {
      Icon: FileSpreadsheet,
      toneClass: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
      badgeClass: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300',
    };
  }
  if (mime.includes('json') || lowerName.endsWith('.json') || lowerName.endsWith('.md')) {
    return {
      Icon: FileCode2,
      toneClass: 'border-violet-500/30 bg-violet-500/10 text-violet-300',
      badgeClass: 'border-violet-500/25 bg-violet-500/10 text-violet-300',
    };
  }
  if (
    mime === 'application/pdf' ||
    mime.includes('wordprocessingml') ||
    mime.includes('msword') ||
    mime.startsWith('text/') ||
    lowerName.endsWith('.pdf') ||
    lowerName.endsWith('.docx') ||
    lowerName.endsWith('.doc')
  ) {
    return {
      Icon: FileText,
      toneClass: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
      badgeClass: 'border-rose-500/25 bg-rose-500/10 text-rose-300',
    };
  }
  if (mime.startsWith('video/')) {
    return {
      Icon: Film,
      toneClass: 'border-indigo-500/30 bg-indigo-500/10 text-indigo-300',
      badgeClass: 'border-indigo-500/25 bg-indigo-500/10 text-indigo-300',
    };
  }
  if (mime.startsWith('audio/')) {
    return {
      Icon: Music,
      toneClass: 'border-teal-500/30 bg-teal-500/10 text-teal-300',
      badgeClass: 'border-teal-500/25 bg-teal-500/10 text-teal-300',
    };
  }
  return {
    Icon: File,
    toneClass: 'border-zinc-700 bg-zinc-800/70 text-zinc-300',
    badgeClass: 'border-[#27272a] bg-[#09090b] text-zinc-300',
  };
}

export default function DriveFilesPanel({
  files,
  loading,
  error,
  isDriveConnected,
  connectingDrive,
  downloadingFileId,
  searchQuery,
  forceExpanded = false,
  onConnectDrive,
  onRefresh,
  onDownload,
  onDelete,
  onUploadNew,
}: DriveFilesPanelProps) {
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    if (forceExpanded) {
      setExpanded(true);
    }
  }, [forceExpanded]);

  const filteredFiles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return files;
    return files.filter((file) => {
      const typeLabel = formatDriveMimeLabel(file.mimeType, file.name).toLowerCase();
      return (
        file.name.toLowerCase().includes(q) ||
        file.mimeType.toLowerCase().includes(q) ||
        typeLabel.includes(q)
      );
    });
  }, [files, searchQuery]);

  const isOpen = forceExpanded || expanded;

  return (
    <section
      aria-label="Daftar file folder Google Drive sainbyte-vault"
      className="overflow-hidden rounded-xl border border-[#27272a] bg-[#121216] transition-colors"
    >
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 px-4 py-3">
        <button
          type="button"
          onClick={() => {
            if (!forceExpanded) {
              setExpanded((prev) => !prev);
            }
          }}
          aria-expanded={isOpen}
          className={`flex min-w-0 flex-1 items-center gap-2.5 text-left ${
            forceExpanded ? 'cursor-default' : 'cursor-pointer group'
          }`}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-[#10b981]">
            <HardDrive className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xs sm:text-sm font-semibold text-zinc-100">
                File Google Drive
              </h2>
              <span className="rounded-md border border-[#27272a] bg-[#09090b] px-1.5 py-0.5 font-mono text-[10px] text-emerald-400">
                sainbyte-vault
              </span>
              {isDriveConnected && (
                <span className="rounded-md border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] text-emerald-300 tabular-nums">
                  {filteredFiles.length}
                  {searchQuery.trim() && filteredFiles.length !== files.length
                    ? ` / ${files.length}`
                    : ''}{' '}
                  file
                </span>
              )}
            </div>
            <p className="mt-0.5 truncate text-[11px] text-zinc-400">
              {isDriveConnected
                ? 'Menampilkan nama, tipe berkas, ukuran, dan aksi langsung dari folder privat Anda.'
                : 'Otorisasi folder sainbyte-vault diperlukan untuk membaca daftar file Google Drive.'}
            </p>
          </div>
        </button>

        <div className="flex shrink-0 items-center gap-1.5">
          {isDriveConnected && (
            <>
              <button
                type="button"
                onClick={onUploadNew}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-2.5 font-mono text-[11px] font-medium text-emerald-300 transition-colors hover:bg-emerald-500/20 active:scale-[0.97]"
              >
                <FileUp className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Unggah</span>
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={onRefresh}
                title="Muat ulang daftar file Google Drive"
                aria-label="Muat ulang daftar file Google Drive"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#27272a] bg-[#09090b] px-2.5 font-mono text-[11px] text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white active:scale-[0.97] disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-[#10b981]' : ''}`} />
                <span className="hidden sm:inline">Muat Ulang</span>
              </button>
            </>
          )}
          {!forceExpanded && (
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              aria-label={isOpen ? 'Ciutkan daftar file Drive' : 'Buka daftar file Drive'}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#27272a] bg-[#09090b] text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-100"
            >
              <ChevronDown
                className={`h-4 w-4 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                  isOpen ? 'rotate-180' : 'rotate-0'
                }`}
              />
            </button>
          )}
        </div>
      </div>

      {/* Smooth Accordion Body */}
      <div
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">
          <div className="border-t border-[#27272a] px-4 py-3.5">
            {!isDriveConnected ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-[#27272a] bg-[#09090b] px-4 py-4">
                <div className="min-w-0 space-y-0.5">
                  <p className="text-xs font-medium text-zinc-200">
                    Google Drive belum terhubung di sesi ini
                  </p>
                  <p className="text-[11px] text-zinc-400">
                    Klik tombol di samping untuk menampilkan foto, Excel, PDF, dan file lain dari folder{' '}
                    <span className="font-mono text-emerald-400">sainbyte-vault</span>.
                  </p>
                </div>
                <GoogleSignInButton
                  label={connectingDrive ? 'Menghubungkan...' : 'Hubungkan Google Drive'}
                  disabled={connectingDrive}
                  onClick={onConnectDrive}
                  className="h-9 shrink-0 px-3 text-xs"
                />
              </div>
            ) : error ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-500/35 bg-rose-950/25 px-3.5 py-3 text-xs text-rose-200">
                <div className="flex min-w-0 items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                  <p className="leading-relaxed">{error}</p>
                </div>
                <button
                  type="button"
                  onClick={onRefresh}
                  className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-rose-400/40 bg-rose-900/40 px-3 font-mono text-[11px] font-medium text-rose-100 hover:bg-rose-900/70"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Coba Lagi</span>
                </button>
              </div>
            ) : loading && files.length === 0 ? (
              <div className="space-y-2">
                {[1, 2, 3].map((row) => (
                  <div
                    key={row}
                    className="flex h-14 animate-pulse items-center justify-between rounded-lg border border-[#27272a] bg-[#09090b] px-3.5"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-zinc-800" />
                      <div className="space-y-1.5">
                        <div className="h-3.5 w-44 rounded bg-zinc-800" />
                        <div className="h-2.5 w-28 rounded bg-zinc-800/70" />
                      </div>
                    </div>
                    <div className="h-6 w-16 rounded bg-zinc-800" />
                  </div>
                ))}
              </div>
            ) : filteredFiles.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-[#27272a] bg-[#09090b] px-4 py-7 text-center">
                <FolderOpen className="h-6 w-6 text-zinc-500" />
                <p className="mt-2 text-xs font-medium text-zinc-200">
                  {searchQuery.trim()
                    ? 'Tidak ada file Google Drive yang cocok dengan pencarian'
                    : 'Folder sainbyte-vault masih kosong'}
                </p>
                <p className="mt-0.5 text-[11px] text-zinc-400">
                  {searchQuery.trim()
                    ? `Kata kunci "${searchQuery}" tidak ditemukan pada nama maupun tipe berkas Drive.`
                    : 'Unggah foto, file Excel, PDF, atau dokumen ke Vault untuk menyimpannya di folder ini.'}
                </p>
                {!searchQuery.trim() && (
                  <button
                    type="button"
                    onClick={onUploadNew}
                    className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#10b981] px-3 text-xs font-semibold text-zinc-950 transition-colors hover:bg-[#34d399]"
                  >
                    <FileUp className="h-3.5 w-3.5" />
                    <span>Unggah File ke Drive</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-[#27272a] bg-[#09090b]">
                {/* Desktop Column Header */}
                <div className="hidden grid-cols-[minmax(0,1fr)_140px_90px_140px_112px] items-center gap-3 border-b border-[#27272a] bg-[#121216]/70 px-3.5 py-2 font-mono text-[10px] uppercase tracking-wider text-zinc-500 md:grid">
                  <span>Nama Berkas</span>
                  <span>Tipe / MIME</span>
                  <span>Ukuran</span>
                  <span>Diperbarui</span>
                  <span className="text-right">Aksi</span>
                </div>

                <ul className="divide-y divide-[#27272a]">
                  {filteredFiles.map((file, idx) => {
                    const { Icon, toneClass, badgeClass } = getFileVisualMeta(
                      file.mimeType,
                      file.name
                    );
                    const typeLabel = formatDriveMimeLabel(file.mimeType, file.name);
                    const isDownloading = downloadingFileId === file.id;

                    return (
                      <li
                        key={file.id}
                        style={{ animationDelay: `${Math.min(idx, 12) * 28}ms` }}
                        className="animate-card-stagger grid grid-cols-1 items-center gap-2.5 px-3.5 py-2.5 transition-colors hover:bg-[#121216]/75 md:grid-cols-[minmax(0,1fr)_140px_90px_140px_112px] md:gap-3"
                      >
                        {/* File Icon + Name + Mobile Metadata */}
                        <div className="flex min-w-0 items-center gap-2.5">
                          <div
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${toneClass}`}
                          >
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p
                              title={file.name}
                              className="truncate text-xs font-medium text-zinc-100"
                            >
                              {file.name}
                            </p>
                            <p
                              title={file.mimeType}
                              className="truncate font-mono text-[10px] text-zinc-500"
                            >
                              {file.mimeType}
                            </p>
                          </div>
                        </div>

                        {/* File Type Badge */}
                        <div className="flex items-center justify-between gap-2 md:block">
                          <span
                            className={`inline-flex max-w-full items-center truncate rounded-md border px-2 py-0.5 font-mono text-[10px] font-medium ${badgeClass}`}
                          >
                            {typeLabel}
                          </span>
                          <span className="font-mono text-[10px] text-zinc-400 tabular-nums md:hidden">
                            {file.size > 0 ? formatBytes(file.size) : '-'} •{' '}
                            {formatDriveDate(file.modifiedTime)}
                          </span>
                        </div>

                        {/* Desktop Size */}
                        <div className="hidden font-mono text-[11px] text-zinc-300 tabular-nums md:block">
                          {file.size > 0 ? formatBytes(file.size) : '-'}
                        </div>

                        {/* Desktop Modified Time */}
                        <div className="hidden truncate font-mono text-[11px] text-zinc-400 md:block">
                          {formatDriveDate(file.modifiedTime)}
                        </div>

                        {/* Row Actions */}
                        <div className="flex items-center justify-end gap-1">
                          {file.webViewLink && (
                            <a
                              href={file.webViewLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Buka di Google Drive"
                              aria-label={`Buka ${file.name} di Google Drive`}
                              className="flex h-7 w-7 items-center justify-center rounded-md border border-[#27272a] bg-[#121216] text-zinc-300 transition-colors hover:border-[#10b981]/50 hover:text-emerald-300"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                          <button
                            type="button"
                            disabled={isDownloading}
                            onClick={() => onDownload(file)}
                            title="Unduh file"
                            aria-label={`Unduh ${file.name}`}
                            className="flex h-7 w-7 items-center justify-center rounded-md border border-[#27272a] bg-[#121216] text-zinc-300 transition-colors hover:border-[#10b981]/50 hover:text-emerald-300 disabled:opacity-50"
                          >
                            {isDownloading ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-[#10b981]" />
                            ) : (
                              <Download className="h-3.5 w-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => onDelete(file)}
                            title="Hapus file dari Google Drive"
                            aria-label={`Hapus ${file.name} dari Google Drive`}
                            className="flex h-7 w-7 items-center justify-center rounded-md border border-[#27272a] bg-[#121216] text-zinc-400 transition-colors hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-300"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
