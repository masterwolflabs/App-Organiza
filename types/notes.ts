/**
 * Tipos del Sistema de Notas — copiados de types/finance.ts de Finance (solo
 * lo de Notas). Diferencia: `Note.app` (App Master Cloud, SQL 10): la app
 * donde se creó la nota (null = Finance), para el filtro por app.
 * `Movement` y `ViewMode` van mínimos: las notas solo los usan para el
 * "VINCULADO A" de un movimiento de Finance.
 */
export type ViewMode = 'personal' | 'master_wolf';

/** Lo que las notas leen de un movimiento de Finance (ver utils/notes.ts → movementLink). */
export interface Movement {
  id: string;
  accountName: string;
  type: 'Ingreso' | 'Egreso' | 'Transferencia';
  toAccountName?: string;
  category: string;
  amountCLP: number;
  date: string;
}

export type NoteColor = 'graphite' | 'yellow' | 'pink' | 'blue' | 'green' | 'orange' | 'purple';

// Free-form sticky notes (iPhone-Notes-style: a title + a body, pinnable,
// searchable) shown under the movements history. `updatedAt` is only bumped
// when the title/body actually change, not on pin/color toggles — same as
// Apple Notes' "modified" date.
// A free-floating picture on a note's canvas. `x`/`w` are fractions of the
// canvas width (so a note reflows sanely on a phone), `y` is px from the top,
// `ratio` is height/width. `path` is a key in the private "documents" bucket.
export interface NoteImage {
  id: string;
  path: string;
  x: number;
  y: number;
  w: number;
  ratio: number;
}

export interface Note {
  id: string;
  title: string;
  // Plain-text mirror of the rich body — used for search and card previews.
  body: string;
  // Rich body as HTML (TipTap). Null on notes written before rich text existed.
  bodyHtml?: string | null;
  images?: NoteImage[];
  color: NoteColor;
  pinned: boolean;
  updatedAt: string;
  // When set, this is the (single) note of a Movement — opened from the
  // movement's detail ("Nota" section). See components/notes/MovementDetailModal.tsx.
  linkedMovementId?: string | null;
  viewScope: ViewMode;
  // --- Sistema de Notas v2 (2026-09-29, see supabase/schema.sql) ---
  category?: string | null;
  attachments?: NoteAttachment[];
  // Generic relations to other modules (movement, account, chat, debt...).
  // Carries a label snapshot so a shared-link viewer (who can't read the
  // owner's movements) still sees "VINCULADO A ...".
  links?: NoteLink[];
  archivedAt?: string | null;
  // Soft delete — the note sits in "Papelera" until permanently deleted.
  deletedAt?: string | null;
  createdBy?: string | null;
  createdByName?: string | null;
  owner_scope?: string;
  created_at?: string;
  /** App donde se creó (slug de hub_apps). null = Finance. SQL 10 de la nube. */
  app?: string | null;
}

// A non-picture file attached to a note (PDF, spreadsheet, doc...). Lives in
// the private "documents" bucket, same as note pictures.
export interface NoteAttachment {
  id: string;
  path: string;
  name: string;
  size: number;
  mime: string;
}

export type NoteLinkType =
  | 'movement'
  | 'transfer'
  | 'account'
  | 'chat'
  | 'group'
  | 'person'
  | 'invoice'
  | 'debt'
  | 'investment'
  | 'task'
  | 'project';

export interface NoteLink {
  type: NoteLinkType;
  id: string;
  label: string;
  amountCLP?: number;
  date?: string;
}

// owner = the note is in your scope (you or Master Wolf); editor/viewer =
// someone shared it with you (note_members) or you opened a share link.
export type NoteRole = 'owner' | 'editor' | 'viewer';
export type NoteShareRole = 'viewer' | 'editor';

export interface NoteMember {
  id: string;
  noteId: string;
  userId: string;
  role: NoteShareRole;
  created_at: string;
}

export interface NoteShareLink {
  id: string;
  noteId: string;
  token: string;
  role: NoteShareRole;
  revoked: boolean;
  created_at: string;
}

export interface NoteCategory {
  id: string;
  name: string;
}
