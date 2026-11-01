'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { EditorContent, getHTMLFromFragment, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import { Color, TextStyle } from '@tiptap/extension-text-style';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { DatabaseEmbedExtension, InsertDatabaseButton } from '@/components/databases/DatabaseEmbed';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';
import { Note, NoteAttachment, NoteImage, NoteLink, NoteRole } from '@/types/notes';
import { compressImageForNote } from '@/utils/image';
import { formatCLP } from '@/utils/formatters';
import { formatMathValue, trailingExpression } from '@/utils/mathText';
import { VoiceNoteRecorder, type FinishedRecording } from '@/components/notes/VoiceNoteRecorder';
import { clock, extOfMime, voiceVault } from '@/utils/voiceVault';
import { IMPROVE_LABEL, MAX_IMPROVE_CHARS, protectEmbeds, restoreEmbeds, type ImproveMode } from '@/utils/noteImprove';
import {
  Draft,
  LINK_TYPE_LABEL,
  NoteImageStore,
  NoteInput,
  ROLE_LABEL,
  colorOf,
  formatFileSize,
  formatNoteDate,
  isDraftEmpty,
} from '@/utils/notes';
import { CategoryList, ColorSwatches, MenuDivider, MenuItem, Popover, initialsOf, peerColor } from '@/components/notes/NoteMenus';
import { TextColorPicker } from '@/components/notes/TextColorPicker';
import {
  AlertTriangle,
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Archive,
  ArchiveRestore,
  Bold,
  Calculator,
  Table2,
  ChevronLeft,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileText,
  ImagePlus,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Loader2,
  LogOut,
  Mic,
  Sparkles,
  CloudOff,
  Wand2,
  AudioLines,
  MoreHorizontal,
  Paperclip,
  Pin,
  PinOff,
  Redo2,
  Share2,
  Strikethrough,
  Tag,
  Trash2,
  Underline as UnderlineIcon,
  Undo2,
  Unlink,
  X,
} from 'lucide-react';
import { authFetch } from '@/lib/authFetch';

const SAVE_DEBOUNCE_MS = 600;
const MIN_IMAGE_PX = 60;
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

const signature = (d: Draft) => `${d.title} ${d.bodyHtml} ${JSON.stringify(d.images)} ${JSON.stringify(d.attachments)}`;

function formatFullDate(iso: string): string {
  return new Date(iso).toLocaleString('es-CL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Accepts "google.com", "https://…", "correo@dominio.cl"; rejects javascript:, data:, etc.
function normalizeUrl(input: string): string | null {
  const v = input.trim();
  if (!v) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(v)
    ? v
    : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
    ? `mailto:${v}`
    : `https://${v}`;
  try {
    const u = new URL(withScheme);
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(u.protocol) ? u.href : null;
  } catch {
    return null;
  }
}

/** Voice recordings saved in a note (Emanuel, 2026-10-28). `pending` = still only on this device (offline). */
type VoiceAttachment = NoteAttachment & { voice?: true; seconds?: number; pending?: string; needsText?: boolean };
const isVoice = (a: NoteAttachment): a is VoiceAttachment => Boolean((a as VoiceAttachment).voice) || a.mime.startsWith('audio/');
const escapeText = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// --- Free-floating picture ---------------------------------------------------

interface NoteImageItemProps {
  img: NoteImage;
  url?: string;
  canvasW: number;
  selected: boolean;
  readOnly: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<NoteImage>) => void;
  onDelete: () => void;
}

const NoteImageItem: React.FC<NoteImageItemProps> = ({ img, url, canvasW, selected, readOnly, onSelect, onChange, onDelete }) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ mode: 'move' | 'resize'; startX: number; startY: number; orig: NoteImage } | null>(null);

  const begin = (e: React.PointerEvent, mode: 'move' | 'resize') => {
    if (readOnly) return;
    e.stopPropagation();
    e.preventDefault();
    wrapRef.current?.setPointerCapture(e.pointerId);
    drag.current = { mode, startX: e.clientX, startY: e.clientY, orig: img };
    onSelect();
  };

  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || canvasW <= 0) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (d.mode === 'move') {
      onChange({
        x: clamp(d.orig.x + dx / canvasW, 0, 1 - d.orig.w),
        y: Math.max(0, d.orig.y + dy),
      });
    } else {
      onChange({ w: clamp((d.orig.w * canvasW + dx) / canvasW, MIN_IMAGE_PX / canvasW, 1 - d.orig.x) });
    }
  };

  const end = (e: React.PointerEvent) => {
    if (drag.current) wrapRef.current?.releasePointerCapture(e.pointerId);
    drag.current = null;
  };

  const width = img.w * canvasW;
  return (
    <div
      ref={wrapRef}
      onPointerDown={(e) => begin(e, 'move')}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      style={{ left: img.x * canvasW, top: img.y, width, height: width * img.ratio }}
      className={`absolute z-10 touch-none select-none rounded-lg shadow-[0_10px_24px_-8px_rgba(0,0,0,0.7)] ${
        readOnly ? '' : 'cursor-move'
      } ${selected ? 'ring-2 ring-zinc-900/80' : ''}`}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" draggable={false} className="pointer-events-none h-full w-full rounded-lg object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center rounded-lg bg-black/10">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-900/50" />
        </div>
      )}
      {selected && !readOnly && (
        <>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onDelete}
            title="Quitar imagen"
            className="absolute -right-2.5 -top-2.5 flex h-7 w-7 items-center justify-center rounded-full bg-zinc-900 text-white shadow-lg ring-1 ring-white/15 hover:bg-rose-600"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <span
            onPointerDown={(e) => begin(e, 'resize')}
            title="Cambiar tamaño"
            className="absolute -bottom-2.5 -right-2.5 h-5 w-5 cursor-nwse-resize rounded-full border-2 border-white bg-zinc-900 shadow-lg"
          />
        </>
      )}
    </div>
  );
};

// --- Toolbar bits -------------------------------------------------------------

