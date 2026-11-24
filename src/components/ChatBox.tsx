import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  writeBatch,
} from 'firebase/firestore';
import {
  AlertTriangle,
  ArrowUp,
  Heart,
  Pin,
  PinOff,
  Reply,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  db,
  FirebaseDiagnostics,
  formatFirestoreError,
  getFirebaseDiagnostics,
  OperationType,
  reportFirestoreError,
  safeAddDoc,
  safeDeleteDoc,
  safeUpdateDoc,
  subscribeFirebaseDiagnostics,
  withTimeout,
} from '../firebase';
import { CommentItem } from '../types/models';
import { formatTanggal } from '../utils/format';
import ConfirmDialog from './ConfirmDialog';
import Modal from './Modal';

const ANIMATED_EMOTE_LIST: { char: string; anim: string }[] = [
  { char: '🥺', anim: 'emote-float' },
  { char: '😍', anim: 'emote-pulse' },
  { char: '🤭', anim: 'emote-wiggle' },
  { char: '😋', anim: 'emote-wiggle' },
  { char: '🫣', anim: 'emote-float' },
  { char: '👀', anim: 'emote-wiggle' },
  { char: '✨', anim: 'emote-float' },
  { char: '💖', anim: 'emote-pulse' },
  { char: '🫶', anim: 'emote-pulse' },
  { char: '🐱', anim: 'emote-wiggle' },
  { char: '🐶', anim: 'emote-wiggle' },
  { char: '🐰', anim: 'emote-animated' },
  { char: '🐻', anim: 'emote-float' },
  { char: '🐼', anim: 'emote-float' },
  { char: '🦊', anim: 'emote-wiggle' },
  { char: '🐥', anim: 'emote-animated' },
  { char: '🐣', anim: 'emote-animated' },
  { char: '🔥', anim: 'emote-pulse' },
  { char: '👍', anim: 'emote-animated' },
  { char: '👏', anim: 'emote-wiggle' },
  { char: '😂', anim: 'emote-wiggle' },
  { char: '😮', anim: 'emote-pulse' },
  { char: '😢', anim: 'emote-float' },
  { char: '🙏', anim: 'emote-animated' },
  { char: '🎉', anim: 'emote-animated' },
  { char: '❤️', anim: 'emote-pulse' },
];

const KAOMOJI_LIST = [
  '(“⌒‿⌒)',
  '(｡♥‿♥｡)',
  '(ﾉ◕ヮ◕)ﾉ*:･ﾟ✧',
  '(´꒳`)♡',
];

const EMOTE_ANIM_MAP = new Map(ANIMATED_EMOTE_LIST.map((e) => [e.char, e.anim]));

