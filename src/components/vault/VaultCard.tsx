import {
  CalendarClock,
  Check,
  CloudOff,
  Copy,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileSpreadsheet,
  HardDrive,
  Loader2,
  Maximize2,
  Pencil,
  Trash2,
} from 'lucide-react';
import { VaultItem } from '../../types/models';
import { normalizeUrl } from '../../utils/format';
import {
  formatDueDateLabel,
  formatVaultTimestamp,
  getDueBadgeTone,
  getVaultCategoryMeta,
} from './vaultMeta';

interface VaultCardProps {
  item: VaultItem;
  copiedKey: string | null;
  isRevealed: boolean;
  togglingDone: boolean;
  isDriveConnected: boolean;
  resolvedMediaUrl?: string;
  loadingMedia?: boolean;
  downloadingFile?: boolean;
  onConnectDrive: () => void;
  onCopy: (key: string, value: string, label?: string) => void;
  onToggleReveal: (id: string) => void;
  onToggleDone: (item: VaultItem) => void;
  onPreviewDoc: (item: VaultItem) => void;
  onPreviewMedia: (item: VaultItem) => void;
  onDownloadFile: (item: VaultItem) => void;
  onSelectTag: (tag: string) => void;
  onEdit: (item: VaultItem) => void;
  onDelete: (item: VaultItem) => void;
}

