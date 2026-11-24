import { DragEvent } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Check,
  Copy,
  Eye,
  EyeOff,
  GripVertical,
  Pencil,
  Star,
  Trash2,
} from 'lucide-react';
import { ProjectItem } from '../types/models';
import { normalizeUrl } from '../utils/format';
import { RippleLayer, useTactileRipple } from './TactileRipple';

interface ProjectCardProps {
  project: ProjectItem;
  index: number;
  copiedId: string | null;
  isAdminActive: boolean;
  isFirst: boolean;
  isLast: boolean;
  draggedId: string | null;
  dragOverId: string | null;
  onOpenPreview: (project: ProjectItem) => void;
  onCopyLink: (project: ProjectItem) => void;
  onDragStart: (id: string) => void;
  onDragOver: (e: DragEvent<HTMLElement>, id: string) => void;
  onDragLeave: (id: string) => void;
  onDragEnd: () => void;
  onDrop: (id: string) => void;
  onMoveStep: (project: ProjectItem, direction: number) => void;
  onToggleHidden: (project: ProjectItem) => void;
  onToggleFavorite: (project: ProjectItem) => void;
  onEdit: (project: ProjectItem) => void;
  onDelete: (project: ProjectItem) => void;
}

export default function ProjectCard({
  project,
  index,
  copiedId,
  isAdminActive,
  isFirst,
  isLast,
  draggedId,
  dragOverId,
  onOpenPreview,
  onCopyLink,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDragEnd,
  onDrop,
  onMoveStep,
  onToggleHidden,
  onToggleFavorite,
  onEdit,
  onDelete,
}: ProjectCardProps) {
  const safeUrl = normalizeUrl(project.url);
  const displayHost = project.url.replace(/^https?:\/\//i, '').replace(/\/$/, '');
  const isCopied = copiedId === project.id;

  const cardRipple = useTactileRipple();
  const copyRipple = useTactileRipple();
  const openRipple = useTactileRipple();

  return (
    <article
      draggable={isAdminActive}
      onDragStart={() => onDragStart(project.id)}
      onDragOver={(e) => onDragOver(e, project.id)}
      onDragLeave={() => onDragLeave(project.id)}
      onDragEnd={onDragEnd}
      onDrop={() => onDrop(project.id)}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('button, a')) return;
        cardRipple.triggerRipple(e);
      }}
      style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}
      className={`group relative rounded-xl border bg-white dark:bg-[#161616] p-3.5 flex flex-col justify-between transition-transform duration-150 ease-out active:scale-[0.96] has-[button:active]:scale-100 animate-card-stagger ${
        project.hidden
          ? 'opacity-70 border-dashed border-slate-300 dark:border-zinc-700'
          : 'border-slate-200/80 dark:border-[#262626]'
      } ${draggedId === project.id ? 'opacity-45 scale-[0.97]' : ''} ${
        dragOverId === project.id ? 'ring-2 accent-border' : ''
      }`}
    >
      {/* Ripple cahaya oranye di dalam batas kartu */}
      <RippleLayer ripples={cardRipple.ripples} />

      {/* Garis tepi cahaya oranye halus saat hover atau focus */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-200 border border-[#F97316]/65 shadow-[0_0_20px_-6px_rgba(249,115,22,0.38)]"
      />

      <div className="relative z-10 flex items-start justify-between gap-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5">
            {safeUrl ? (
              <button
                type="button"
                onClick={() => onOpenPreview(project)}
                className="text-left text-[13px] sm:text-sm font-semibold text-slate-900 dark:text-zinc-50 hover:text-[#F97316] dark:hover:text-[#F97316] transition-colors break-words leading-snug focus-visible:outline-none focus-visible:underline"
              >
                {project.title}
              </button>
            ) : (
              <h2 className="text-[13px] sm:text-sm font-semibold text-slate-900 dark:text-zinc-50 break-words leading-snug">
                {project.title}
              </h2>
            )}

            {project.favorite && (
              <Star
                className="w-3 h-3 text-[#F97316] fill-[#F97316] shrink-0"
                aria-label="Favorit"
              />
            )}

            <span className="text-[10px] font-medium accent-text">
              {project.category || 'Umum'}
            </span>

            {project.hidden && (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-slate-500 dark:text-zinc-400">
                <EyeOff className="w-2.5 h-2.5" />
                <span>Tersembunyi</span>
              </span>
            )}
          </div>

          {project.description && (
            <p className="mt-1 text-[11px] sm:text-xs text-slate-600 dark:text-zinc-400 line-clamp-2 break-words leading-relaxed">
              {project.description}
            </p>
          )}

          <div className="mt-2 flex items-center flex-wrap gap-x-1.5 gap-y-0.5 text-[10px] text-slate-400 dark:text-zinc-500">
            <span className="font-mono truncate max-w-[180px] sm:max-w-xs">{displayHost}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">{project.clicks} klik</span>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <div className="relative">
            {isCopied && (
              <span
                role="status"
                className="pointer-events-none absolute -top-7 left-1/2 z-30 px-2 py-0.5 rounded-md bg-[#1D1D1D] border border-[#F97316]/60 text-[10px] font-medium text-white shadow-md whitespace-nowrap animate-copy-tooltip"
              >
                Copied!
              </span>
            )}
            <button
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
                copyRipple.triggerRipple(e);
              }}
              onClick={() => onCopyLink(project)}
              title="Salin tautan"
              aria-label="Salin tautan"
              className="relative overflow-hidden w-7 h-7 flex items-center justify-center rounded-lg border border-transparent hover:border-[#262626] text-slate-400 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#1E1E1E] transition-transform duration-150 active:scale-[0.96]"
            >
              <RippleLayer ripples={copyRipple.ripples} />
              <span className="relative z-10 flex items-center justify-center">
                {isCopied ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400 animate-icon-pop" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </span>
            </button>
          </div>

          {safeUrl && (
            <button
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
                openRipple.triggerRipple(e);
              }}
              onClick={() => onOpenPreview(project)}
              title="Buka tautan"
              aria-label="Buka tautan"
              className="relative overflow-hidden w-7 h-7 flex items-center justify-center rounded-lg border border-transparent hover:border-[#262626] text-slate-500 dark:text-zinc-400 hover:text-[#F97316] dark:hover:text-[#F97316] hover:bg-slate-100 dark:hover:bg-[#1E1E1E] transition-transform duration-150 active:scale-[0.96]"
            >
              <RippleLayer ripples={openRipple.ripples} />
              <ArrowUpRight className="w-3.5 h-3.5 relative z-10 transition-transform duration-200 ease-out group-hover:translate-x-[3px] group-hover:-translate-y-[3px] group-focus-within:translate-x-[3px] group-focus-within:-translate-y-[3px]" />
            </button>
          )}
        </div>
      </div>

      {isAdminActive && (
        <div className="relative z-10 mt-2.5 pt-2 border-t border-slate-100 dark:border-[#242424] flex flex-wrap items-center justify-between gap-1.5 text-[10px]">
          <div className="flex items-center gap-0.5 text-slate-400 dark:text-zinc-500">
            <span className="cursor-grab inline-flex p-0.5" title="Seret untuk mengurutkan">
              <GripVertical className="w-3 h-3" />
            </span>
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onMoveStep(project, -1)}
              disabled={isFirst}
              className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-[#222222] disabled:opacity-30 transition-transform duration-150 active:scale-[0.96]"
              title="Geser naik"
              aria-label="Geser naik"
            >
              <ArrowUp className="w-2.5 h-2.5" />
            </button>
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onMoveStep(project, 1)}
              disabled={isLast}
              className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-[#222222] disabled:opacity-30 transition-transform duration-150 active:scale-[0.96]"
              title="Geser turun"
              aria-label="Geser turun"
            >
              <ArrowDown className="w-2.5 h-2.5" />
            </button>
          </div>

          <div className="flex items-center flex-wrap gap-1">
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onToggleHidden(project)}
              title={project.hidden ? 'Tampilkan ke publik' : 'Sembunyikan dari publik'}
              aria-label={project.hidden ? 'Tampilkan ke publik' : 'Sembunyikan dari publik'}
              className={`h-6 px-2 inline-flex items-center gap-1 rounded-lg text-[10px] transition-all duration-150 active:scale-[0.96] ${
                project.hidden
                  ? 'bg-slate-200 dark:bg-zinc-700 text-slate-800 dark:text-zinc-100'
                  : 'bg-slate-100 dark:bg-[#202020] text-slate-600 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-[#282828]'
              }`}
            >
              {project.hidden ? <Eye className="w-2.5 h-2.5" /> : <EyeOff className="w-2.5 h-2.5" />}
              <span>{project.hidden ? 'Tampilkan' : 'Sembunyikan'}</span>
            </button>

            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onToggleFavorite(project)}
              title={project.favorite ? 'Hapus dari Favorit' : 'Tandai Favorit'}
              aria-label="Toggle Favorit"
              className={`h-6 px-2 inline-flex items-center gap-1 rounded-lg text-[10px] transition-all duration-150 active:scale-[0.96] ${
                project.favorite
                  ? 'bg-[#F97316]/15 text-[#F97316]'
                  : 'bg-slate-100 dark:bg-[#202020] text-slate-600 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-[#282828]'
              }`}
            >
              <Star
                className={`w-2.5 h-2.5 ${
                  project.favorite ? 'fill-[#F97316] text-[#F97316]' : ''
                }`}
              />
              <span>Favorit</span>
            </button>

            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onEdit(project)}
              className="h-6 px-2 inline-flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-[#202020] text-slate-600 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-[#282828] text-[10px] transition-all duration-150 active:scale-[0.96]"
            >
              <Pencil className="w-2.5 h-2.5" />
              <span>Edit</span>
            </button>

            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onDelete(project)}
              className="h-6 px-2 inline-flex items-center gap-1 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-950/70 text-[10px] transition-all duration-150 active:scale-[0.96]"
            >
              <Trash2 className="w-2.5 h-2.5" />
              <span>Hapus</span>
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