const TB: React.FC<{
  title: string;
  onClick: (e?: React.MouseEvent<HTMLButtonElement>) => void;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}> = ({ title, onClick, active, disabled, children }) => (
  <button
    type="button"
    title={title}
    aria-label={title}
    disabled={disabled}
    onMouseDown={(e) => e.preventDefault()}
    onClick={onClick}
    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors disabled:opacity-30 ${
      active ? 'bg-zinc-900 text-white' : 'text-zinc-900/75 hover:bg-black/10'
    }`}
  >
    {children}
  </button>
);

const Divider = () => <span className="mx-1 h-5 w-px shrink-0 bg-black/15" />;

// --- Editor -------------------------------------------------------------------

export type NoteEditorAction = 'share' | 'archive' | 'unarchive' | 'duplicate' | 'trash' | 'leave';

interface Peer {
  key: string;
  name: string;
}

interface NoteEditorProps {
  initial: Draft;
  imageStore: NoteImageStore;
  onCreate: (input: NoteInput) => Promise<string | null>;
  onUpdate: (id: string, patch: Partial<Note>) => Promise<boolean>;
  /** Permanent delete — only used to discard a note that was emptied out. */
  onDelete: (id: string) => Promise<unknown>;
  onClose: () => void;
  /** Top-left back label — defaults to "Notas". */
  backLabel?: string;
  /** owner (default) / editor can write; viewer is read-only. */
  role?: NoteRole;
  /** 'full' = whole screen (locks page scroll); 'panel' = side/center/floating window. */
  layout?: 'full' | 'panel';
  /** "VINCULADO A" — the movement/transfer this note belongs to. */
  linkedInfo?: NoteLink | null;
  meta?: { createdByName?: string | null; createdAt?: string | null; participants?: string[]; archived?: boolean };
  categories?: string[];
  onAddCategory?: (name: string) => void;
  /** Share / archive / duplicate / trash / leave — handled by the host, which knows the collections. */
  onAction?: (action: NoteEditorAction, noteId: string) => void;
  /** Rendered at the right of the header (view-mode switcher, minimize...). */
  headerExtras?: React.ReactNode;
  onHeaderPointerDown?: (e: React.PointerEvent) => void;
  onIdChange?: (id: string) => void;
  /** A collaborator's change arrived — lets the host refresh its list without a refetch. */
  onRemoteChange?: (id: string, patch: Partial<Note>) => void;
  /** Name shown to the other people on this note (presence). */
  presenceName?: string;
  /**
   * Re-reads the note through an authorized path when a collaborator saves
   * (the live channel only carries a "changed" ping, never content). Default:
   * a normal RLS-checked select; the public link page passes get_shared_note.
   */
  loadLatest?: (id: string) => Promise<Partial<Note> | null>;
  /** Banner under the header (e.g. the share page's "guardar en mi cuenta"). */
  topSlot?: React.ReactNode;
  /** Extra actions at the very bottom of the page (e.g. a Daily task's Archivar / Borrar). */
  footer?: React.ReactNode;
}

export const NoteEditor: React.FC<NoteEditorProps> = ({
  initial,
  imageStore,
  onCreate,
  onUpdate,
  onDelete,
  onClose,
  backLabel,
  role = 'owner',
  layout = 'full',
  linkedInfo,
  meta,
  categories = [],
  onAddCategory,
  onAction,
  headerExtras,
  onHeaderPointerDown,
  onIdChange,
  onRemoteChange,
  presenceName = 'Alguien',
  topSlot,
  loadLatest,
  footer,
}) => {
  const readOnly = role === 'viewer';
  const [draft, setDraft] = useState(initial);
  const [noteId, setNoteId] = useState<string | null>(initial.id);
  const [stamp, setStamp] = useState(initial.updatedAt ?? new Date().toISOString());
  const [saveError, setSaveError] = useState(false);
  const [notice, setNotice] = useState('');
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [canvasW, setCanvasW] = useState(0);
  const [linkEditing, setLinkEditing] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkError, setLinkError] = useState('');
  const [recOpen, setRecOpen] = useState(false);
  const [micSupported, setMicSupported] = useState(false);
  const [voiceUrls, setVoiceUrls] = useState<Record<string, string>>({});
  const [transcribing, setTranscribing] = useState<string[]>([]);
  const [aiMenu, setAiMenu] = useState<{ x: number; y: number } | null>(null);
  const [aiBusy, setAiBusy] = useState<ImproveMode | null>(null);
  const [aiDone, setAiDone] = useState<string | null>(null);
  const [calcBusy, setCalcBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState<null | 'more' | 'category' | 'color'>(null);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [lastRemote, setLastRemote] = useState<{ name: string; at: number } | null>(null);
  const [, forceTick] = useState(0);

  const draftRef = useRef(initial);
  const idRef = useRef<string | null>(initial.id);
  const savedSig = useRef(signature(initial));
  const chain = useRef<Promise<void>>(Promise.resolve());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closing = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const attachRef = useRef<HTMLInputElement>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const clientKey = useRef(typeof crypto !== 'undefined' ? crypto.randomUUID() : String(Math.random()));
  const imageUrlsRef = useRef<Record<string, string>>({});
  imageUrlsRef.current = imageUrls;
  const stampRef = useRef(stamp);
  stampRef.current = stamp;
  const cbs = useRef({ onCreate, onUpdate, onDelete, onClose, imageStore, onIdChange, onRemoteChange, onAction, loadLatest });
  cbs.current = { onCreate, onUpdate, onDelete, onClose, imageStore, onIdChange, onRemoteChange, onAction, loadLatest };

  const notify = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(''), 4500);
  }, []);

  // Only a "changed" ping goes over the live channel — never the note's
  // content. Receivers re-read the note with their own permissions, so a
  // listener without access learns nothing and a forged ping can't inject text.
  const broadcast = useCallback(
    (_d: Draft, updatedAt: string) => {
      channelRef.current?.send({ type: 'broadcast', event: 'update', payload: { updatedAt, by: presenceName } });
    },
    [presenceName]
  );

  // Saves run strictly one after another, always reading the latest draft, so a
  // slow "create" can never race a follow-up edit into inserting a duplicate row.
  const persist = useCallback((): Promise<void> => {
    chain.current = chain.current.then(async () => {
      if (readOnly) return;
      const d = draftRef.current;
      const sig = signature(d);
      const contentChanged = sig !== savedSig.current;
      if (!idRef.current) {
        if (isDraftEmpty(d)) return;
        const id = await cbs.current.onCreate({
          title: d.title,
          body: d.body,
          bodyHtml: d.bodyHtml,
          images: d.images,
          attachments: d.attachments,
          color: d.color,
          pinned: d.pinned,
          category: d.category,
          links: d.links,
          linkedMovementId: d.linkedMovementId ?? null,
        });
        if (id) {
          idRef.current = id;
          setNoteId(id);
          cbs.current.onIdChange?.(id);
          savedSig.current = sig;
        }
        setSaveError(!id);
      } else {
        const updatedAt = new Date().toISOString();
        const ok = await cbs.current.onUpdate(idRef.current, {
          title: d.title,
          body: d.body,
          bodyHtml: d.bodyHtml,
          images: d.images,
          attachments: d.attachments,
          color: d.color,
          pinned: d.pinned,
          category: d.category,
          ...(contentChanged ? { updatedAt } : {}),
        });
        if (ok) {
          savedSig.current = sig;
          broadcast(d, contentChanged ? updatedAt : stampRef.current);
        }
        setSaveError(!ok);
      }
    });
    return chain.current;
  }, [readOnly, broadcast]);

  const change = useCallback(
    (patch: Partial<Draft>, touchesContent: boolean) => {
      if (readOnly) return;
      const next = { ...draftRef.current, ...patch };
      draftRef.current = next;
      setDraft(next);
      if (touchesContent) setStamp(new Date().toISOString());
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        persist();
      }, SAVE_DEBOUNCE_MS);
    },
    [persist, readOnly]
  );

  const requireUpload = () => {
    if (imageStore.canUpload === false) {
      notify('Para adjuntar imágenes o archivos necesitas una cuenta de Master Finanzas.');
      return false;
    }
    return true;
  };

  // --- Picture upload (also used by paste) ---
  const insertImageFile = async (file: File) => {
    if (!requireUpload()) return;
    if (!file.type.startsWith('image/')) {
      notify('Ese archivo no es una imagen.');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      notify('La imagen es muy pesada (máximo 15MB).');
      return;
    }
    setUploading(true);
    try {
      const { blob, width, height, ext } = await compressImageForNote(file);
      const path = await cbs.current.imageStore.upload(blob, ext);
      if (!path) {
        notify('No se pudo subir la imagen. Intenta de nuevo.');
        return;
      }
      setImageUrls((prev) => ({ ...prev, [path]: URL.createObjectURL(blob) }));
      const cw = canvasRef.current?.clientWidth || 640;
      const w = clamp(320 / cw, 0.2, 0.6);
      const img: NoteImage = {
        id: crypto.randomUUID(),
        path,
        x: (1 - w) / 2,
        y: (scrollRef.current?.scrollTop ?? 0) + 80,
        w,
        ratio: height / width,
      };
      change({ images: [...draftRef.current.images, img] }, true);
      setSelectedImage(img.id);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'No se pudo insertar la imagen.');
    } finally {
      setUploading(false);
    }
  };
  const insertImageRef = useRef(insertImageFile);
  insertImageRef.current = insertImageFile;

  const updateImage = (id: string, patch: Partial<NoteImage>) =>
    change({ images: draftRef.current.images.map((i) => (i.id === id ? { ...i, ...patch } : i)) }, true);

  const removeImage = (id: string) => {
    const target = draftRef.current.images.find((i) => i.id === id);
    change({ images: draftRef.current.images.filter((i) => i.id !== id) }, true);
    setSelectedImage(null);
    if (target) cbs.current.imageStore.remove([target.path]).catch(() => {});
  };

  // --- Attachments (documents, PDFs, spreadsheets...) ---
  const attachFile = async (file: File) => {
    if (!requireUpload()) return;
    if (file.size > MAX_ATTACHMENT_BYTES) {
      notify('El archivo es muy pesado (máximo 25MB).');
      return;
    }
    setUploading(true);
    try {
      const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
      const path = await cbs.current.imageStore.upload(file, ext);
      if (!path) {
        notify('No se pudo subir el archivo. Intenta de nuevo.');
        return;
      }
      const att: NoteAttachment = { id: crypto.randomUUID(), path, name: file.name, size: file.size, mime: file.type || 'application/octet-stream' };
      change({ attachments: [...draftRef.current.attachments, att] }, true);
    } finally {
      setUploading(false);
    }
  };

  const removeAttachment = (id: string) => {
    const target = draftRef.current.attachments.find((a) => a.id === id) as VoiceAttachment | undefined;
    change({ attachments: draftRef.current.attachments.filter((a) => a.id !== id) }, true);
    if (target?.path) cbs.current.imageStore.remove([target.path]).catch(() => {});
    if (target?.pending) voiceVault.remove(target.pending);
  };

  // A signed URL has to be fetched first, so a plain <a> can't be used —
  // open the tab synchronously (keeps the click's popup trust), then redirect it.
  const openAttachment = (att: NoteAttachment) => {
    const tab = window.open('', '_blank');
    cbs.current.imageStore.getUrls([att.path]).then((map) => {
      const url = map[att.path];
      if (!url) {
        tab?.close();
        notify('No se pudo abrir el archivo.');
        return;
      }
      if (tab) tab.location.href = url;
    });
  };

  // Signed URLs for pictures we don't already have a local preview of.
  useEffect(() => {
    const missing = draft.images.map((i) => i.path).filter((p) => !(p in imageUrlsRef.current));
    if (missing.length === 0) return;
    let cancelled = false;
    cbs.current.imageStore.getUrls(missing).then((map) => {
      if (!cancelled) setImageUrls((prev) => ({ ...prev, ...map }));
    });
    return () => {
      cancelled = true;
    };
  }, [draft.images]);

  // --- Rich text ---
  const editor = useEditor({
    immediatelyRender: false,
    editable: !readOnly,
    extensions: [
      // Link is configured separately (not via StarterKit) so typing right after
      // a link doesn't extend it — TipTap's default makes the mark inclusive.
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: false }),
      Link.extend({
        inclusive() {
          return false;
        },
      }).configure({ openOnClick: readOnly, autolink: true, defaultProtocol: 'https' }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      // Text color on selected text (stored as <span style="color: …"> in bodyHtml).
      TextStyle,
      Color,
      TaskList,
      TaskItem.configure({ nested: true }),
      // Notion-style database inside the note (components/databases/DatabaseEmbed.tsx).
      DatabaseEmbedExtension,
      Placeholder.configure({ placeholder: readOnly ? '' : 'Escribe aquí… detalles, pendientes, contexto del movimiento.' }),
    ],
    content: initial.bodyHtml,
    editorProps: {
      attributes: { class: 'note-prose', spellcheck: 'true' },
      // Typing "=" after an arithmetic expression fills in the answer: "2+2=" -> "2+2 = 4".
      handleTextInput: (view, from, to, text) => {
        if (text !== '=') return false;
        const $from = view.state.doc.resolve(from);
        const before = $from.parent.textBetween(0, $from.parentOffset, undefined, '￼');
        const expr = trailingExpression(before);
        if (!expr) return false;
        const lead = /\s$/.test(before) ? '' : ' ';
        view.dispatch(view.state.tr.insertText(`${lead}= ${formatMathValue(expr.value)}`, from, to));
        return true;
      },
      handlePaste: (_view, event) => {
        const file = Array.from(event.clipboardData?.files ?? []).find((f) => f.type.startsWith('image/'));
        if (!file) return false;
        insertImageRef.current(file);
        return true;
      },
    },
    onUpdate: ({ editor: ed }) => {
      change({ body: ed.getText({ blockSeparator: '\n' }), bodyHtml: ed.getHTML() }, true);
    },
  });
  const editorRef = useRef(editor);
  editorRef.current = editor;

  const ui = useEditorState({
    editor,
    selector: ({ editor: ed }) => {
      if (!ed) return null;
      return {
        bold: ed.isActive('bold'),
        italic: ed.isActive('italic'),
        underline: ed.isActive('underline'),
        strike: ed.isActive('strike'),
        color: (ed.getAttributes('textStyle').color as string | undefined) ?? null,
        bulletList: ed.isActive('bulletList'),
        orderedList: ed.isActive('orderedList'),
        taskList: ed.isActive('taskList'),
        link: ed.isActive('link'),
        linkHref: (ed.getAttributes('link').href as string | undefined) ?? '',
        alignLeft: ed.isActive({ textAlign: 'left' }),
        alignCenter: ed.isActive({ textAlign: 'center' }),
        alignRight: ed.isActive({ textAlign: 'right' }),
        alignJustify: ed.isActive({ textAlign: 'justify' }),
        inList: ed.isActive('listItem') || ed.isActive('taskItem'),
        style: ed.isActive('heading', { level: 1 })
          ? 'h1'
          : ed.isActive('heading', { level: 2 })
          ? 'h2'
          : ed.isActive('heading', { level: 3 })
          ? 'h3'
          : ed.isActive('codeBlock')
          ? 'code'
          : 'p',
        canUndo: ed.can().undo(),
        canRedo: ed.can().redo(),
      };
    },
  });

  // --- Real-time collaboration --------------------------------------------
  // Everyone with the note open (partners, members, link viewers — even
  // without an account) joins one broadcast+presence channel per note.
  // Content is last-writer-wins at the note level: a remote change is
  // applied unless you have an unsaved local edit in flight, in which case
  // your save (a moment later) wins and is broadcast back to them.
  useEffect(() => {
    if (!noteId) return;
    const ch = supabase.channel(`note-live-${noteId}`, {
      config: { presence: { key: clientKey.current }, broadcast: { self: false } },
    });
    ch.on('broadcast', { event: 'update' }, async ({ payload }) => {
      const ping = payload as { by?: string };
      if (timer.current) return; // local pending edit wins
      const load =
        cbs.current.loadLatest ??
        (async (id: string) => {
          const { data } = await supabase
            .from('notes')
            .select('title, body, "bodyHtml", images, attachments, color, category, pinned, "updatedAt"')
            .eq('id', id)
            .maybeSingle();
          return (data as Partial<Note> | null) ?? null;
        });
      const fresh = await load(noteId).catch(() => null);
      if (!fresh || timer.current) return;
      const p = { ...(fresh as Partial<Draft>), updatedAt: fresh.updatedAt ?? '', by: typeof ping.by === 'string' ? ping.by.slice(0, 60) : undefined };
      const fields: Partial<Draft> = {
        title: p.title ?? draftRef.current.title,
        body: p.body ?? draftRef.current.body,
        bodyHtml: p.bodyHtml ?? draftRef.current.bodyHtml,
        images: p.images ?? draftRef.current.images,
        attachments: p.attachments ?? draftRef.current.attachments,
        color: p.color ?? draftRef.current.color,
        category: p.category === undefined ? draftRef.current.category : p.category,
        pinned: p.pinned ?? draftRef.current.pinned,
      };
      const next = { ...draftRef.current, ...fields };
      draftRef.current = next;
      savedSig.current = signature(next);
      setDraft(next);
      if (p.updatedAt) setStamp(p.updatedAt);
      const ed = editorRef.current;
      if (ed && fields.bodyHtml !== undefined && fields.bodyHtml !== ed.getHTML()) {
        const { from, to } = ed.state.selection;
        ed.commands.setContent(fields.bodyHtml, { emitUpdate: false });
        const size = ed.state.doc.content.size;
        try {
          ed.commands.setTextSelection({ from: Math.min(from, size), to: Math.min(to, size) });
        } catch {
          /* selection no longer valid */
        }
      }
      if (p.by) setLastRemote({ name: p.by, at: Date.now() });
      cbs.current.onRemoteChange?.(noteId, { ...fields, updatedAt: p.updatedAt } as Partial<Note>);
    })
      .on('presence', { event: 'sync' }, () => {
        const state = ch.presenceState<{ name: string }>();
        const list: Peer[] = [];
        Object.entries(state).forEach(([key, metas]) => {
          if (key === clientKey.current) return;
          const m = metas[0];
          if (m) list.push({ key, name: m.name || 'Invitado' });
        });
        setPeers(list);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') ch.track({ name: presenceName });
      });
    channelRef.current = ch;
    return () => {
      channelRef.current = null;
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  // "Emanuel está editando" fades out a few seconds after their last change.
  useEffect(() => {
    if (!lastRemote) return;
    const t = setTimeout(() => forceTick((x) => x + 1), 4000);
    return () => clearTimeout(t);
  }, [lastRemote]);
  const editingName = lastRemote && Date.now() - lastRemote.at < 4000 ? lastRemote.name : null;

  const setBlockStyle = (value: string) => {
    if (!editor) return;
    const c = editor.chain().focus();
    if (value === 'h1') c.setHeading({ level: 1 }).run();
    else if (value === 'h2') c.setHeading({ level: 2 }).run();
    else if (value === 'h3') c.setHeading({ level: 3 }).run();
    else if (value === 'code') c.setCodeBlock().run();
    else c.setParagraph().run();
  };

  const indent = (dir: 'in' | 'out') => {
    if (!editor) return;
    const type = editor.isActive('taskItem') ? 'taskItem' : 'listItem';
    const c = editor.chain().focus();
    (dir === 'in' ? c.sinkListItem(type) : c.liftListItem(type)).run();
  };

  // --- Links ---
  const startLinkEdit = () => {
    setLinkUrl(ui?.linkHref ?? '');
    setLinkError('');
    setLinkEditing(true);
    setTimeout(() => linkInputRef.current?.focus(), 0);
  };
  const applyLink = () => {
    if (!editor) return;
    const url = normalizeUrl(linkUrl);
    if (!url) {
      setLinkError('Ese enlace no es válido.');
      return;
    }
    if (editor.isActive('link')) editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    else if (editor.state.selection.empty)
      editor
        .chain()
        .focus()
        .insertContent({ type: 'text', text: linkUrl.trim(), marks: [{ type: 'link', attrs: { href: url } }] })
        .run();
    else editor.chain().focus().setLink({ href: url }).run();
    setLinkEditing(false);
  };
  const removeLink = () => {
    editor?.chain().focus().extendMarkRange('link').unsetLink().run();
    setLinkEditing(false);
  };

  // --- Voice notes: record (audio is kept), live text, offline-safe ---
  /** Text at the cursor (or at the end) as its own paragraph. */
  const insertTranscript = (text: string) => {
    const ed = editorRef.current;
    const t = text.trim();
    if (!ed || !t) return;
    const html = t
      .split(/\n+/)
      .map((l) => `<p>${escapeText(l.trim())}</p>`)
      .join('');
    if (ed.isFocused) ed.chain().focus().insertContent(html).run();
    else {
      const empty = ed.state.doc.textContent.trim() === '' && ed.state.doc.childCount <= 1;
      if (empty) ed.chain().focus().setContent(html).run();
      else ed.chain().focus('end').insertContentAt(ed.state.doc.content.size, html).run();
    }
  };

  const patchVoice = (id: string, patch: Partial<VoiceAttachment>) =>
    change({ attachments: draftRef.current.attachments.map((a) => (a.id === id ? ({ ...a, ...patch } as NoteAttachment) : a)) }, true);

  const transcribeVoice = async (att: VoiceAttachment, insert = true) => {
    if (!att.path || transcribing.includes(att.id)) return;
    setTranscribing((t) => [...t, att.id]);
    try {
      const res = await authFetch('/api/notes/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: att.path }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return notify(data.error || 'No se pudo transcribir el audio. El audio quedó guardado.');
      patchVoice(att.id, { needsText: false });
      if (insert) {
        if (data.text?.trim()) insertTranscript(data.text);
        else notify('No se entendió nada en el audio, pero quedó guardado.');
      }
    } catch {
      notify('Sin conexión: el texto se hará cuando vuelva la señal. El audio está guardado.');
    } finally {
      setTranscribing((t) => t.filter((x) => x !== att.id));
    }
  };

  /** Uploads a recording that's waiting on this device. Returns the uploaded path, or null. */
  const uploadingVoice = useRef(new Set<string>());
  const uploadVoice = async (att: VoiceAttachment): Promise<string | null> => {
    if (!att.pending) return att.path || null;
    // The "back online" flush and the end of a recording can race — one upload per recording.
    if (uploadingVoice.current.has(att.id)) return null;
    uploadingVoice.current.add(att.id);
    try {
      return await uploadVoiceNow(att, att.pending);
    } finally {
      uploadingVoice.current.delete(att.id);
    }
  };
  const uploadVoiceNow = async (att: VoiceAttachment, pending: string): Promise<string | null> => {
    const blob = await voiceVault.blob(pending);
    if (!blob) return null;
    const path = await cbs.current.imageStore.upload(blob, extOfMime(blob.type)).catch(() => null);
    if (!path) return null;
    const sessionId = pending;
    const next = { ...att, path, size: blob.size, pending: undefined };
    patchVoice(att.id, { path, size: blob.size, pending: undefined });
    await voiceVault.remove(sessionId);
    if (att.needsText) transcribeVoice(next);
    return path;
  };

  const handleRecording = async (r: FinishedRecording) => {
    const when = new Date().toLocaleString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    const ext = extOfMime(r.mime);
    const att: VoiceAttachment = {
      id: crypto.randomUUID(),
      path: '',
      name: `Nota de voz · ${when}.${ext}`,
      size: r.blob.size,
      mime: r.mime.split(';')[0] || 'audio/webm',
      voice: true,
      seconds: Math.round(r.seconds),
      pending: r.sessionId,
      needsText: !r.transcript.trim(),
    };
    if (r.transcript.trim()) insertTranscript(r.transcript);
    if (r.cut) notify('Se cortó el micrófono. Guardé todo lo que alcanzaste a grabar.');
    change({ attachments: [...draftRef.current.attachments, att] }, true);
    const path = imageStore.canUpload === false ? null : await uploadVoice(att);
    if (!path) notify(imageStore.canUpload === false ? 'El audio quedó en este dispositivo (necesitas una cuenta para subirlo).' : 'Sin conexión: el audio quedó guardado en este dispositivo y se sube solo cuando vuelva la señal.');
  };

  // Recordings still on this device → upload when the connection is back (and when the note opens).
  const pendingKey = draft.attachments
    .filter((a) => (a as VoiceAttachment).pending)
    .map((a) => a.id)
    .join(',');
  useEffect(() => {
    if (!pendingKey || readOnly || imageStore.canUpload === false) return;
    const flush = () => {
      if (!navigator.onLine) return;
      draftRef.current.attachments.forEach((a) => (a as VoiceAttachment).pending && uploadVoice(a as VoiceAttachment));
    };
    flush();
    window.addEventListener('online', flush);
    const iv = setInterval(flush, 30000);
    return () => {
      window.removeEventListener('online', flush);
      clearInterval(iv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingKey]);

  const playVoice = async (att: VoiceAttachment) => {
    if (voiceUrls[att.id]) return;
    if (att.pending) {
      const blob = await voiceVault.blob(att.pending);
      if (blob) setVoiceUrls((u) => ({ ...u, [att.id]: URL.createObjectURL(blob) }));
      return;
    }
    const map = await cbs.current.imageStore.getUrls([att.path]);
    if (map[att.path]) setVoiceUrls((u) => ({ ...u, [att.id]: map[att.path] }));
    else notify('No se pudo cargar el audio.');
  };

  // --- "Mejorar redacción" / "Mejorar visual" (AI) ---
  const runImprove = async (mode: ImproveMode) => {
    const ed = editorRef.current;
    setAiMenu(null);
    if (!ed || aiBusy) return;
    const { from, to, empty } = ed.state.selection;
    const whole = empty || to - from < 2;
    const raw = whole ? ed.getHTML() : getHTMLFromFragment(ed.state.doc.slice(from, to).content, ed.schema);
    if (!ed.state.doc.textBetween(whole ? 0 : from, whole ? ed.state.doc.content.size : to, ' ').trim()) {
      return notify('Escribe o dicta algo primero.');
    }
    const { html, ids } = protectEmbeds(raw);
    if (html.length > MAX_IMPROVE_CHARS) return notify('La nota es muy larga para mejorarla de una vez. Selecciona una parte.');
    setAiBusy(mode);
    setAiDone(null);
    try {
      const res = await authFetch('/api/notes/improve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html, mode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.html) return notify(data.error || 'No se pudo mejorar la nota. Intenta de nuevo.');
      const out = restoreEmbeds(String(data.html), ids);
      const cur = editorRef.current;
      if (!cur) return;
      // One undoable step: ⌘Z (or "Deshacer") brings the original back.
      if (whole) cur.chain().focus().insertContentAt({ from: 0, to: cur.state.doc.content.size }, out).run();
      else cur.chain().focus().insertContentAt({ from, to }, out).run();
      setAiDone(IMPROVE_LABEL[mode].done);
      setTimeout(() => setAiDone((d) => (d === IMPROVE_LABEL[mode].done ? null : d)), 12000);
    } catch {
      notify('No se pudo conectar con la IA.');
    } finally {
      setAiBusy(null);
    }
  };

  // --- Smart calculation button ---
  const runCalculate = async () => {
    const ed = editor;
    if (!ed || calcBusy) return;
    const { selection } = ed.state;
    let text: string;
    let insertAt: number;
    let replaceFrom: number | null = null;

    if (!selection.empty) {
      text = ed.state.doc.textBetween(selection.from, selection.to, ' ');
      insertAt = selection.to;
    } else {
      const { $from } = selection;
      const block = $from.parent;
      if (!block.isTextblock) return;
      let onlyText = true;
      block.forEach((n) => {
        if (!n.isText) onlyText = false;
      });
      text = block.textContent;
      insertAt = $from.end();
      // Pressing Calcular again refreshes an existing "= result" instead of stacking a second one.
      const eq = text.indexOf('=');
      if (eq !== -1 && onlyText) {
        replaceFrom = $from.start() + eq;
        text = text.slice(0, eq);
      }
    }
    if (!text.trim()) {
      notify('Escribe una operación primero, por ejemplo 2500 + 1300.');
      return;
    }

    let value: number | null = trailingExpression(text)?.value ?? null;
    if (value === null) {
      setCalcBusy(true);
      try {
        const res = await authFetch('/api/calculator-solve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transcript: text.trim() }),
        });
        const data = await res.json();
        if (!res.ok) {
          notify(data.error || 'No se pudo calcular.');
          return;
        }
        if (!data.understood) {
          notify('No encontré una operación que calcular en ese texto.');
          return;
        }
        value = data.result as number;
      } catch {
        notify('No se pudo conectar para calcular.');
        return;
      } finally {
        setCalcBusy(false);
      }
    }
    const lead = /\s$/.test(text) && replaceFrom === null ? '' : ' ';
    ed.chain()
      .focus()
      .insertContentAt(
        replaceFrom !== null ? { from: replaceFrom, to: insertAt } : insertAt,
        `${lead}= ${formatMathValue(value!)}`
      )
      .run();
  };

  // --- Closing ---
  const stopAll = useCallback(() => {
    setRecOpen(false);
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const handleClose = async () => {
    if (closing.current) return;
    closing.current = true;
    stopAll();
    await persist();
    const d = draftRef.current;
    const empty = isDraftEmpty(d);
    if (!readOnly && !idRef.current && !empty) {
      // The note never reached the database — don't silently throw the text away.
      if (!window.confirm('No se pudo guardar esta nota. ¿Cerrar de todos modos y perderla?')) {
        closing.current = false;
        return;
      }
    }
    if (role === 'owner' && idRef.current && empty) await cbs.current.onDelete(idRef.current);
    cbs.current.onClose();
  };

  // Flushes pending edits before handing the action to the host.
  const runAction = async (action: NoteEditorAction) => {
    setMenuOpen(null);
    if (action === 'trash' && !idRef.current) {
      closing.current = true;
      stopAll();
      cbs.current.onClose();
      return;
    }
    if (!readOnly) {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      await persist();
    }
    if (!idRef.current) {
      notify('Escribe algo en la nota primero.');
      return;
    }
    if (action === 'trash' || action === 'leave') {
      closing.current = true;
      stopAll();
    }
    cbs.current.onAction?.(action, idRef.current);
  };

  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  // Full screen hides the page behind it; side/floating windows leave it usable.
  useEffect(() => {
    if (layout !== 'full') return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [layout]);

  const closeRef = useRef(handleClose);
  closeRef.current = handleClose;
  const linkEditingRef = useRef(false);
  linkEditingRef.current = linkEditing;

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setCanvasW(el.clientWidth));
    ro.observe(el);
    setCanvasW(el.clientWidth);

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // In a side panel / floating window the rest of the app is still usable —
      // only react to Escape when the focus is actually inside this note.
      if (layoutRef.current === 'panel' && !rootRef.current?.contains(document.activeElement)) return;
      if (linkEditingRef.current) setLinkEditing(false);
      else closeRef.current();
    };
    window.addEventListener('keydown', onKey);
    setMicSupported(typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia));
    if (initial.id === null) titleRef.current?.focus();
    return () => {
      ro.disconnect();
      window.removeEventListener('keydown', onKey);
      // Swapping to another note (or switching view mode) unmounts this
      // editor — don't drop an edit that was still waiting for its debounce.
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
        persist();
      }
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const colors = colorOf(draft.color);
  // A movement's note uses the app's graphite look (see .note-dark in globals.css), not a post-it color.
  const movementNote = Boolean(draft.linkedMovementId);
  // A Daily task's page follows the app's theme (Emanuel, 2026-10-27: dark app → dark page, light → light).
  const taskPage = (draft.links ?? []).some((l) => l.type === 'task');
  const darkPage = movementNote || (taskPage && !(typeof document !== 'undefined' && document.documentElement.dataset.theme === 'light'));
  const canvasMinHeight = draft.images.reduce((max, i) => Math.max(max, i.y + i.w * canvasW * i.ratio + 80), 0);
  const iconBtn =
    'flex h-8 w-8 items-center justify-center rounded-lg text-zinc-900/70 transition-colors hover:bg-black/10 hover:text-zinc-900';
  const isOwner = role === 'owner';
  const archived = Boolean(meta?.archived);
  const otherLinks = draft.links.filter((l) => l.type !== 'movement' && l.type !== 'transfer');
  const participants = meta?.participants ?? [];

  return (
    <div ref={rootRef} className={`theme-fixed relative flex h-full w-full flex-col text-zinc-900 ${darkPage ? 'note-dark bg-[#16171b]' : colors.bg}`}>
      {/* Header */}
      <div
        onPointerDown={(e) => {
          if (onHeaderPointerDown && !(e.target as HTMLElement).closest('button,input,select,a,[data-no-drag]')) onHeaderPointerDown(e);
        }}
        className={`flex items-center justify-between gap-2 border-b border-black/10 px-3 py-2 sm:px-4 ${onHeaderPointerDown ? 'cursor-grab active:cursor-grabbing' : ''}`}
      >
        <button
          onClick={handleClose}
          className="flex min-w-0 items-center gap-0.5 rounded-lg py-1.5 pl-1 pr-2.5 text-sm font-semibold text-zinc-900/80 hover:bg-black/10"
        >
          <ChevronLeft className="h-4.5 w-4.5 shrink-0" />
          <span className="truncate">{backLabel ?? 'Notas'}</span>
        </button>

        <div className="flex shrink-0 items-center gap-1">
          {/* Presence: who else has this note open */}
          {peers.length > 0 && (
            <div className="mr-1 flex items-center" title={peers.map((p) => p.name).join(', ')}>
              {editingName && <span className="mr-2 hidden text-[11px] text-zinc-900/60 sm:inline">{editingName} está editando…</span>}
              <div className="flex -space-x-1.5">
                {peers.slice(0, 3).map((p) => (
                  <span
                    key={p.key}
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-bold text-white ring-2 ring-white/70 ${peerColor(p.name)}`}
                  >
                    {initialsOf(p.name)}
                  </span>
                ))}
                {peers.length > 3 && (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-700 text-[9px] font-bold text-white ring-2 ring-white/70">
                    +{peers.length - 3}
                  </span>
                )}
              </div>
            </div>
          )}
          {readOnly && (
            <span className="mr-1 flex items-center gap-1 rounded-full border border-black/15 px-2 py-1 text-[10px] font-medium text-zinc-900/60">
              <Eye className="h-3 w-3" /> Solo lectura
            </span>
          )}
          {isOwner && onAction && (
            <button
              onClick={() => runAction('share')}
              className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-zinc-900/80 hover:bg-black/10"
              title="Compartir"
            >
              <Share2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Compartir</span>
            </button>
          )}
          {onAction && (
            <Popover
              open={menuOpen === 'more'}
              onClose={() => setMenuOpen(null)}
              width="w-60"
              anchor={
                <button onClick={() => setMenuOpen(menuOpen === 'more' ? null : 'more')} title="Más opciones" className={iconBtn}>
                  <MoreHorizontal className="h-4.5 w-4.5" />
                </button>
              }
            >
              {!readOnly && (
                <>
                  {!darkPage && (
                    <>
                      <p className="px-3 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Color</p>
                      <ColorSwatches value={draft.color} onChange={(c) => change({ color: c }, false)} />
                      <MenuDivider />
                    </>
                  )}
                  <MenuItem icon={Tag} label="Mover categoría" onClick={() => setMenuOpen('category')} hint={draft.category ?? 'Ninguna'} />
                  <MenuItem
                    icon={draft.pinned ? PinOff : Pin}
                    label={draft.pinned ? 'Quitar de fijadas' : 'Fijar arriba'}
                    onClick={() => {
                      change({ pinned: !draft.pinned }, false);
                      setMenuOpen(null);
                    }}
                  />
                </>
              )}
              {isOwner && (
                <MenuItem
                  icon={archived ? ArchiveRestore : Archive}
                  label={archived ? 'Restaurar de archivadas' : 'Archivar'}
                  onClick={() => runAction(archived ? 'unarchive' : 'archive')}
                />
              )}
              <MenuItem icon={Copy} label={isOwner ? 'Duplicar' : 'Duplicar para mí'} onClick={() => runAction('duplicate')} />
              <MenuDivider />
              {isOwner ? (
                <MenuItem icon={Trash2} label="Mover a papelera" danger onClick={() => runAction('trash')} />
              ) : (
                <MenuItem icon={LogOut} label="Dejar de ver esta nota" danger onClick={() => runAction('leave')} />
              )}
            </Popover>
          )}
          {headerExtras}
        </div>
      </div>

      {topSlot}

      {/* Formatting toolbar — hidden for read-only viewers */}
      {!readOnly && (
        <div className="flex items-center gap-0.5 overflow-x-auto border-b border-black/10 px-3 py-1.5 sm:px-4 [scrollbar-width:none]">
          <select
            value={ui?.style ?? 'p'}
            onChange={(e) => setBlockStyle(e.target.value)}
            title="Estilo de párrafo"
            className="mr-1 h-8 shrink-0 cursor-pointer rounded-lg border border-black/15 bg-white/40 px-2 text-xs font-semibold text-zinc-900 focus:outline-none"
          >
            <option value="p">Cuerpo</option>
            <option value="h1">Título</option>
            <option value="h2">Encabezado</option>
            <option value="h3">Subencabezado</option>
            <option value="code">Monoespaciado</option>
          </select>
          <TB title="Negrita" active={ui?.bold} onClick={() => editor?.chain().focus().toggleBold().run()}>
            <Bold className="h-4 w-4" />
          </TB>
          <TB title="Cursiva" active={ui?.italic} onClick={() => editor?.chain().focus().toggleItalic().run()}>
            <Italic className="h-4 w-4" />
          </TB>
          <TB title="Subrayado" active={ui?.underline} onClick={() => editor?.chain().focus().toggleUnderline().run()}>
            <UnderlineIcon className="h-4 w-4" />
          </TB>
          <TB title="Tachado" active={ui?.strike} onClick={() => editor?.chain().focus().toggleStrike().run()}>
            <Strikethrough className="h-4 w-4" />
          </TB>
          <TextColorPicker editor={editor} current={ui?.color} />
          <Divider />
          <TB title="Alinear a la izquierda" active={ui?.alignLeft} onClick={() => editor?.chain().focus().setTextAlign('left').run()}>
            <AlignLeft className="h-4 w-4" />
          </TB>
          <TB title="Centrar" active={ui?.alignCenter} onClick={() => editor?.chain().focus().setTextAlign('center').run()}>
            <AlignCenter className="h-4 w-4" />
          </TB>
          <TB title="Alinear a la derecha" active={ui?.alignRight} onClick={() => editor?.chain().focus().setTextAlign('right').run()}>
            <AlignRight className="h-4 w-4" />
          </TB>
          <TB title="Justificar" active={ui?.alignJustify} onClick={() => editor?.chain().focus().setTextAlign('justify').run()}>
            <AlignJustify className="h-4 w-4" />
          </TB>
          <Divider />
          <TB title="Lista con viñetas" active={ui?.bulletList} onClick={() => editor?.chain().focus().toggleBulletList().run()}>
            <List className="h-4 w-4" />
          </TB>
          <TB title="Lista numerada" active={ui?.orderedList} onClick={() => editor?.chain().focus().toggleOrderedList().run()}>
            <ListOrdered className="h-4 w-4" />
          </TB>
          <TB title="Lista de tareas" active={ui?.taskList} onClick={() => editor?.chain().focus().toggleTaskList().run()}>
            <ListChecks className="h-4 w-4" />
          </TB>
          <TB title="Aumentar sangría" disabled={!ui?.inList} onClick={() => indent('in')}>
            <IndentIncrease className="h-4 w-4" />
          </TB>
          <TB title="Disminuir sangría" disabled={!ui?.inList} onClick={() => indent('out')}>
            <IndentDecrease className="h-4 w-4" />
          </TB>
          <Divider />
          <TB title="Enlace" active={ui?.link || linkEditing} onClick={startLinkEdit}>
            <Link2 className="h-4 w-4" />
          </TB>
          <TB title="Insertar imagen" disabled={uploading} onClick={() => requireUpload() && fileRef.current?.click()}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
          </TB>
          <TB title="Adjuntar archivo o documento" disabled={uploading} onClick={() => requireUpload() && attachRef.current?.click()}>
            <Paperclip className="h-4 w-4" />
          </TB>
          <Divider />
          {micSupported && (
            <TB title="Grabar nota de voz (se guarda el audio y se transcribe)" active={recOpen} onClick={() => setRecOpen(true)}>
              <Mic className="h-4 w-4" />
            </TB>
          )}
          <TB
            title="Mejorar con IA (redacción o visual)"
            active={Boolean(aiMenu) || Boolean(aiBusy)}
            disabled={Boolean(aiBusy)}
            onClick={(e?: React.MouseEvent) => {
              const r = (e?.currentTarget as HTMLElement | undefined)?.getBoundingClientRect();
              setAiMenu(aiMenu ? null : { x: r ? r.left : 80, y: r ? r.bottom + 6 : 80 });
            }}
          >
            {aiBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          </TB>
          <TB title="Calcular la línea (o la selección)" disabled={calcBusy} onClick={runCalculate}>
            {calcBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
          </TB>
          {!readOnly && (
            <InsertDatabaseButton editor={editor} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-900/75 transition-colors hover:bg-black/10">
              <Table2 className="h-4 w-4" />
            </InsertDatabaseButton>
          )}
          <Divider />
          <TB title="Deshacer" disabled={!ui?.canUndo} onClick={() => editor?.chain().focus().undo().run()}>
            <Undo2 className="h-4 w-4" />
          </TB>
          <TB title="Rehacer" disabled={!ui?.canRedo} onClick={() => editor?.chain().focus().redo().run()}>
            <Redo2 className="h-4 w-4" />
          </TB>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) insertImageFile(file);
            }}
          />
          <input
            ref={attachRef}
            type="file"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) attachFile(file);
            }}
          />
        </div>
      )}

      {/* Link bar */}
      {!readOnly && (linkEditing || ui?.link) && (
        <div className="flex items-center gap-2 border-b border-black/10 bg-black/5 px-3 py-1.5 text-xs sm:px-4">
          {linkEditing ? (
            <>
              <input
                ref={linkInputRef}
                value={linkUrl}
                onChange={(e) => {
                  setLinkUrl(e.target.value);
                  setLinkError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    applyLink();
                  }
                }}
                placeholder="Pega o escribe el enlace (ej: sii.cl)"
                className="min-w-0 flex-1 rounded-lg border border-black/15 bg-white/60 px-2.5 py-1.5 text-zinc-900 placeholder:text-zinc-900/40 focus:outline-none"
              />
              <button onClick={applyLink} className="rounded-lg bg-zinc-900 px-3 py-1.5 font-semibold text-white">
                Aplicar
              </button>
              {ui?.link && (
                <button onClick={removeLink} className="rounded-lg px-2 py-1.5 font-medium text-zinc-900/70 hover:bg-black/10">
                  Quitar
                </button>
              )}
              <button onClick={() => setLinkEditing(false)} className="rounded-lg px-2 py-1.5 font-medium text-zinc-900/70 hover:bg-black/10">
                Cancelar
              </button>
              {linkError && <span className="font-medium text-rose-700">{linkError}</span>}
            </>
          ) : (
            <>
              <Link2 className="h-3.5 w-3.5 shrink-0 text-zinc-900/60" />
              <span className="min-w-0 flex-1 truncate text-zinc-900/80">{ui?.linkHref}</span>
              {/* A real anchor — window.open() from a click handler gets popup-blocked. */}
              <a
                href={ui?.linkHref}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 rounded-lg bg-zinc-900 px-3 py-1.5 font-semibold text-white"
              >
                Abrir <ExternalLink className="h-3 w-3" />
              </a>
              <button onClick={startLinkEdit} className="rounded-lg px-2 py-1.5 font-medium text-zinc-900/70 hover:bg-black/10">
                Editar
              </button>
              <button onClick={removeLink} title="Quitar enlace" className="rounded-lg p-1.5 text-zinc-900/70 hover:bg-black/10">
                <Unlink className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      )}

      {saveError && (
        <p className="flex items-start gap-2 bg-rose-600/90 px-5 py-2 text-xs font-medium text-white">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          No se pudo guardar esta nota todavía. Si acabas de actualizar la app, falta correr la migración de Notas en Supabase.
        </p>
      )}

      {/* Note body: title + meta + free canvas (text flows, pictures float anywhere) */}
      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto">
        <div className={`mx-auto w-full max-w-3xl pb-28 pt-5 ${layout === 'full' ? 'px-5 sm:px-8' : 'px-5 sm:px-6'}`}>
          <input
            ref={titleRef}
            value={draft.title}
            readOnly={readOnly}
            onChange={(e) => change({ title: e.target.value }, true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                editor?.commands.focus('start');
              }
            }}
            placeholder="Título"
            className="w-full bg-transparent text-3xl font-extrabold tracking-tight text-zinc-900 placeholder:text-zinc-900/35 focus:outline-none"
          />

          {/* Category + meta */}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-zinc-900/55">
            <Popover
              open={menuOpen === 'category'}
              onClose={() => setMenuOpen(null)}
              align="left"
              anchor={
                <button
                  type="button"
                  disabled={readOnly}
                  onClick={() => setMenuOpen(menuOpen === 'category' ? null : 'category')}
                  className={`flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium transition-colors ${
                    draft.category ? 'border-black/15 bg-black/10 text-zinc-900' : 'border-black/15 text-zinc-900/55 hover:text-zinc-900'
                  } disabled:cursor-default`}
                >
                  <Tag className="h-3 w-3" />
                  {draft.category ?? (readOnly ? 'Sin categoría' : 'Categoría')}
                </button>
              }
            >
              <CategoryList
                categories={categories}
                value={draft.category}
                onAdd={onAddCategory}
                onPick={(c) => {
                  change({ category: c }, false);
                  setMenuOpen(null);
                }}
              />
            </Popover>
            <span>Editada {formatFullDate(stamp)}</span>
            {meta?.createdByName && <span>· Creada por {meta.createdByName}</span>}
            {meta?.createdAt && <span>· {formatNoteDate(meta.createdAt)}</span>}
            {!isOwner && <span className="text-zinc-900/70">· {ROLE_LABEL[role]}</span>}
            {archived && <span className="rounded-full bg-black/10 px-2 py-0.5 text-zinc-900/70">Archivada</span>}
          </div>
          {participants.length > 0 && (
            <p className="mt-1 text-[11px] text-zinc-900/55">Participantes: {participants.join(', ')}</p>
          )}

          {/* VINCULADO A — always visible when the note belongs to a movement */}
          {linkedInfo && (
            <div className="mt-4 rounded-xl border border-black/10 bg-white/40 px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-900/50">Vinculado a</p>
              <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                <p className="text-sm font-semibold text-zinc-900">{linkedInfo.label}</p>
                {typeof linkedInfo.amountCLP === 'number' && (
                  <p className="font-mono text-sm font-bold text-zinc-900">{formatCLP(linkedInfo.amountCLP)}</p>
                )}
              </div>
              {linkedInfo.date && <p className="mt-0.5 text-xs text-zinc-900/55">{formatNoteDate(`${linkedInfo.date}T12:00:00`)}</p>}
            </div>
          )}
          {otherLinks.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {otherLinks.map((l) => (
                <span key={`${l.type}-${l.id}`} className="rounded-full border border-black/15 px-2 py-0.5 text-[11px] text-zinc-900/70">
                  {LINK_TYPE_LABEL[l.type]} · {l.label}
                </span>
              ))}
            </div>
          )}

          <div
            ref={canvasRef}
            className="relative mt-5"
            style={{ minHeight: canvasMinHeight || undefined }}
            onPointerDown={(e) => {
              if (!(e.target as HTMLElement).closest('[data-note-image]')) setSelectedImage(null);
            }}
          >
            <EditorContent editor={editor} />
            {draft.images.map((img) => (
              <div key={img.id} data-note-image>
                <NoteImageItem
                  img={img}
                  url={imageUrls[img.path]}
                  canvasW={canvasW}
                  readOnly={readOnly}
                  selected={selectedImage === img.id}
                  onSelect={() => setSelectedImage(img.id)}
                  onChange={(patch) => updateImage(img.id, patch)}
                  onDelete={() => removeImage(img.id)}
                />
              </div>
            ))}
          </div>

          {/* Voice notes: the recording is always kept, the text is in the note */}
          {draft.attachments.some(isVoice) && (
            <div className="mt-6 space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-900/50">Notas de voz</p>
              <div className="grid gap-2">
                {draft.attachments.filter(isVoice).map((att) => (
                  <div key={att.id} className="group flex flex-wrap items-center gap-3 rounded-xl border border-black/10 bg-white/40 px-3 py-2.5">
                    <AudioLines className="h-5 w-5 shrink-0 text-rose-600" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-zinc-900">
                        {att.name.replace(/\.[a-z0-9]+$/i, '')}
                        {att.seconds ? <span className="ml-1.5 font-normal text-zinc-900/50">{clock(att.seconds)}</span> : null}
                      </p>
                      <p className="text-[10px] text-zinc-900/50">
                        {att.pending ? (
                          <>
                            <CloudOff className="mr-1 inline h-3 w-3" />
                            Guardada en este dispositivo · se sube sola al volver la conexión
                          </>
                        ) : transcribing.includes(att.id) ? (
                          'Transcribiendo el audio…'
                        ) : att.needsText ? (
                          'Sin texto todavía'
                        ) : (
                          formatFileSize(att.size)
                        )}
                      </p>
                    </div>
                    {voiceUrls[att.id] ? (
                      // eslint-disable-next-line jsx-a11y/media-has-caption
                      <audio src={voiceUrls[att.id]} controls autoPlay className="h-8 w-full max-w-[260px]" />
                    ) : (
                      <button onClick={() => playVoice(att)} className="rounded-lg bg-zinc-900 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-zinc-700">
                        ▶ Escuchar
                      </button>
                    )}
                    {!readOnly && att.path && (
                      <button
                        onClick={() => transcribeVoice(att)}
                        disabled={transcribing.includes(att.id)}
                        title="Pasar este audio a texto con IA (se agrega a la nota)"
                        className="rounded-lg px-2 py-1 text-[11px] font-semibold text-zinc-900/70 hover:bg-black/10 hover:text-zinc-900 disabled:opacity-40"
                      >
                        {transcribing.includes(att.id) ? <Loader2 className="inline h-3.5 w-3.5 animate-spin" /> : 'Transcribir'}
                      </button>
                    )}
                    {att.path && (
                      <button onClick={() => openAttachment(att)} title="Descargar el audio" className="rounded-lg p-1.5 text-zinc-900/60 hover:bg-black/10 hover:text-zinc-900">
                        <Download className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {!readOnly && (
                      <button
                        onClick={() => window.confirm('¿Quitar esta nota de voz? Se borra el audio.') && removeAttachment(att.id)}
                        title="Quitar nota de voz"
                        className="rounded-lg p-1.5 text-zinc-900/60 opacity-100 hover:bg-black/10 hover:text-rose-700 md:opacity-0 md:group-hover:opacity-100"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Attached files */}
          {draft.attachments.some((a) => !isVoice(a)) && (
            <div className="mt-6 space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-900/50">Archivos</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {draft.attachments.filter((a) => !isVoice(a)).map((att) => (
                  <div key={att.id} className="group flex items-center gap-3 rounded-xl border border-black/10 bg-white/40 px-3 py-2.5">
                    <FileText className="h-5 w-5 shrink-0 text-zinc-900/70" />
                    <button onClick={() => openAttachment(att)} className="min-w-0 flex-1 text-left">
                      <p className="truncate text-xs font-semibold text-zinc-900">{att.name}</p>
                      <p className="text-[10px] text-zinc-900/50">{formatFileSize(att.size)}</p>
                    </button>
                    <button onClick={() => openAttachment(att)} title="Abrir / descargar" className="rounded-lg p-1.5 text-zinc-900/60 hover:bg-black/10 hover:text-zinc-900">
                      <Download className="h-3.5 w-3.5" />
                    </button>
                    {!readOnly && (
                      <button
                        onClick={() => removeAttachment(att.id)}
                        title="Quitar archivo"
                        className="rounded-lg p-1.5 text-zinc-900/60 opacity-100 hover:bg-black/10 hover:text-rose-700 md:opacity-0 md:group-hover:opacity-100"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {footer && <div className="mt-10 border-t border-black/10 pt-4">{footer}</div>}
        </div>
      </div>

      {recOpen && (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-3">
          <VoiceNoteRecorder
            onFinish={handleRecording}
            onClose={() => setRecOpen(false)}
            exclude={draft.attachments.map((a) => (a as VoiceAttachment).pending).filter((x): x is string => Boolean(x))}
          />
        </div>
      )}

      {aiMenu && (
        <>
          <div className="fixed inset-0 z-[90]" onMouseDown={() => setAiMenu(null)} />
          <div
            className="theme-fixed fixed z-[91] w-72 overflow-hidden rounded-xl bg-[#16171b] p-1.5 text-white shadow-2xl ring-1 ring-white/10"
            style={{ left: Math.min(aiMenu.x, window.innerWidth - 300), top: aiMenu.y }}
          >
            <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              {editor && !editor.state.selection.empty ? 'Mejorar lo seleccionado' : 'Mejorar toda la nota'}
            </p>
            {(['redaccion', 'visual'] as ImproveMode[]).map((m) => (
              <button
                key={m}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => runImprove(m)}
                className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-white/[0.07]"
              >
                {m === 'redaccion' ? <Wand2 className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" /> : <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" />}
                <span>
                  <span className="block text-sm font-semibold">{IMPROVE_LABEL[m].title}</span>
                  <span className="block text-[11px] leading-snug text-zinc-400">{IMPROVE_LABEL[m].hint}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      {(aiBusy || aiDone) && !recOpen && (
        <div className="pointer-events-none absolute inset-x-0 bottom-6 z-10 flex justify-center px-4">
          <div className="theme-fixed pointer-events-auto flex items-center gap-3 rounded-full bg-black/85 px-4 py-2 text-xs font-medium text-white shadow-2xl ring-1 ring-white/10">
            {aiBusy ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-300" />
                {aiBusy === 'visual' ? 'Dándole más power a tu nota…' : 'Mejorando la redacción…'}
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5 text-violet-300" />
                {aiDone}
                <button
                  onClick={() => {
                    editor?.chain().focus().undo().run();
                    setAiDone(null);
                  }}
                  className="rounded-full bg-white/10 px-2.5 py-0.5 font-semibold hover:bg-white/20"
                >
                  Deshacer
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {notice && (
        <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center px-4">
          <div className="max-w-md rounded-xl bg-black/85 px-4 py-2.5 text-xs font-medium text-white shadow-2xl ring-1 ring-white/10">{notice}</div>
        </div>
      )}
    </div>
  );
};
