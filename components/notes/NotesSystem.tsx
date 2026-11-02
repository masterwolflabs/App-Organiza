'use client';

/**
 * Las Notas completas, listas para montar en cualquier app (y en la nube).
 * Es la orquestación que en Finance vive dentro de app/page.tsx ("Sistema de
 * Notas": nota abierta que sigue viva al navegar, compartir, recibir un link,
 * notas en el chat), sacada a una pieza reutilizable como ChatSystem. Los
 * componentes de esta carpeta son los de Finance tal cual.
 *
 * Diferencias con Finance, a propósito:
 *  - `scope` (utils/chatScope.ts): notas por app (columna notes.app, SQL 10 de la nube).
 *  - Sin notas de movimientos ni de proyectos (son de Finance).
 *  - En el chat, una nota se comparte en mensajes directos (como Finance; sus
 *    grupos de demostración no guardan notas).
 *
 * Va DENTRO de ChatProvider (usa sus cuentas y sus mensajes directos) y de
 * DatabaseStoreProvider (bases de datos dentro de una nota), si existen.
 */
import { supabase } from '@/lib/supabaseClient';
import { useNoteUrl } from '@/utils/noteUrl';
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ActiveSession } from '@/types/auth';
import type { Note, NoteRole, NoteShareRole, ViewMode } from '@/types/notes';
import type { ChatScope } from '@/utils/chatScope';
import { Draft, NoteViewMode, emptyDraft, movementLinkOf, noteToDraft } from '@/utils/notes';
import { SharedLinkNote, useNotesSystem } from '@/utils/useNotes';
import { NotesBoard, NotesTab } from '@/components/notes/NotesBoard';
import { NoteWindow } from '@/components/notes/NoteWindow';
import type { NoteEditorAction } from '@/components/notes/NoteEditor';
import { ShareNoteDialog } from '@/components/notes/ShareNoteDialog';
import { ReceiveSharedNoteDialog } from '@/components/notes/ReceiveSharedNoteDialog';
import { NotesBridgeProvider, NotesBridgeValue } from '@/components/notes/NotesBridge';
import { useChat } from '@/components/community/ChatSystem';
import { Toast } from '@/components/ui/Toast';

type OpenNote = { key: number; id: string | null; draft: Draft; role: NoteRole; backLabel?: string };

