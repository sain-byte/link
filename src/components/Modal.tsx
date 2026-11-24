import { ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  maxWidth?: string;
  noPadding?: boolean;
  compactHeader?: boolean;
}

export default function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  maxWidth = 'max-w-md',
  noPadding = false,
  compactHeader = false,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={`w-full ${maxWidth} rounded-2xl bg-white/95 text-slate-900 dark:bg-[#161616] dark:text-zinc-100 border border-slate-200/70 dark:border-[#262626] shadow-2xl animate-pop-in ${
          compactHeader ? 'max-h-[92vh] sm:max-h-[88vh]' : 'max-h-[88vh]'
        } flex flex-col overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`flex items-center justify-between border-b border-slate-200/60 dark:border-[#262626] shrink-0 ${
            compactHeader ? 'px-3 py-1.5' : 'px-4 py-3'
          }`}
        >
          <div className="min-w-0">
            <h3 className="text-sm font-semibold leading-tight">{title}</h3>
            {subtitle && (
              <p className="text-[10px] text-slate-500 dark:text-zinc-400 mt-0.5 leading-tight">
                {subtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="min-h-[30px] min-w-[30px] flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className={`${noPadding ? '' : 'p-5 '}overflow-y-auto flex-1 flex flex-col min-h-0`}>
          {children}
        </div>
      </div>
    </div>
  );
}
