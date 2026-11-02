/**
 * A file dropped anywhere that nobody took (Emanuel, 2026-11-02): it never opens a browser tab, it goes to
 * the IA, which asks what it's for. It waits here until the chat picks it up.
 */
export const FILE_DROP = 'mf-file-drop';
let waiting: File | null = null;
export const dropFile = (file: File) => {
  waiting = file;
  window.dispatchEvent(new Event(FILE_DROP));
};
export const hasDroppedFile = () => waiting !== null;
export const takeDroppedFile = () => {
  const file = waiting;
  waiting = null;
  return file;
};