function useNotesState(session: ActiveSession, scope: ChatScope, ownerScope: string, viewMode: ViewMode, onOpenNotes: () => void) {
  const notesSys = useNotesSystem(session, ownerScope, viewMode, scope);
  const notes = notesSys.notes;
  const chat = useChat();
  const accounts = chat?.accounts ?? [];
  const [notesTab, setNotesTab] = useState<NotesTab>('all');
  const [openNote, setOpenNote] = useState<OpenNote | null>(null);
  const noteKey = useRef(0);
  const [noteViewMode, setNoteViewModeState] = useState<NoteViewMode>('center');
  const [shareNoteId, setShareNoteId] = useState<string | null>(null);
  const [incomingShare, setIncomingShare] = useState<{ token: string; note: SharedLinkNote } | null>(null);
  const [toast, showToast] = useState<string | null>(null);
  const [panels, setPanels] = useState<Partial<Record<string, { panel: React.ComponentType<{ id: string }>; footer?: React.ComponentType<{ id: string; onClose: () => void }>; template?: { label: string; html: string } }>>>({});

  useEffect(() => {
    try {
      const saved = localStorage.getItem('mwf-note-view-mode') as NoteViewMode | null;
      if (saved && ['side', 'center', 'floating', 'full'].includes(saved)) setNoteViewModeState(saved);
    } catch {
      /* private mode */
    }
  }, []);
  const setNoteViewMode = (mode: NoteViewMode) => {
    setNoteViewModeState(mode);
    try {
      localStorage.setItem('mwf-note-view-mode', mode);
    } catch {
      /* private mode */
    }
  };

  const nameOfUser = (userId: string | null | undefined) =>
    !userId ? null : userId === session.userId ? session.displayName || 'Tú' : accounts.find((a) => a.id === userId)?.displayName ?? null;

  const peopleForNote = (noteId: string): string[] => {
    const note = notesSys.findNote(noteId);
    const names = notesSys.membersFor(noteId).map((m) => nameOfUser(m.userId) ?? 'Cuenta');
    if (note?.createdByName) names.unshift(note.createdByName);
    return Array.from(new Set(names));
  };

  const openNoteObj = (note: Note, backLabel?: string) => {
    setOpenNote({ key: ++noteKey.current, id: note.id, draft: noteToDraft(note), role: notesSys.roleOf(note.id) ?? 'viewer', backLabel });
  };
  const openNewNote = (category?: string | null) => {
    setOpenNote({ key: ++noteKey.current, id: null, draft: emptyDraft({ category: category ?? null }), role: 'owner' });
  };
  const openNoteById = async (noteId: string) => {
    const note = await notesSys.fetchNote(noteId);
    if (!note) {
      showToast('No tienes acceso a esa nota o ya no existe.');
      return;
    }
    const role: NoteRole = notesSys.roleOf(noteId) ?? 'viewer';
    setOpenNote({ key: ++noteKey.current, id: note.id, draft: noteToDraft(note), role });
  };

  useNoteUrl(openNote?.id ?? null, (openNote?.id ? notesSys.findNote(openNote.id)?.title : null) ?? openNote?.draft.title ?? '', (id) => openNoteById(id), () => setOpenNote(null));

  const handleDuplicateNote = async (note: Note, forMe?: boolean) => {
    const id = await notesSys.duplicate(note, { forMe });
    if (!id) {
      showToast('No se pudo duplicar la nota.');
      return;
    }
    const copy = notesSys.findNote(id) ?? (await notesSys.fetchNote(id));
    if (copy) openNoteObj(copy);
  };

  const handleNoteAction = async (action: NoteEditorAction, noteId: string) => {
    const note = notesSys.findNote(noteId) ?? (await notesSys.fetchNote(noteId));
    if (!note) return;
    if (action === 'share') setShareNoteId(noteId);
    else if (action === 'archive') {
      await notesSys.archive(noteId);
      setOpenNote(null);
    } else if (action === 'unarchive') {
      await notesSys.unarchive(noteId);
      setOpenNote((o) => (o ? { ...o } : o));
    } else if (action === 'duplicate') {
      setOpenNote(null);
      await handleDuplicateNote(note, notesSys.roleOf(noteId) !== 'owner');
    } else if (action === 'trash') {
      await notesSys.trash(noteId);
      setOpenNote(null);
    } else if (action === 'leave') {
      await notesSys.leaveShared(noteId);
      setOpenNote(null);
    }
  };

  // Chat → "Adjuntar → Nota": the same note object, never a copy. In a real
  // DM the other person also gets access (note_members) with the chosen role.
  const handleSendCommunityNote = async (conversationId: string, noteId: string, role: NoteShareRole) => {
    const otherId = chat?.dmUserOf(conversationId);
    if (!chat || !otherId) {
      showToast('Por ahora las notas se comparten en mensajes directos.');
      return;
    }
    if (notesSys.roleOf(noteId) === 'owner') await notesSys.setMember(noteId, otherId, role);
    await chat.actions.sendNote(otherId, noteId);
  };

  const notesBridge: NotesBridgeValue = {
    pickableNotes: notes,
    resolveNote: async (noteId) => {
      const note = await notesSys.fetchNote(noteId);
      if (!note || note.deletedAt) return null;
      return { note, role: notesSys.roleOf(noteId) };
    },
    openNote: (noteId) => {
      openNoteById(noteId);
    },
    sendNote: (conversationId, noteId, role) => {
      handleSendCommunityNote(conversationId, noteId, role);
    },
    linkedNote: (type, id) => notes.find((n) => (n.links ?? []).some((l) => l.type === type && l.id === id)) ?? null,
    openLinkedNote: async (type, id, label, category, text, backLabel, start) => {
      const found = notes.find((n) => (n.links ?? []).some((l) => l.type === type && l.id === id));
      if (found) return openNoteObj(found, backLabel);
      // The list can be behind (another tab, a save just finished): a record has one note, so ask the database first.
      const { data } = await supabase.from('notes').select('*').contains('links', [{ type, id }]).is('deletedAt', null).order('updatedAt', { ascending: false }).limit(1);
      const saved = (data as Note[] | null)?.[0];
      if (saved) return setOpenNote({ key: ++noteKey.current, id: saved.id, draft: noteToDraft(saved), role: notesSys.roleOf(saved.id) ?? 'owner', backLabel });
      setOpenNote({ key: ++noteKey.current, id: null, draft: emptyDraft({ title: label, category, body: text ?? '', bodyHtml: start?.html ?? '', ...(start?.color ? { color: start.color } : {}), links: [{ type, id, label }] } as Partial<Draft>), role: 'owner', backLabel });
    },
    renameLinked: (noteId, title, linkId) => {
      const note = notesSys.findNote(noteId);
      if (note) notesSys.update(noteId, { title, links: (note.links ?? []).map((l) => (l.id === linkId ? { ...l, label: title } : l)) });
    },
    linkPanel: (type, panel, footer, template) => setPanels((p) => (p[type]?.panel === panel ? p : { ...p, [type]: { panel, footer, template } })),
  };

  // Arriving from a share link (/?share=<token>, after login if needed) or a
  // direct note link (/?note=<id>).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('share');
    const noteParam = params.get('note');
    if (!token && !noteParam) return;
    params.delete('share');
    const rest = params.toString();
    window.history.replaceState(null, '', window.location.pathname + (rest ? `?${rest}` : '') + window.location.hash);
    if (token) {
      notesSys.getByToken(token).then((n) => {
        if (n) setIncomingShare({ token, note: n });
        else showToast('Ese link de nota no es válido o fue desactivado.');
      });
    } else if (noteParam) {
      openNoteById(noteParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const overlays = (
    <>
      {openNote &&
        (() => {
          const live = openNote.id ? notesSys.findNote(openNote.id) : null;
          const panelLink = ((live ?? openNote.draft).links ?? []).find((l) => panels[l.type]);
          const Panel = panelLink ? panels[panelLink.type]?.panel : undefined;
          const Footer = panelLink ? panels[panelLink.type]?.footer : undefined;
          return (
            <NoteWindow
              key={openNote.key}
              mode={noteViewMode}
              onModeChange={setNoteViewMode}
              initial={openNote.draft}
              role={openNote.role}
              backLabel={openNote.backLabel}
              imageStore={notesSys.imageStore}
              onCreate={notesSys.create}
              onUpdate={notesSys.update}
              onDelete={notesSys.hardDelete}
              onClose={() => setOpenNote(null)}
              onIdChange={(id) => setOpenNote((o) => (o ? { ...o, id } : o))}
              onRemoteChange={notesSys.applyLocal}
              onAction={handleNoteAction}
              onAddCategory={notesSys.addCategory}
              categories={notesSys.categories}
              linkedInfo={movementLinkOf(live ?? openNote.draft) ?? ((live ?? openNote.draft).links ?? []).find((l) => l.type === 'project') ?? null}
              meta={{
                createdByName: live?.createdByName ?? (openNote.id ? null : session.displayName),
                createdAt: live?.created_at ?? null,
                participants: openNote.id ? peopleForNote(openNote.id) : [],
                archived: Boolean(live?.archivedAt),
              }}
              presenceName={session.displayName || session.email}
              titleSlot={Panel && panelLink ? <Panel id={panelLink.id} /> : undefined}
              footer={Footer && panelLink ? <Footer id={panelLink.id} onClose={() => setOpenNote(null)} /> : undefined}
              liveTitle={live?.title}
              template={panelLink ? panels[panelLink.type]?.template : undefined}
            />
          );
        })()}

      {shareNoteId &&
        (() => {
          const note = notesSys.findNote(shareNoteId);
          return (
            <ShareNoteDialog
              noteTitle={note?.title ?? ''}
              ownerName={session.displayName || 'Tú'}
              links={notesSys.linksFor(shareNoteId)}
              members={notesSys.membersFor(shareNoteId)}
              accounts={accounts}
              onEnsureLink={(role) => notesSys.ensureShareLink(shareNoteId, role)}
              onRevokeLink={notesSys.revokeShareLink}
              onSetMember={(userId, role) => notesSys.setMember(shareNoteId, userId, role)}
              onRemoveMember={(userId) => notesSys.removeMember(shareNoteId, userId)}
              onClose={() => setShareNoteId(null)}
            />
          );
        })()}

      {incomingShare && (
        <ReceiveSharedNoteDialog
          note={incomingShare.note}
          onOpenMine={() => {
            const id = incomingShare.note.id;
            setIncomingShare(null);
            openNoteById(id);
          }}
          onKeepShared={async () => {
            const id = await notesSys.joinByToken(incomingShare.token);
            setIncomingShare(null);
            if (!id) {
              showToast('No se pudo guardar la nota compartida.');
              return;
            }
            setNotesTab('shared');
            onOpenNotes();
            openNoteById(id);
          }}
          onDuplicate={async () => {
            const n = incomingShare.note;
            setIncomingShare(null);
            await handleDuplicateNote(n, true);
            setNotesTab('all');
            onOpenNotes();
          }}
          onClose={() => setIncomingShare(null)}
        />
      )}

      {toast && <Toast message={toast} onClose={() => showToast(null)} />}
    </>
  );

  return { notesSys, notes, notesTab, setNotesTab, peopleForNote, openNoteObj, openNewNote, openNoteById, handleDuplicateNote, setShareNoteId, showToast, notesBridge, overlays };
}

type NotesState = ReturnType<typeof useNotesState>;
const NotesCtx = createContext<NotesState | null>(null);
/** Las notas desde cualquier parte de la app (buscador, "Nueva nota"…). */
export const useNotes = () => useContext(NotesCtx);

/**
 * Monta las notas una vez, arriba de toda la app: así una nota abierta en
 * ventana lateral o flotante sigue viva al navegar por otras secciones.
 * `onOpenNotes` lleva a la sección Notas. `ownerScope` = el id del usuario
 * (sus notas) o 'mw' (Master Wolf, solo miembros), como en Finance.
 */
export const NotesProvider: React.FC<{
  session: ActiveSession;
  scope: ChatScope;
  ownerScope?: string;
  viewMode?: ViewMode;
  onOpenNotes: () => void;
  children: React.ReactNode;
}> = ({ session, scope, ownerScope, viewMode = 'personal', onOpenNotes, children }) => {
  const state = useNotesState(session, scope, ownerScope ?? session.userId, viewMode, onOpenNotes);

  // Las ventanas flotante y lateral del chat se dibujan en ChatProvider (más
  // arriba): les llega este mismo puente, estable, que siempre usa lo último.
  const latest = useRef(state.notesBridge);
  latest.current = state.notesBridge;
  const relay = useMemo<NotesBridgeValue>(
    () => ({
      get pickableNotes() {
        return latest.current.pickableNotes;
      },
      resolveNote: (id) => latest.current.resolveNote(id),
      openNote: (id) => latest.current.openNote(id),
      sendNote: (c, id, role) => latest.current.sendNote(c, id, role),
    }),
    []
  );
  const setChatBridge = useChat()?.setNotesBridge;
  useEffect(() => {
    if (!setChatBridge) return;
    setChatBridge(relay);
    return () => setChatBridge(null);
  }, [setChatBridge, relay]);

  return (
    <NotesCtx.Provider value={state}>
      <NotesBridgeProvider value={state.notesBridge}>
        {children}
        {state.overlays}
      </NotesBridgeProvider>
    </NotesCtx.Provider>
  );
};

/** La sección Notas: el mismo tablero de Finance (Todas, Recientes, Compartidas conmigo, Archivadas, Papelera, Categorías). */
export const NotesView: React.FC<{ scopeLabel?: string }> = ({ scopeLabel = 'tu cuenta' }) => {
  const n = useNotes();
  if (!n) return null;
  const { notesSys } = n;
  return (
    <NotesBoard
      notes={n.notes}
      shared={notesSys.shared}
      loading={notesSys.loading}
      scopeLabel={scopeLabel}
      categories={notesSys.categories}
      peopleFor={n.peopleForNote}
      isSharedByMe={(id) => notesSys.membersFor(id).length > 0 || notesSys.linksFor(id).length > 0}
      tab={n.notesTab}
      onTabChange={n.setNotesTab}
      onNew={n.openNewNote}
      onOpen={(note) => n.openNoteObj(note)}
      onUpdate={(id, patch) => {
        notesSys.update(id, patch);
      }}
      onShare={(note) => n.setShareNoteId(note.id)}
      onArchive={(id) => notesSys.archive(id)}
      onUnarchive={(id) => notesSys.unarchive(id)}
      onTrash={(id) => notesSys.trash(id)}
      onRestore={(id) => notesSys.restore(id)}
      onHardDelete={async (id) => {
        if (!(await notesSys.hardDelete(id))) n.showToast('Solo quien creó la nota puede eliminarla definitivamente.');
      }}
      onDuplicate={n.handleDuplicateNote}
      onLeave={(id) => notesSys.leaveShared(id)}
      onAddCategory={notesSys.addCategory}
      canHardDelete={notesSys.canHardDelete}
    />
  );
};
