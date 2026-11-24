import { useState } from 'react';
import { Download, WifiOff } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import Modal from './Modal';
import { RippleLayer, useTactileRipple } from './TactileRipple';

export function PWAInstallButton() {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const { ripples, triggerRipple } = useTactileRipple();

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        type="button"
        onPointerDown={triggerRipple}
        onClick={install}
        title="Pasang Aplikasi"
        aria-label="Pasang Aplikasi"
        className="relative overflow-hidden w-8 h-8 flex items-center justify-center rounded-xl bg-slate-200/70 dark:bg-[#161616] border border-slate-300/60 dark:border-[#262626] text-slate-700 dark:text-zinc-300 hover:border-[#F97316]/50 hover:text-slate-900 dark:hover:text-white transition-transform duration-150 active:scale-[0.96] shrink-0"
      >
        <RippleLayer ripples={ripples} />
        <Download className="w-3.5 h-3.5 relative z-10" />
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onPointerDown={triggerRipple}
          onClick={() => setShowIOSGuide(true)}
          title="Pasang Aplikasi"
          aria-label="Pasang Aplikasi"
          className="relative overflow-hidden w-8 h-8 flex items-center justify-center rounded-xl bg-slate-200/70 dark:bg-[#161616] border border-slate-300/60 dark:border-[#262626] text-slate-700 dark:text-zinc-300 hover:border-[#F97316]/50 hover:text-slate-900 dark:hover:text-white transition-transform duration-150 active:scale-[0.96] shrink-0"
        >
          <RippleLayer ripples={ripples} />
          <Download className="w-3.5 h-3.5 relative z-10" />
        </button>

        <Modal open={showIOSGuide} onClose={() => setShowIOSGuide(false)} title="Pasang di iPhone / iPad">
          <div className="space-y-3 text-xs text-slate-700 dark:text-zinc-300">
            <p>1. Ketuk tombol Bagikan (Share) pada bilah Safari.</p>
            <p>2. Gulir ke bawah lalu pilih Tambahkan ke Layar Utama.</p>
            <button
              type="button"
              onClick={() => setShowIOSGuide(false)}
              className="mt-2 w-full h-9 rounded-xl accent-bg text-white text-xs font-medium transition-colors"
            >
              Mengerti
            </button>
          </div>
        </Modal>
      </>
    );
  }

  return null;
}

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-amber-600 px-3 py-2 text-[11px] font-medium text-white shadow-lg">
      <WifiOff className="w-3.5 h-3.5 shrink-0" />
      <span>Mode Offline — Data tersimpan digunakan</span>
    </div>
  );
}
