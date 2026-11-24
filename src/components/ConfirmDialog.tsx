import { AlertTriangle } from 'lucide-react';
import Modal from './Modal';

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  title: string;
  message: string;
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
}

export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  detail,
  confirmLabel = 'Ya, Hapus',
  cancelLabel = 'Batal',
  loading = false,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={loading ? () => {} : onClose} title={title} maxWidth="max-w-sm">
      <div className="space-y-3.5">
        <div className="flex items-start gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-rose-500/12 text-rose-500 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div className="min-w-0 space-y-1">
            <p className="text-xs sm:text-sm font-medium text-slate-900 dark:text-zinc-100 leading-snug break-words">
              {message}
            </p>
            {detail && (
              <p className="text-[11px] text-slate-500 dark:text-zinc-400 break-words line-clamp-2 bg-slate-100/80 dark:bg-zinc-800/60 px-2.5 py-1.5 rounded-lg border border-slate-200/70 dark:border-zinc-700/70">
                {detail}
              </p>
            )}
            <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-relaxed">
              Tindakan ini permanen dan data yang dihapus tidak dapat dikembalikan.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            className="h-8 px-3.5 rounded-xl border border-slate-200 dark:border-zinc-700 text-xs font-medium text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 disabled:opacity-50 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => void onConfirm()}
            className="h-8 px-3.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-medium disabled:opacity-50 transition-colors"
          >
            {loading ? 'Menghapus...' : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
