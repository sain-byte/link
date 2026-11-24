export default function Toast({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-4 left-1/2 -translate-x-1/2 z-[70] px-4 py-2 rounded-xl bg-slate-900 text-white dark:bg-[#161616] dark:text-zinc-100 border border-transparent dark:border-[#F97316]/50 text-xs sm:text-sm font-medium shadow-lg animate-pop-in max-w-[92vw] sm:max-w-md text-center break-words leading-snug"
    >
      {message}
    </div>
  );
}
