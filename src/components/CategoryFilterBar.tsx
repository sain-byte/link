import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Star } from 'lucide-react';

interface CategoryFilterBarProps {
  selectedCategory: string;
  onSelectCategory: (cat: string) => void;
  totalCount: number;
  favoriteCount: number;
  categoryStats: [string, number][];
}

export default function CategoryFilterBar({
  selectedCategory,
  onSelectCategory,
  totalCount,
  favoriteCount,
  categoryStats,
}: CategoryFilterBarProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [pillStyle, setPillStyle] = useState({ left: 0, width: 0 });
  const [pillReady, setPillReady] = useState(false);
  const hasMeasuredRef = useRef(false);
  const [pillAnimate, setPillAnimate] = useState(false);

  const measureActivePill = useCallback(() => {
    const activeBtn = btnRefs.current.get(selectedCategory);
    if (!activeBtn) {
      setPillReady(false);
      return;
    }
    setPillStyle({
      left: activeBtn.offsetLeft,
      width: activeBtn.offsetWidth,
    });
    setPillReady(true);

    if (!hasMeasuredRef.current) {
      hasMeasuredRef.current = true;
      requestAnimationFrame(() => setPillAnimate(true));
    }
  }, [selectedCategory]);

  useLayoutEffect(() => {
    measureActivePill();
    const activeBtn = btnRefs.current.get(selectedCategory);
    if (activeBtn && hasMeasuredRef.current) {
      activeBtn.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
    }
  }, [measureActivePill, selectedCategory, totalCount, favoriteCount, categoryStats]);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      measureActivePill();
    });
    ro.observe(rail);
    return () => ro.disconnect();
  }, [measureActivePill]);

  const setBtnRef = (key: string) => (el: HTMLButtonElement | null) => {
    if (el) {
      btnRefs.current.set(key, el);
    } else {
      btnRefs.current.delete(key);
    }
  };

  return (
    <div
      ref={railRef}
      role="tablist"
      aria-label="Filter kategori proyek"
      className="relative flex items-center gap-1 overflow-x-auto no-scrollbar p-1 rounded-xl bg-slate-200/70 dark:bg-[#161616] border border-slate-200/80 dark:border-[#262626]"
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute top-1 bottom-1 left-0 rounded-lg accent-bg shadow-xs ${
          pillReady ? 'opacity-100' : 'opacity-0'
        }`}
        style={{
          width: `${pillStyle.width}px`,
          transform: `translate3d(${pillStyle.left}px, 0, 0)`,
          transition: pillAnimate
            ? 'transform 380ms cubic-bezier(0.34, 1.56, 0.64, 1), width 320ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 150ms ease'
            : 'none',
          willChange: 'transform',
        }}
      />

      <button
        ref={setBtnRef('Semua')}
        type="button"
        role="tab"
        aria-selected={selectedCategory === 'Semua'}
        onClick={() => onSelectCategory('Semua')}
        className={`relative z-10 h-7 px-2.5 rounded-lg text-[11px] font-medium transition-colors duration-200 whitespace-nowrap shrink-0 active:scale-[0.96] ${
          selectedCategory === 'Semua'
            ? 'text-white'
            : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100'
        }`}
      >
        Semua (<span className="tabular-nums">{totalCount}</span>)
      </button>

      <button
        ref={setBtnRef('__favorit__')}
        type="button"
        role="tab"
        aria-selected={selectedCategory === '__favorit__'}
        onClick={() => onSelectCategory('__favorit__')}
        className={`relative z-10 h-7 px-2.5 rounded-lg text-[11px] font-medium inline-flex items-center gap-1 transition-colors duration-200 whitespace-nowrap shrink-0 active:scale-[0.96] ${
          selectedCategory === '__favorit__'
            ? 'text-white'
            : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100'
        }`}
      >
        <Star
          className={`w-2.5 h-2.5 transition-colors ${
            selectedCategory === '__favorit__'
              ? 'text-white fill-white'
              : 'text-[#F97316] fill-[#F97316]'
          }`}
        />
        <span>
          Favorit (<span className="tabular-nums">{favoriteCount}</span>)
        </span>
      </button>

      {categoryStats.map(([cat, count]) => {
        const isActive = selectedCategory === cat;
        return (
          <button
            key={cat}
            ref={setBtnRef(cat)}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelectCategory(cat)}
            className={`relative z-10 h-7 px-2.5 rounded-lg text-[11px] font-medium transition-colors duration-200 whitespace-nowrap shrink-0 active:scale-[0.96] ${
              isActive
                ? 'text-white'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100'
            }`}
          >
            {cat} (<span className="tabular-nums">{count}</span>)
          </button>
        );
      })}
    </div>
  );
}
