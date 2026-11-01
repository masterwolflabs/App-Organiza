import { Movement, Note, NoteAttachment, NoteColor, NoteImage, NoteLink, NoteRole } from '@/types/notes';

// Sticky-note (post-it) colors — pastel paper with dark text. Yellow is the
// default, like a classic post-it. Full literal class strings so Tailwind can see them.
export const NOTE_COLORS: Record<NoteColor, { label: string; bg: string; swatch: string }> = {
  yellow: { label: 'Amarillo', bg: 'bg-[#fef08a]', swatch: 'bg-[#fde047]' },
  pink: { label: 'Rosado', bg: 'bg-[#fbcfe8]', swatch: 'bg-[#f9a8d4]' },
  blue: { label: 'Celeste', bg: 'bg-[#bae6fd]', swatch: 'bg-[#7dd3fc]' },
  green: { label: 'Verde', bg: 'bg-[#bbf7d0]', swatch: 'bg-[#86efac]' },
  orange: { label: 'Naranjo', bg: 'bg-[#fed7aa]', swatch: 'bg-[#fdba74]' },
  purple: { label: 'Lila', bg: 'bg-[#ddd6fe]', swatch: 'bg-[#c4b5fd]' },
  graphite: { label: 'Gris', bg: 'bg-[#e4e4e7]', swatch: 'bg-[#a1a1aa]' },
};
export const COLOR_KEYS = Object.keys(NOTE_COLORS) as NoteColor[];
export const DEFAULT_NOTE_COLOR: NoteColor = 'yellow';
export const colorOf = (c: string) => NOTE_COLORS[c as NoteColor] ?? NOTE_COLORS.yellow;

export const DEFAULT_NOTE_CATEGORIES = ['Movimientos', 'Transferencias', 'Impuestos', 'Inversiones', 'Negocio', 'Personal', 'Proyectos'];

export interface NoteInput {
  title: string;
  body: string;
  bodyHtml: string;
  images: NoteImage[];
  attachments: NoteAttachment[];
  color: NoteColor;
  pinned: boolean;
  category: string | null;
  links: NoteLink[];
  linkedMovementId?: string | null;
}

export interface Draft {
  id: string | null;
  title: string;
  body: string;
  bodyHtml: string;
  images: NoteImage[];
  attachments: NoteAttachment[];
  color: NoteColor;
  pinned: boolean;
  category: string | null;
  links: NoteLink[];
  updatedAt: string | null;
  linkedMovementId?: string | null;
}

// Where a note's files live. The editor doesn't care whether that's
// Supabase Storage (the real app), an anonymous share link, or memory.
export interface NoteImageStore {
  upload: (blob: Blob, ext: string) => Promise<string | null>;
  getUrls: (paths: string[]) => Promise<Record<string, string>>;
  remove: (paths: string[]) => Promise<void>;
  /** Only false for anonymous link viewers (Storage uploads need an account). */
  canUpload?: boolean;
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Notes written before rich text existed only have plain `body` text.
export function initialBodyHtml(note: Pick<Note, 'body' | 'bodyHtml'>): string {
  if (note.bodyHtml) return note.bodyHtml;
  if (!note.body) return '';
  return note.body
    .split('\n')
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join('');
}

export function isDraftEmpty(d: Pick<Draft, 'title' | 'body' | 'images'> & { attachments?: NoteAttachment[] }): boolean {
  return !d.title.trim() && !d.body.trim() && d.images.length === 0 && (d.attachments?.length ?? 0) === 0;
}

export function noteToDraft(n: Note): Draft {
  return {
    id: n.id,
    title: n.title,
    body: n.body,
    bodyHtml: initialBodyHtml(n),
    images: n.images ?? [],
    attachments: n.attachments ?? [],
    color: n.color,
    pinned: n.pinned,
    category: n.category ?? null,
    links: n.links ?? [],
    updatedAt: n.updatedAt,
    linkedMovementId: n.linkedMovementId ?? null,
  };
}

export function emptyDraft(patch: Partial<Draft> = {}): Draft {
  return {
    id: null,
    title: '',
    body: '',
    bodyHtml: '',
    images: [],
    attachments: [],
    color: DEFAULT_NOTE_COLOR,
    pinned: false,
    category: null,
    links: [],
    updatedAt: null,
    linkedMovementId: null,
    ...patch,
  };
}

export function movementLink(m: Movement): NoteLink {
  const label =
    m.type === 'Transferencia'
      ? m.toAccountName
        ? `Transferencia ${m.accountName} → ${m.toAccountName}`
        : `Transferencia ${m.accountName}`
      : `${m.type === 'Ingreso' ? 'Ingreso' : 'Egreso'} ${m.category ? `· ${m.category} ` : ''}· ${m.accountName}`;
  return { type: m.type === 'Transferencia' ? 'transfer' : 'movement', id: m.id, label, amountCLP: m.amountCLP, date: m.date };
}

/** A brand-new note for a movement: category + "VINCULADO A" filled in automatically. */
export function draftForMovement(m: Movement): Draft {
  return emptyDraft({
    color: 'graphite',
    linkedMovementId: m.id,
    category: m.type === 'Transferencia' ? 'Transferencias' : 'Movimientos',
    links: [movementLink(m)],
  });
}

/** The movement/transfer relation to show as "VINCULADO A" — the link snapshot, else a live lookup. */
export function movementLinkOf(note: Pick<Note, 'links' | 'linkedMovementId'>, movements?: Movement[]): NoteLink | null {
  const snap = (note.links ?? []).find((l) => l.type === 'movement' || l.type === 'transfer');
  if (snap) return snap;
  if (note.linkedMovementId && movements) {
    const m = movements.find((x) => x.id === note.linkedMovementId);
    if (m) return movementLink(m);
  }
  return null;
}

export const LINK_TYPE_LABEL: Record<NoteLink['type'], string> = {
  movement: 'Movimiento',
  transfer: 'Transferencia',
  account: 'Cuenta',
  chat: 'Chat',
  group: 'Grupo',
  person: 'Persona',
  invoice: 'Factura',
  debt: 'Deuda',
  investment: 'Inversión',
  task: 'Pendiente',
  project: 'Proyecto',
};

export function formatNoteDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Apple-Notes-style list date: time today, "Ayer", weekday this week, else the date.
export function formatCardDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((day(now) - day(d)) / 86400000);
  if (diffDays <= 0) return d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Ayer';
  if (diffDays < 7) {
    const weekday = d.toLocaleDateString('es-CL', { weekday: 'long' });
    return weekday.charAt(0).toUpperCase() + weekday.slice(1);
  }
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/** Search by title, text, category, person (creator / participants) and related movement. */
export function noteMatches(n: Note, query: string, people: string[] = []): boolean {
  const q = normalize(query.trim());
  if (!q) return true;
  const hay = [n.title, n.body, n.category ?? '', n.createdByName ?? '', ...people, ...(n.links ?? []).map((l) => l.label)]
    .map(normalize)
    .join('\n');
  return q.split(/\s+/).every((word) => hay.includes(word));
}

export function randomToken(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 24);
}

export const ROLE_LABEL: Record<NoteRole, string> = {
  owner: 'Propietario',
  editor: 'Puede editar',
  viewer: 'Puede ver',
};

export type NoteViewMode = 'side' | 'center' | 'floating' | 'full';
