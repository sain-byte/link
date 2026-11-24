import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { VaultCategoryDef, VaultCategoryFilter } from './vaultMeta';

interface VaultSidebarNavProps {
  categories: VaultCategoryDef[];
  activeCategory: VaultCategoryFilter;
  countsByCategory: Record<VaultCategoryFilter, number>;
  onSelectCategory: (id: VaultCategoryFilter) => void;
}

export default function VaultSidebarNav({
  categories,
  activeCategory,
  countsByCategory,
  onSelectCategory,
}: VaultSidebarNavProps) {
  const navRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<Map<VaultCategoryFilter, HTMLButtonElement>>(new Map());
  const [indicator, setIndicator] = useState({ top: 0, height: 0 });
  const [indicatorReady, setIndicatorReady] = useState(false);
  const [indicatorAnimate, setIndicatorAnimate] = useState(false);
  const hasMeasuredRef = useRef(false);

  const measureIndicator = useCallback(() => {
    const activeBtn = btnRefs.current.get(activeCategory);
    if (!activeBtn || activeBtn.offsetHeight === 0) {
      setIndicatorReady(false);
      return;
    }
    setIndicator({
      top: activeBtn.offsetTop,
      height: activeBtn.offsetHeight,
    });
    setIndicatorReady(true);

    if (!hasMeasuredRef.current) {
      hasMeasuredRef.current = true;
      requestAnimationFrame(() => setIndicatorAnimate(true));
    }
  }, [activeCategory]);

  useLayoutEffect(() => {
    measureIndicator();
  }, [measureIndicator, categories, countsByCategory]);

  useEffect(() => {
    const navEl = navRef.current;
    if (!navEl || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      measureIndicator();
    });
    ro.observe(navEl);
    return () => ro.disconnect();
  }, [measureIndicator]);

  const setBtnRef = (id: VaultCategoryFilter) => (el: HTMLButtonElement | null) => {
    if (el) {
      btnRefs.current.set(id, el);
    } else {
      btnRefs.current.delete(id);
    }
  };

  return (
    <nav aria-label="Kategori Vault" className="space-y-1.5">
      <p className="px-2 pb-1 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
        Kategori Arsip
      </p>
      <div ref={navRef} className="relative space-y-1">
        {/* Smooth GPU-accelerated vertical sliding highlight */}
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute left-0 right-0 top-0 rounded-lg border border-emerald-500/35 bg-emerald-500/10 shadow-[0_0_16px_-6px_rgba(16,185,129,0.45)] ${
            indicatorReady ? 'opacity-100' : 'opacity-0'
          }`}
          style={{
            height: `${indicator.height}px`,
            transform: `translate3d(0, ${indicator.top}px, 0)`,
            transition: indicatorAnimate
              ? 'transform 320ms cubic-bezier(0.34, 1.45, 0.64, 1), height 240ms cubic-bezier(0.22, 1, 0.36, 1), opacity 160ms ease'
              : 'none',
            willChange: 'transform, height',
          }}
        >
          <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-[#10b981]" />
        </span>

        {categories.map((cat) => {
          const active = activeCategory === cat.id;
          const Icon = cat.Icon;
          const count = countsByCategory[cat.id] || 0;
          return (
            <button
              key={cat.id}
              ref={setBtnRef(cat.id)}
              type="button"
              onClick={() => onSelectCategory(cat.id)}
              className={`group relative z-10 flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-[color,background-color,transform] duration-200 ease-out active:scale-[0.98] ${
                active
                  ? 'text-emerald-300'
                  : 'text-zinc-400 hover:bg-[#121216]/70 hover:text-zinc-100'
              }`}
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <Icon
                  className={`h-4 w-4 shrink-0 transition-[color,transform] duration-200 ${
                    active
                      ? 'scale-105 text-[#10b981]'
                      : 'text-zinc-500 group-hover:scale-105 group-hover:text-zinc-300'
                  }`}
                />
                <span className="truncate">{cat.label}</span>
              </span>
              <span
                className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] tabular-nums transition-colors duration-200 ${
                  active
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-[#121216] text-zinc-500 group-hover:text-zinc-300'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