export default function VaultCard({
  item,
  copiedKey,
  isRevealed,
  togglingDone,
  isDriveConnected,
  resolvedMediaUrl,
  loadingMedia = false,
  downloadingFile = false,
  onConnectDrive,
  onCopy,
  onToggleReveal,
  onToggleDone,
  onPreviewDoc,
  onPreviewMedia,
  onDownloadFile,
  onSelectTag,
  onEdit,
  onDelete,
}: VaultCardProps) {
  const meta = getVaultCategoryMeta(item.type);
  const TypeIcon = meta.Icon;
  const copyId = `item-${item.id}`;
  const isCopied = copiedKey === copyId;
  const dueTone = getDueBadgeTone(item.dueDate, item.done);
  const safeLinkUrl = item.type === 'link' ? normalizeUrl(item.content) : item.downloadUrl || '';
  const hasFileAttachment = Boolean(item.driveFileId || item.downloadUrl);
  const effectiveMediaUrl = item.driveFileId ? resolvedMediaUrl : item.downloadUrl;

  return (
    <article className="group flex flex-col justify-between rounded-xl border border-[#27272a] bg-[#121216] p-4 transition-colors duration-150 hover:border-[#10b981]/45">
      <div className="space-y-3">
        {/* Card Header */}
        <div className="flex items-start justify-between gap-2.5">
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-md border border-[#27272a] bg-[#09090b] px-2 py-0.5 font-mono text-[10px] font-medium tracking-wider text-emerald-400">
                <TypeIcon className="h-3 w-3" />
                <span>{meta.shortCode}</span>
              </span>

              {item.driveFileId && (
                <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] text-emerald-300">
                  <HardDrive className="h-2.5 w-2.5" />
                  <span>DRIVE</span>
                </span>
              )}

              {item.type === 'reminder' && item.dueDate && (
                <span
                  className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-[10px] tabular-nums ${
                    dueTone === 'done'
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                      : dueTone === 'overdue'
                        ? 'border-rose-500/40 bg-rose-500/10 text-rose-400'
                        : dueTone === 'soon'
                          ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                          : 'border-[#27272a] bg-[#09090b] text-zinc-400'
                  }`}
                >
                  <CalendarClock className="h-3 w-3 shrink-0" />
                  <span>{formatDueDateLabel(item.dueDate)}</span>
                </span>
              )}

              {(item.type === 'doc' || item.type === 'media') && item.mimeType && (
                <span className="max-w-[140px] truncate rounded-md border border-[#27272a] bg-[#09090b] px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                  {item.mimeType.split('/')[1]?.toUpperCase() || item.mimeType}
                </span>
              )}
            </div>

            {item.type === 'reminder' ? (
              <div className="flex items-start gap-2.5 pt-0.5">
                <button
                  type="button"
                  disabled={togglingDone}
                  onClick={() => onToggleDone(item)}
                  aria-label={item.done ? 'Tandai belum selesai' : 'Tandai selesai'}
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                    item.done
                      ? 'border-[#10b981] bg-[#10b981] text-zinc-950'
                      : 'border-zinc-600 bg-[#09090b] text-transparent hover:border-[#10b981]'
                  } disabled:opacity-50`}
                >
                  <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                </button>
                <h3
                  className={`text-sm font-semibold leading-snug break-words ${
                    item.done ? 'text-zinc-500 line-through' : 'text-zinc-100'
                  }`}
                >
                  {item.title}
                </h3>
              </div>
            ) : (
              <h3 className="text-sm font-semibold leading-snug text-zinc-100 break-words">
                {item.title}
              </h3>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => onEdit(item)}
              aria-label={`Edit ${item.title}`}
              title="Edit arsip"
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-transparent text-zinc-400 transition-colors hover:border-[#27272a] hover:bg-[#09090b] hover:text-zinc-100"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(item)}
              aria-label={`Hapus ${item.title}`}
              title="Hapus arsip"
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-transparent text-zinc-400 transition-colors hover:border-rose-500/30 hover:bg-rose-500/10 hover:text-rose-400"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Type-Specific Card Body */}
        {item.type === 'code' && (
          <div className="relative rounded-lg border border-[#27272a] bg-[#09090b] p-3">
            <button
              type="button"
              onClick={() => onCopy(copyId, item.content, 'Skrip kode disalin')}
              className={`absolute right-2 top-2 inline-flex items-center gap-1 rounded-md border px-2 py-1 font-mono text-[10px] font-medium transition-colors ${
                isCopied
                  ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
                  : 'border-[#27272a] bg-[#121216] text-zinc-300 hover:border-[#10b981]/60 hover:text-emerald-300'
              }`}
            >
              {isCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              <span>{isCopied ? 'Tersalin' : 'Copy'}</span>
            </button>
            <pre className="max-h-44 overflow-auto pr-16 font-mono text-xs leading-relaxed text-emerald-300/95 whitespace-pre-wrap break-words">
              <code>{item.content || '(Kosong)'}</code>
            </pre>
          </div>
        )}

        {item.type === 'note' && (
          <div className="space-y-2">
            <p className="max-h-44 overflow-y-auto whitespace-pre-line break-words text-xs sm:text-[13px] leading-relaxed text-zinc-300">
              {item.content || '(Catatan kosong)'}
            </p>
            {item.content && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => onCopy(copyId, item.content, 'Catatan disalin')}
                  className="inline-flex items-center gap-1 rounded-md border border-[#27272a] bg-[#09090b] px-2 py-1 font-mono text-[10px] text-zinc-400 transition-colors hover:border-[#10b981]/50 hover:text-emerald-300"
                >
                  {isCopied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                  <span>{isCopied ? 'Tersalin' : 'Salin'}</span>
                </button>
              </div>
            )}
          </div>
        )}

        {item.type === 'reminder' && item.content && (
          <p
            className={`pl-7 whitespace-pre-line break-words text-xs sm:text-[13px] leading-relaxed ${
              item.done ? 'text-zinc-500 line-through' : 'text-zinc-300'
            }`}
          >
            {item.content}
          </p>
        )}

        {item.type === 'vault' && (
          <div className="space-y-2">
            <div className="rounded-lg border border-[#27272a] bg-[#09090b] px-3 py-2.5 font-mono text-xs text-zinc-200 break-all">
              {isRevealed ? (
                <span className="whitespace-pre-wrap text-emerald-300">{item.content || '(Kosong)'}</span>
              ) : (
                <span className="tracking-[0.2em] text-zinc-500 select-none">••••••••••••</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onToggleReveal(item.id)}
                className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-[#27272a] bg-[#09090b] px-2.5 font-mono text-[11px] text-zinc-300 transition-colors hover:border-[#10b981]/50 hover:text-emerald-300"
              >
                {isRevealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                <span>{isRevealed ? 'Tutup' : 'Lihat'}</span>
              </button>
              <button
                type="button"
                onClick={() => onCopy(copyId, item.content, 'Data rahasia disalin')}
                className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-[#27272a] bg-[#09090b] px-2.5 font-mono text-[11px] text-zinc-300 transition-colors hover:border-[#10b981]/50 hover:text-emerald-300"
              >
                {isCopied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{isCopied ? 'Tersalin' : 'Copy'}</span>
              </button>
            </div>
          </div>
        )}

        {item.type === 'doc' && (
          <div className="space-y-2.5">
            <div className="flex items-center gap-2.5 rounded-lg border border-[#27272a] bg-[#09090b] p-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-400">
                <FileSpreadsheet className="h-4 w-4" />
              </div>
              <p className="min-w-0 flex-1 font-mono text-xs text-zinc-300 break-words">
                {item.content || item.fileName || 'Dokumen terlampir'}
              </p>
            </div>
            {hasFileAttachment && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => onPreviewDoc(item)}
                  className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-2.5 font-mono text-[11px] font-medium text-emerald-300 transition-colors hover:bg-emerald-500/20"
                >
                  <Eye className="h-3.5 w-3.5" />
                  <span>Preview</span>
                </button>
                <button
                  type="button"
                  disabled={downloadingFile}
                  onClick={() => onDownloadFile(item)}
                  className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-[#27272a] bg-[#09090b] px-2.5 font-mono text-[11px] text-zinc-300 transition-colors hover:border-[#10b981]/50 hover:text-emerald-300 disabled:opacity-50"
                >
                  {downloadingFile ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  <span>Unduh</span>
                </button>
                {item.driveViewUrl && (
                  <a
                    href={item.driveViewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-7 items-center gap-1 rounded-lg border border-[#27272a] bg-[#09090b] px-2.5 font-mono text-[11px] text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-200"
                  >
                    <ExternalLink className="h-3 w-3" />
                    <span>Drive</span>
                  </a>
                )}
              </div>
            )}
          </div>
        )}

        {item.type === 'media' && (
          <div className="space-y-2.5">
            {item.driveFileId && !isDriveConnected && !effectiveMediaUrl ? (
              <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[#27272a] bg-[#09090b] px-3 text-center">
                <CloudOff className="h-5 w-5 text-zinc-500" />
                <p className="font-mono text-[11px] text-zinc-400">
                  Foto privat di Google Drive
                </p>
                <button
                  type="button"
                  onClick={onConnectDrive}
                  className="inline-flex h-7 items-center gap-1.5 rounded-md border border-emerald-500/35 bg-emerald-500/10 px-2.5 font-mono text-[11px] font-medium text-emerald-300 hover:bg-emerald-500/20"
                >
                  <HardDrive className="h-3 w-3" />
                  <span>Hubungkan Drive</span>
                </button>
              </div>
            ) : loadingMedia && !effectiveMediaUrl ? (
              <div className="flex h-40 items-center justify-center rounded-lg border border-[#27272a] bg-[#09090b]">
                <Loader2 className="h-5 w-5 animate-spin text-[#10b981]" />
              </div>
            ) : effectiveMediaUrl ? (
              <button
                type="button"
                onClick={() => onPreviewMedia(item)}
                className="group/img relative block w-full overflow-hidden rounded-lg border border-[#27272a] bg-[#09090b]"
              >
                <img
                  src={effectiveMediaUrl}
                  alt={item.title}
                  loading="lazy"
                  className="h-40 w-full object-cover transition-transform duration-200 group-hover/img:scale-[1.02]"
                />
                <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-md border border-[#27272a] bg-[#09090b]/85 px-2 py-1 font-mono text-[10px] text-zinc-200 backdrop-blur-sm">
                  <Maximize2 className="h-3 w-3 text-emerald-400" />
                  <span>Lightbox</span>
                </span>
              </button>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="truncate font-mono text-[11px] text-zinc-400">
                {item.content || item.fileName || 'Berkas gambar'}
              </span>
              {hasFileAttachment && (
                <div className="flex items-center gap-1.5">
                  {item.driveViewUrl ? (
                    <a
                      href={item.driveViewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-7 items-center gap-1 rounded-lg border border-[#27272a] bg-[#09090b] px-2 font-mono text-[10px] text-zinc-300 transition-colors hover:border-[#10b981]/50 hover:text-emerald-300"
                    >
                      <ExternalLink className="h-3 w-3" />
                      <span>Drive</span>
                    </a>
                  ) : item.downloadUrl ? (
                    <button
                      type="button"
                      onClick={() => onCopy(copyId, item.downloadUrl!, 'URL media disalin')}
                      className="inline-flex h-7 items-center gap-1 rounded-lg border border-[#27272a] bg-[#09090b] px-2 font-mono text-[10px] text-zinc-300 transition-colors hover:border-[#10b981]/50 hover:text-emerald-300"
                    >
                      {isCopied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                      <span>{isCopied ? 'Tersalin' : 'URL'}</span>
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={downloadingFile}
                    onClick={() => onDownloadFile(item)}
                    className="inline-flex h-7 items-center gap-1 rounded-lg border border-[#27272a] bg-[#09090b] px-2 font-mono text-[10px] text-zinc-300 transition-colors hover:border-[#10b981]/50 hover:text-emerald-300 disabled:opacity-50"
                  >
                    {downloadingFile ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Download className="h-3 w-3" />
                    )}
                    <span>Unduh</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {item.type === 'link' && (
          <div className="space-y-2">
            <div className="rounded-lg border border-[#27272a] bg-[#09090b] px-3 py-2 font-mono text-xs text-zinc-400 truncate">
              {item.content}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {safeLinkUrl && (
                <a
                  href={safeLinkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-2.5 font-mono text-[11px] font-medium text-emerald-300 transition-colors hover:bg-emerald-500/20"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>Buka Tab Baru</span>
                </a>
              )}
              <button
                type="button"
                onClick={() => onCopy(copyId, safeLinkUrl || item.content, 'URL disalin')}
                className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-[#27272a] bg-[#09090b] px-2.5 font-mono text-[11px] text-zinc-300 transition-colors hover:border-[#10b981]/50 hover:text-emerald-300"
              >
                {isCopied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{isCopied ? 'Tersalin' : 'Copy URL'}</span>
              </button>
            </div>
          </div>
        )}

        {item.type === 'contact' && (
          <div className="space-y-2">
            <div className="max-h-40 overflow-y-auto rounded-lg border border-[#27272a] bg-[#09090b] px-3 py-2.5 whitespace-pre-line break-words text-xs leading-relaxed text-zinc-300">
              {item.content || '(Detail kontak kosong)'}
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => onCopy(copyId, item.content, 'Kontak/akun disalin')}
                className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-[#27272a] bg-[#09090b] px-2.5 font-mono text-[11px] text-zinc-300 transition-colors hover:border-[#10b981]/50 hover:text-emerald-300"
              >
                {isCopied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{isCopied ? 'Tersalin' : 'Copy'}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Card Footer: Tags + Timestamp */}
      <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-[#27272a]/80 pt-2.5">
        <div className="flex flex-wrap items-center gap-1">
          {item.tags.length > 0 ? (
            item.tags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => onSelectTag(tag)}
                className="rounded-md bg-[#09090b] px-1.5 py-0.5 font-mono text-[10px] text-zinc-400 transition-colors hover:text-emerald-300"
              >
                #{tag}
              </button>
            ))
          ) : (
            <span className="font-mono text-[10px] text-zinc-600">#untagged</span>
          )}
        </div>
        <span className="font-mono text-[10px] text-zinc-500 tabular-nums">
          {formatVaultTimestamp(item.createdAt)}
        </span>
      </div>
    </article>
  );
}
