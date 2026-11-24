import { useEffect, useRef, useState } from 'react';
import { doc, getDoc, increment, onSnapshot, setDoc } from 'firebase/firestore';
import { db, OperationType, reportFirestoreError } from '../firebase';
import { getTodayKey } from '../utils/format';

export default function VisitCounter() {
  const [stats, setStats] = useState({ total: 0, today: 0 });
  const [displayTotal, setDisplayTotal] = useState(0);
  const [displayToday, setDisplayToday] = useState(0);
  const recordedRef = useRef(false);
  const animCurrentRef = useRef({ total: 0, today: 0 });

  useEffect(() => {
    const todayKey = getTodayKey();
    const visitRef = doc(db, 'visits', 'stats');
    const analyticsRef = doc(db, 'analytics', todayKey);

    const recordVisit = async () => {
      if (recordedRef.current) return;
      recordedRef.current = true;
      if (sessionStorage.getItem('sainbyte_visited') === todayKey) return;

      try {
        const snap = await getDoc(visitRef);
        if (!snap.exists()) {
          await setDoc(visitRef, {
            total: 1,
            today: 1,
            lastVisit: todayKey,
          });
        } else {
          const data = snap.data();
          const isSameDay = data.lastVisit === todayKey;
          await setDoc(
            visitRef,
            {
              total: (Number(data.total) || 0) + 1,
              today: isSameDay ? (Number(data.today) || 0) + 1 : 1,
              lastVisit: todayKey,
            },
            { merge: true }
          );
        }

        await setDoc(
          analyticsRef,
          {
            date: todayKey,
            visits: increment(1),
            clicks: increment(0),
          },
          { merge: true }
        );

        sessionStorage.setItem('sainbyte_visited', todayKey);
      } catch (err) {
        reportFirestoreError(err, OperationType.WRITE, 'visits/stats');
      }
    };

    void recordVisit();

    const unsub = onSnapshot(
      visitRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          const isToday = data.lastVisit === getTodayKey();
          setStats({
            total: Number(data.total) || 0,
            today: isToday ? Number(data.today) || 0 : 0,
          });
        }
      },
      (err) => {
        reportFirestoreError(err, OperationType.GET, 'visits/stats');
      }
    );

    return () => unsub();
  }, []);

  useEffect(() => {
    const duration = 600;
    const startTotal = animCurrentRef.current.total;
    const startToday = animCurrentRef.current.today;
    const targetTotal = stats.total;
    const targetToday = stats.today;
    const startTime = performance.now();

    let rafId = 0;
    const step = (now: number) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const nextTotal = Math.round(startTotal + (targetTotal - startTotal) * eased);
      const nextToday = Math.round(startToday + (targetToday - startToday) * eased);
      animCurrentRef.current = { total: nextTotal, today: nextToday };
      setDisplayTotal(nextTotal);
      setDisplayToday(nextToday);
      if (progress < 1) {
        rafId = requestAnimationFrame(step);
      }
    };
    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [stats.total, stats.today]);

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 text-[10px] text-slate-500 dark:text-zinc-500">
      <span>
        Kunjungan:{' '}
        <strong className="font-mono text-slate-700 dark:text-zinc-300 tabular-nums">
          {displayTotal.toLocaleString('id-ID')}
        </strong>
      </span>
      <span aria-hidden="true">·</span>
      <span>
        Hari Ini:{' '}
        <strong className="font-mono text-slate-700 dark:text-zinc-300 tabular-nums">
          {displayToday.toLocaleString('id-ID')}
        </strong>
      </span>
    </div>
  );
}
