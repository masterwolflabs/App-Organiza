import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';

/**
 * Text flows around a note's pictures, like Word (Emanuel, 2026-11-02). The pictures keep their place in
 * `images` (x, y, w) and nothing is saved in the text: each one reserves its room with an invisible float
 * inside the editor, so old notes get it too and moving a picture moves the text with it.
 * Left half of the page = float left; right half = float right.
 */
export type WrapBox = { id: string; left: number; top: number; width: number; height: number };

const key = new PluginKey<DecorationSet>('noteImageWrap');
const applied = new WeakMap<EditorView, string>();
const GAP = 16;

export const NoteImageWrap = Extension.create({
  name: 'noteImageWrap',
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key,
        state: {
          init: () => DecorationSet.empty,
          apply: (tr, set) => (tr.getMeta(key) as DecorationSet | undefined) ?? set.map(tr.mapping, tr.doc),
        },
        props: { decorations: (state) => key.getState(state) },
      }),
    ];
  },
});

const spacer = (box: WrapBox, gap: number, pageW: number) => {
  const el = document.createElement('div');
  const right = box.left + box.width / 2 > pageW / 2;
  el.className = 'note-wrap';
  el.contentEditable = 'false';
  el.style.cssText = `float:${right ? 'right' : 'left'};width:${box.width}px;height:${box.height}px;margin:${gap}px ${right ? pageW - box.left - box.width : GAP}px 8px ${right ? GAP : box.left}px;`;
  return el;
};

/** Each picture's float goes before the block at its height. Run twice: wrapped text moves what's below. */
export function applyImageWrap(view: EditorView, boxes: WrapBox[], pageW: number) {
  const root = view.dom as HTMLElement;
  const rootTop = root.getBoundingClientRect().top;
  const blocks = (Array.from(root.children) as HTMLElement[]).filter((el) => !el.classList.contains('note-wrap'));
  const placed = [...boxes].sort((a, b) => a.top - b.top).map((box) => {
    let block = blocks[0];
    let blockTop = 0;
    for (const b of blocks) {
      const t = b.getBoundingClientRect().top - rootTop;
      if (t > box.top) break;
      block = b;
      blockTop = t;
    }
    const inside = view.posAtDOM(block, 0);
    const $pos = view.state.doc.resolve(inside);
    return { box, pos: $pos.depth ? $pos.before(1) : inside, gap: Math.max(0, Math.round(box.top - blockTop)) };
  });
  const sig = JSON.stringify([pageW, placed.map((p) => [p.box, p.pos, p.gap])]);
  if (applied.get(view) === sig) return;
  applied.set(view, sig);
  const set = DecorationSet.create(
    view.state.doc,
    placed.map(({ box, pos, gap }) => Decoration.widget(pos, () => spacer(box, gap, pageW), { side: -1, key: `${box.id}:${box.width}:${box.height}:${box.left}:${gap}:${pageW}`, ignoreSelection: true }))
  );
  view.dispatch(view.state.tr.setMeta(key, set).setMeta('addToHistory', false));
}