function renderMessageWithEmotes(text: string) {
  const parts = String(text).split(/(\p{Emoji_Presentation}|\p{Extended_Pictographic})/gu);
  return parts.map((part, i) => {
    const animClass = EMOTE_ANIM_MAP.get(part);
    if (animClass) {
      return (
        <span key={i} className={`${animClass} mx-0.5`}>
          {part}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

interface ChatBoxProps {
  open: boolean;
  onClose: () => void;
  onCountChange?: (count: number) => void;
  isAdminUnlocked: boolean;
  onRequireAdmin: (callback?: () => void) => void;
  showToast: (msg: string) => void;
}

interface CommentNode extends CommentItem {
  children: CommentNode[];
  isOrphanReply?: boolean;
  showMentionPrefix?: boolean;
}

function getCommentMillis(createdAt: CommentItem['createdAt']): number {
  if (!createdAt) return Date.now();
  if (
    typeof createdAt === 'object' &&
    'toMillis' in createdAt &&
    typeof createdAt.toMillis === 'function'
  ) {
    return createdAt.toMillis();
  }
  return new Date((createdAt as Date | string | number) || Date.now()).getTime();
}

const PREVIEW_REPLY_LIMIT = 2;

function hasPinnedInSubtree(node: CommentNode): boolean {
  return node.pinned || node.children.some(hasPinnedInSubtree);
}

function countRepliesInSubtree(children: CommentNode[]): number {
  let total = 0;
  for (const child of children) {
    total += 1 + countRepliesInSubtree(child.children);
  }
  return total;
}

function sliceThreadReplies(
  children: CommentNode[],
  limit: number
): { visible: CommentNode[]; hiddenCount: number } {
  let remaining = limit;
  const visible: CommentNode[] = [];

  for (const level1 of children) {
    if (remaining <= 0) break;
    remaining -= 1;

    const visibleLevel2: CommentNode[] = [];
    for (const level2 of level1.children) {
      if (remaining <= 0) break;
      remaining -= 1;
      visibleLevel2.push(level2);
    }

    visible.push({
      ...level1,
      children: visibleLevel2,
    });
  }

  const totalReplies = countRepliesInSubtree(children);
  const shownReplies = countRepliesInSubtree(visible);
  return {
    visible,
    hiddenCount: Math.max(0, totalReplies - shownReplies),
  };
}

function collectFlattenedLevel2(node: CommentNode, includeMention: boolean): CommentNode[] {
  const result: CommentNode[] = [
    {
      ...node,
      showMentionPrefix: includeMention && Boolean(node.replyToName),
      children: [],
    },
  ];
  for (const child of node.children) {
    result.push(...collectFlattenedLevel2(child, true));
  }
  return result;
}

export default function ChatBox({
  open,
  onClose,
  onCountChange,
  isAdminUnlocked,
  onRequireAdmin,
  showToast,
}: ChatBoxProps) {
  const [serverComments, setServerComments] = useState<CommentItem[]>([]);
  const [optimisticComments, setOptimisticComments] = useState<CommentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [sendError, setSendError] = useState('');
  const [diagnostics, setDiagnostics] = useState<FirebaseDiagnostics>(() =>
    getFirebaseDiagnostics()
  );

  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [replyTo, setReplyTo] = useState<{ id: string; name: string; message: string } | null>(null);
  const [showEmotes, setShowEmotes] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedThreadIds, setExpandedThreadIds] = useState<Record<string, boolean>>({});
  const [deleteTarget, setDeleteTarget] = useState<CommentItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const messageInputRef = useRef<HTMLInputElement>(null);
  const listScrollRef = useRef<HTMLDivElement>(null);

  const [likedIds, setLikedIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('sainbyte_liked_comments');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  useEffect(() => subscribeFirebaseDiagnostics(setDiagnostics), []);

  useEffect(() => {
    const q = query(collection(db, 'comments'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: CommentItem[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            clientId: String(data.clientId || ''),
            name: String(data.name || 'Tamu 🐰'),
            message: String(data.message || ''),
            replyToId: String(data.replyToId || ''),
            replyToName: String(data.replyToName || ''),
            replyToMessage: String(data.replyToMessage || ''),
            likes: Number(data.likes) || 0,
            pinned: Boolean(data.pinned),
            createdAt: data.createdAt || null,
          };
        });
        setServerComments(list);
        setOptimisticComments((prev) =>
          prev.filter((opt) => !list.some((srv) => srv.clientId === opt.clientId))
        );
        if (!snap.metadata.fromCache) {
          setLoadError('');
        }
        setLoading(false);
      },
      (err) => {
        reportFirestoreError(err, OperationType.LIST, 'comments');
        setLoadError(formatFirestoreError(err));
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const allComments = useMemo(() => {
    const seenIds = new Set<string>();
    const seenClientIds = new Set<string>();
    const deduped: CommentItem[] = [];

    for (const item of serverComments) {
      seenIds.add(item.id);
      if (item.clientId) seenClientIds.add(item.clientId);
      deduped.push(item);
    }

    for (const item of optimisticComments) {
      if (seenIds.has(item.id)) continue;
      if (item.clientId && seenClientIds.has(item.clientId)) continue;
      deduped.push(item);
    }

    return deduped;
  }, [optimisticComments, serverComments]);

  const { commentThreads, rootKeyByCommentId } = useMemo(() => {
    const byId = new Map<string, CommentNode>();
    const byClientId = new Map<string, CommentNode>();
    const nodes: CommentNode[] = allComments.map((c) => {
      const node: CommentNode = { ...c, children: [] };
      byId.set(c.id, node);
      if (c.clientId) byClientId.set(c.clientId, node);
      return node;
    });

    const roots: CommentNode[] = [];

    for (const node of nodes) {
      const parent = node.replyToId
        ? byId.get(node.replyToId) || byClientId.get(node.replyToId)
        : undefined;

      if (parent && parent !== node) {
        parent.children.push(node);
      } else {
        if (node.replyToId && node.replyToMessage) {
          node.isOrphanReply = true;
        }
        roots.push(node);
      }
    }

    const sortChildrenAsc = (children: CommentNode[]) => {
      children.sort((a, b) => getCommentMillis(a.createdAt) - getCommentMillis(b.createdAt));
      for (const child of children) {
        if (child.children.length > 0) {
          sortChildrenAsc(child.children);
        }
      }
    };

    for (const root of roots) {
      sortChildrenAsc(root.children);
      root.children = root.children.map((level1Child) => ({
        ...level1Child,
        children: level1Child.children
          .flatMap((level2Child) => collectFlattenedLevel2(level2Child, false))
          .sort((a, b) => getCommentMillis(a.createdAt) - getCommentMillis(b.createdAt)),
      }));
    }

    roots.sort((a, b) => {
      const aPinned = hasPinnedInSubtree(a);
      const bPinned = hasPinnedInSubtree(b);
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;
      return getCommentMillis(b.createdAt) - getCommentMillis(a.createdAt);
    });

    const keyLookup = new Map<string, string>();
    const registerSubtree = (node: CommentNode, rootKey: string) => {
      keyLookup.set(node.id, rootKey);
      if (node.clientId) keyLookup.set(node.clientId, rootKey);
      for (const child of node.children) {
        registerSubtree(child, rootKey);
      }
    };
    for (const root of roots) {
      registerSubtree(root, root.clientId || root.id);
    }

    return { commentThreads: roots, rootKeyByCommentId: keyLookup };
  }, [allComments]);

  const normalizedSearch = searchQuery.trim().toLowerCase();

  const filteredThreads = useMemo(() => {
    if (!normalizedSearch) return commentThreads;
    const matchesNode = (node: CommentNode): boolean =>
      (node.name || '').toLowerCase().includes(normalizedSearch) ||
      (node.message || '').toLowerCase().includes(normalizedSearch) ||
      node.children.some(matchesNode);
    return commentThreads.filter(matchesNode);
  }, [commentThreads, normalizedSearch]);

  useEffect(() => {
    onCountChange?.(allComments.length);
  }, [allComments.length, onCountChange]);

  const appendToMessage = (snippet: string) => {
    setMessage((prev) => `${prev}${snippet}`.slice(0, 200));
    messageInputRef.current?.focus();
  };

  const toggleThreadReplies = (threadKey: string) => {
    setExpandedThreadIds((prev) => ({
      ...prev,
      [threadKey]: !prev[threadKey],
    }));
  };

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    const cleanMessage = message.trim().slice(0, 200);
    if (!cleanMessage) return;

    setSendError('');
    const cleanName = (name.trim() || 'Tamu 🐰').slice(0, 40);
    const clientId = `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const optimisticItem: CommentItem = {
      id: clientId,
      clientId,
      name: cleanName,
      message: cleanMessage,
      replyToId: (replyTo?.id || '').slice(0, 128),
      replyToName: (replyTo?.name || '').slice(0, 40),
      replyToMessage: (replyTo?.message || '').slice(0, 300),
      likes: 0,
      pinned: false,
      createdAt: new Date(),
      _optimistic: true,
    };

    const previousReplyTo = replyTo;
    if (previousReplyTo) {
      const targetRootKey = rootKeyByCommentId.get(previousReplyTo.id);
      if (targetRootKey) {
        setExpandedThreadIds((prev) => ({ ...prev, [targetRootKey]: true }));
      }
    }

    setOptimisticComments((prev) => [optimisticItem, ...prev]);
    setMessage('');
    setReplyTo(null);
    setShowEmotes(false);

    if (!previousReplyTo) {
      requestAnimationFrame(() => {
        listScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      });
    } else {
      requestAnimationFrame(() => {
        const targetEl = listScrollRef.current?.querySelector(
          `[data-comment-client-id="${clientId}"]`
        );
        targetEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    }

    try {
      const res = await safeAddDoc(
        'comments',
        {
          clientId,
          name: cleanName,
          message: cleanMessage,
          replyToId: optimisticItem.replyToId,
          replyToName: optimisticItem.replyToName,
          replyToMessage: optimisticItem.replyToMessage,
          likes: 0,
          pinned: false,
        },
        { serverTimestampFields: ['createdAt'] }
      );

      setOptimisticComments((prev) =>
        prev.map((item) =>
          item.clientId === clientId
            ? { ...item, id: res.id, _optimistic: false }
            : item
        )
      );
    } catch (err) {
      setOptimisticComments((prev) => prev.filter((item) => item.clientId !== clientId));
      setMessage(cleanMessage);
      setReplyTo(previousReplyTo);
      const errMsg = formatFirestoreError(err);
      setSendError(errMsg);
      showToast(errMsg);
    }
  };

  const handleLike = async (comment: CommentItem) => {
    if (comment._optimistic) return;
    const alreadyLiked = likedIds.includes(comment.id);
    if (alreadyLiked && comment.likes <= 0) return;

    const nextLiked = alreadyLiked
      ? likedIds.filter((id) => id !== comment.id)
      : [...likedIds, comment.id];

    setLikedIds(nextLiked);
    localStorage.setItem('sainbyte_liked_comments', JSON.stringify(nextLiked));

    try {
      await safeUpdateDoc(
        `comments/${comment.id}`,
        {},
        { incrementFields: { likes: alreadyLiked ? -1 : 1 } }
      );
    } catch (err) {
      setLikedIds(likedIds);
      localStorage.setItem('sainbyte_liked_comments', JSON.stringify(likedIds));
      console.error(err);
    }
  };

  const handlePin = async (comment: CommentItem) => {
    if (!isAdminUnlocked) {
      onRequireAdmin(() => void handlePin(comment));
      return;
    }
    try {
      const pinnedOthers = serverComments.filter((c) => c.pinned && c.id !== comment.id);
      if (pinnedOthers.length > 0) {
        const batch = writeBatch(db);
        pinnedOthers.forEach((c) => {
          batch.update(doc(db, 'comments', c.id), { pinned: false });
        });
        batch.update(doc(db, 'comments', comment.id), { pinned: !comment.pinned });
        await withTimeout(batch.commit());
      } else {
        await safeUpdateDoc(`comments/${comment.id}`, { pinned: !comment.pinned });
      }
      showToast(comment.pinned ? 'Sematan dilepas' : 'Pesan disematkan');
    } catch (err) {
      showToast(formatFirestoreError(err));
      console.error(err);
    }
  };

  const requestDelete = (comment: CommentItem) => {
    if (!isAdminUnlocked) {
      onRequireAdmin(() => setDeleteTarget(comment));
      return;
    }
    setDeleteTarget(comment);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await safeDeleteDoc(`comments/${deleteTarget.id}`);
      setOptimisticComments((prev) => prev.filter((c) => c.id !== deleteTarget.id));
      setDeleteTarget(null);
      showToast('Pesan dihapus');
    } catch (err) {
      showToast(formatFirestoreError(err));
      console.error(err);
    } finally {
      setDeleting(false);
    }
  };

  const activeReadError =
    loadError ||
    (diagnostics.connectionStatus === 'error' && serverComments.length === 0
      ? diagnostics.connectionError || ''
      : '');

  const renderCommentContent = (node: CommentNode) => {
    const isLiked = likedIds.includes(node.id);
    return (
      <>
        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-1 min-w-0 text-[10px] text-slate-500 dark:text-zinc-400 leading-none">
            <span className="text-[11px] font-semibold text-slate-900 dark:text-zinc-100 truncate max-w-[115px]">
              {node.name || 'Tamu 🐰'}
            </span>
            {node.pinned && (
              <>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center text-amber-600 dark:text-amber-400 shrink-0">
                  <Pin className="w-2.5 h-2.5" />
                </span>
              </>
            )}
            <span aria-hidden="true">·</span>
            {node._optimistic ? (
              <span className="text-[9.5px] text-slate-500 dark:text-zinc-400 shrink-0">
                Mengirim...
              </span>
            ) : (
              <span className="text-[9.5px] font-mono tabular-nums shrink-0">
                {formatTanggal(node.createdAt)}
              </span>
            )}
          </div>

          <div className="flex items-center gap-0.5 shrink-0 text-[10px] text-slate-500 dark:text-zinc-400">
            <button
              type="button"
              onClick={() => void handleLike(node)}
              disabled={node._optimistic}
              aria-label={`Sukai komentar (${node.likes || 0})`}
              className={`h-[18px] inline-flex items-center gap-0.5 px-1 rounded transition-colors ${
                isLiked
                  ? 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40'
                  : 'hover:bg-slate-200/70 dark:hover:bg-zinc-800'
              }`}
            >
              <Heart className={`w-2.5 h-2.5 ${isLiked ? 'fill-current' : ''}`} />
              <span className="font-mono tabular-nums text-[9.5px] leading-none">
                {node.likes || 0}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setReplyTo({
                  id: node.id,
                  name: node.name || 'Tamu 🐰',
                  message: node.message,
                });
                messageInputRef.current?.focus();
              }}
              title="Balas"
              aria-label="Balas komentar"
              className="h-[18px] inline-flex items-center gap-0.5 px-1 rounded hover:bg-slate-200/70 dark:hover:bg-zinc-800 transition-colors"
            >
              <Reply className="w-2.5 h-2.5" />
              <span className="text-[9.5px] leading-none">Balas</span>
            </button>

            {isAdminUnlocked && !node._optimistic && (
              <>
                <button
                  type="button"
                  onClick={() => void handlePin(node)}
                  title={node.pinned ? 'Lepas sematan' : 'Sematkan'}
                  aria-label={node.pinned ? 'Lepas sematan' : 'Sematkan'}
                  className="w-[18px] h-[18px] inline-flex items-center justify-center rounded hover:bg-slate-200/70 dark:hover:bg-zinc-800 transition-colors"
                >
                  {node.pinned ? (
                    <PinOff className="w-2.5 h-2.5" />
                  ) : (
                    <Pin className="w-2.5 h-2.5" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => requestDelete(node)}
                  title="Hapus komentar"
                  aria-label="Hapus komentar"
                  className="w-[18px] h-[18px] inline-flex items-center justify-center rounded text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                >
                  <Trash2 className="w-2.5 h-2.5" />
                </button>
              </>
            )}
          </div>
        </div>

        {node.isOrphanReply && node.replyToMessage && (
          <p className="mt-0.5 text-[9.5px] text-slate-400 dark:text-zinc-500 truncate leading-tight">
            Membalas {node.replyToName || 'Tamu 🐰'}: {node.replyToMessage}
          </p>
        )}

        <p className="mt-0.5 text-[11.5px] text-slate-800 dark:text-zinc-200 break-words leading-[1.3]">
          {node.showMentionPrefix && node.replyToName && (
            <span className="text-[10.5px] font-medium text-slate-500 dark:text-zinc-400 mr-1">
              @{node.replyToName}
            </span>
          )}
          {renderMessageWithEmotes(node.message)}
        </p>
      </>
    );
  };

  const renderTreeBranch = (node: CommentNode, isLast: boolean) => (
    <div
      key={node.id}
      data-comment-client-id={node.clientId || undefined}
      className={`relative pl-[16px] pt-1 ${node._optimistic ? 'opacity-80' : ''}`}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-[4px] top-0 w-2.5 h-[12px] border-l border-b border-slate-300 dark:border-zinc-700 rounded-bl-md"
      />
      {!isLast && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-[4px] top-[9px] bottom-0 w-px bg-slate-300 dark:bg-zinc-700"
        />
      )}

      {renderCommentContent(node)}

      {node.children.length > 0 && (
        <div>
          {node.children.map((child, idx) =>
            renderTreeBranch(child, idx === node.children.length - 1)
          )}
        </div>
      )}
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Chatbox"
      subtitle={`${allComments.length} komentar · global`}
      maxWidth="max-w-md"
      noPadding
      compactHeader
    >
      <div className="flex flex-col flex-1 min-h-0">
        {/* Bar Pencarian Komentar */}
        <div className="px-2 py-1.5 border-b border-slate-200/50 dark:border-zinc-800/60 bg-slate-50/40 dark:bg-zinc-900/40 shrink-0">
          <div className="relative">
            <Search className="w-3 h-3 text-slate-400 dark:text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari komentar atau nama..."
              aria-label="Cari komentar atau nama"
              className="w-full h-7 pl-7 pr-7 text-[11px] rounded-lg border border-slate-200/70 dark:border-zinc-800 bg-white/90 dark:bg-zinc-950/80 text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 accent-ring"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Bersihkan pencarian"
                className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 absolute right-1 top-1/2 -translate-y-1/2"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Area Daftar Komentar Compact (5+ bubble muat nyaman) */}
        <div
          ref={listScrollRef}
          className="flex-1 min-h-[260px] max-h-[60vh] sm:max-h-[58vh] overflow-y-auto px-2 py-1.5"
        >
          {activeReadError && (
            <div className="mb-1.5 p-2 rounded-xl border border-rose-500/40 bg-rose-50 dark:bg-rose-950/35 text-rose-700 dark:text-rose-300 text-[11px] leading-snug flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">Gagal terhubung ke Firestore</p>
                <p className="mt-0.5 break-words">{activeReadError}</p>
              </div>
            </div>
          )}

          {loading ? (
            <div className="space-y-1">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="h-11 rounded-xl bg-slate-100 dark:bg-zinc-800/60 animate-pulse"
                />
              ))}
            </div>
          ) : commentThreads.length === 0 ? (
            activeReadError ? null : (
              <div className="h-full min-h-[220px] flex flex-col items-center justify-center text-center px-4">
                <span className="text-3xl mb-2 select-none emote-float" aria-hidden="true">
                  🐰
                </span>
                <p className="text-xs font-medium text-slate-700 dark:text-zinc-200">
                  Belum ada komentar
                </p>
                <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-0.5">
                  Jadi yang pertama yuk (“⌒‿⌒)
                </p>
              </div>
            )
          ) : filteredThreads.length === 0 ? (
            <div className="h-full min-h-[200px] flex flex-col items-center justify-center text-center px-4 space-y-2">
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Tidak ada komentar yang cocok dengan "{searchQuery.trim()}"
              </p>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="h-7 px-3 rounded-lg border border-slate-200 dark:border-zinc-700 text-[11px] font-medium text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800"
              >
                Bersihkan pencarian
              </button>
            </div>
          ) : (
            <div className="space-y-1">
              {filteredThreads.map((thread) => {
                const threadKey = thread.clientId || thread.id;
                const threadPinned = hasPinnedInSubtree(thread);
                const totalReplies = countRepliesInSubtree(thread.children);
                const isExpanded = Boolean(normalizedSearch || expandedThreadIds[threadKey]);
                const { visible: visibleChildren, hiddenCount } = isExpanded
                  ? { visible: thread.children, hiddenCount: 0 }
                  : sliceThreadReplies(thread.children, PREVIEW_REPLY_LIMIT);
                const showToggle = !normalizedSearch && totalReplies > PREVIEW_REPLY_LIMIT;

                return (
                  <div
                    key={thread.id}
                    data-comment-client-id={thread.clientId || undefined}
                    className={`px-2.5 py-1.5 rounded-xl border transition-all animate-fade-in-up ${
                      threadPinned
                        ? 'border-amber-400/70 bg-amber-50/70 dark:bg-amber-950/20'
                        : 'border-slate-200/80 dark:border-zinc-800 bg-slate-50/90 dark:bg-zinc-950/60'
                    } ${thread._optimistic ? 'opacity-80' : ''}`}
                  >
                    {renderCommentContent(thread)}

                    {visibleChildren.length > 0 && (
                      <div>
                        {visibleChildren.map((child, idx) =>
                          renderTreeBranch(
                            child,
                            idx === visibleChildren.length - 1 && !showToggle
                          )
                        )}

                        {showToggle && (
                          <div className="relative pl-[16px] pt-1">
                            <span
                              aria-hidden="true"
                              className="pointer-events-none absolute left-[4px] top-0 w-2.5 h-[11px] border-l border-b border-slate-300 dark:border-zinc-700 rounded-bl-md"
                            />
                            <button
                              type="button"
                              onClick={() => toggleThreadReplies(threadKey)}
                              className="text-[10px] font-medium accent-text hover:underline leading-none py-0.5"
                            >
                              {isExpanded
                                ? 'Sembunyikan balasan'
                                : `Lihat ${hiddenCount} balasan lainnya`}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Panel Emote Lucu (Muncul di Atas Input saat Tombol Emoji Diketuk) */}
        {showEmotes && (
          <div className="mx-2 mb-1.5 p-2 rounded-xl border border-slate-200/80 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/85 animate-pop-in">
            <p className="text-[10px] font-medium text-slate-500 dark:text-zinc-400 mb-1.5">
              Emote lucu — tap untuk sisipkan
            </p>
            <div className="grid grid-cols-8 gap-1">
              {ANIMATED_EMOTE_LIST.map(({ char, anim }) => (
                <button
                  key={char}
                  type="button"
                  onClick={() => appendToMessage(char)}
                  className="h-7 rounded-lg bg-slate-200/65 dark:bg-zinc-900 hover:bg-slate-200 dark:hover:bg-zinc-800 flex items-center justify-center text-sm transition-transform active:scale-90"
                >
                  <span className={anim}>{char}</span>
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-1 pt-1.5 mt-1.5 border-t border-slate-200/70 dark:border-zinc-800/80">
              {KAOMOJI_LIST.map((kaomoji) => (
                <button
                  key={kaomoji}
                  type="button"
                  onClick={() => appendToMessage(kaomoji)}
                  className="h-6 px-2 rounded-lg border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-slate-100 dark:hover:bg-zinc-800 text-[10px] text-slate-700 dark:text-zinc-300 transition-colors active:scale-95"
                >
                  {kaomoji}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Composer 1-Baris Ramping (Nama Inline + Input Komentar) */}
        <form
          onSubmit={handleSend}
          className="px-2 py-1.5 border-t border-slate-200/60 dark:border-zinc-800/70 bg-slate-50/60 dark:bg-zinc-900/70 space-y-1 shrink-0"
        >
          {sendError && (
            <div className="flex items-start justify-between gap-2 px-2 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-500/40 text-[10.5px] text-rose-700 dark:text-rose-300 leading-snug">
              <div className="flex items-start gap-1.5 min-w-0">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span className="break-words">{sendError}</span>
              </div>
              <button
                type="button"
                onClick={() => setSendError('')}
                className="p-0.5 rounded hover:bg-rose-500/15 shrink-0"
                aria-label="Tutup pesan error"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          {replyTo && (
            <div className="flex items-center justify-between gap-2 px-2 py-0.5 rounded-md bg-slate-200/70 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 text-[10px] text-slate-700 dark:text-zinc-300">
              <div className="min-w-0 truncate">
                <span className="font-semibold">Membalas {replyTo.name}: </span>
                <span className="opacity-80">{replyTo.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setReplyTo(null)}
                className="p-0.5 flex items-center justify-center rounded hover:bg-slate-300/60 dark:hover:bg-zinc-700 shrink-0"
                aria-label="Batal balas"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setShowEmotes((v) => !v)}
              aria-label="Pilih emote"
              title="Emote lucu"
              className={`w-8 h-8 flex items-center justify-center rounded-lg border transition-all shrink-0 active:scale-95 ${
                showEmotes
                  ? 'accent-border accent-soft-bg'
                  : 'border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950/80 hover:bg-slate-100 dark:hover:bg-zinc-800'
              }`}
            >
              <span className="text-sm leading-none select-none">😃</span>
            </button>

            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              placeholder="Nama..."
              aria-label="Nama bebas (kosong = Tamu 🐰)"
              title="Kosong = Tamu 🐰"
              className="w-[78px] sm:w-[96px] h-8 px-2 text-[11px] rounded-lg border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950/80 text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 accent-ring shrink-0"
            />

            <input
              ref={messageInputRef}
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={200}
              placeholder="Tulis komentar..."
              aria-label="Tulis komentar (maksimal 200 karakter)"
              className="flex-1 min-w-0 h-8 px-2.5 text-[11.5px] rounded-lg border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950/80 text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 accent-ring"
            />

            {message.length >= 160 && (
              <span className="text-[9.5px] font-mono tabular-nums text-slate-400 dark:text-zinc-500 shrink-0 px-0.5">
                {message.length}/200
              </span>
            )}

            <button
              type="submit"
              disabled={!message.trim()}
              aria-label="Kirim komentar"
              title="Kirim"
              className="w-8 h-8 rounded-lg accent-bg text-white flex items-center justify-center disabled:opacity-40 transition-all shrink-0 active:scale-95"
            >
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Hapus Komentar"
        message={`Hapus komentar dari "${deleteTarget?.name || 'Tamu 🐰'}"?`}
        detail={deleteTarget?.message}
        loading={deleting}
      />
    </Modal>
  );
}
