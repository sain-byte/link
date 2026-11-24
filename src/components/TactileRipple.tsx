import { PointerEvent, useCallback, useEffect, useRef, useState } from 'react';

export interface RippleItem {
  id: number;
  x: number;
  y: number;
  size: number;
}

export function useTactileRipple() {
  const [ripples, setRipples] = useState<RippleItem[]>([]);
  const nextIdRef = useRef(0);
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    return () => {
      timersRef.current.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  const triggerRipple = useCallback((e: PointerEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const size = Math.max(rect.width, rect.height, 36) * 1.15;
    const id = ++nextIdRef.current;

    setRipples((prev) => [...prev.slice(-3), { id, x, y, size }]);
    const timer = window.setTimeout(() => {
      setRipples((prev) => prev.filter((r) => r.id !== id));
    }, 460);
    timersRef.current.push(timer);
  }, []);

  return { ripples, triggerRipple };
}

export function RippleLayer({ ripples }: { ripples: RippleItem[] }) {
  if (ripples.length === 0) return null;
  return (
    <span className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
      {ripples.map((r) => (
        <span
          key={r.id}
          className="tactile-ripple-circle"
          style={{
            left: `${r.x}px`,
            top: `${r.y}px`,
            width: `${r.size}px`,
            height: `${r.size}px`,
          }}
        />
      ))}
    </span>
  );
}
