#!/usr/bin/env node
/**
 * Trae a la plantilla las mejoras de Master Wolf Finance.
 *
 *   npm run sync:finance            → revisa: qué cambió en Finance desde la última vez
 *   npm run sync:finance -- --apply → copia los archivos automáticos y guarda el punto de sincronización
 *
 * Lee Finance desde GitHub (origin/main de la carpeta ../master-wolf-finance,
 * o FINANCE_DIR=…) con `git fetch` + `git show`, SIN tocar la carpeta de
 * trabajo de Finance. Dos tipos de archivo:
 *   - AUTO: copiados tal cual (solo se reescriben las rutas de import).
 *   - MANUAL: la plantilla los adaptó; se muestra el diff de Finance desde la
 *     última sincronización para aplicarlo a mano.
 * También muestra la sección "## Para la plantilla" del CLAUDE.md de Finance
 * (lo que Emanuel marcó con "esto también va para la plantilla de Master Cloud").
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIN = resolve(process.env.FINANCE_DIR || join(ROOT, '..', 'master-wolf-finance'));
const STATE = join(ROOT, 'scripts', 'finance-sync.json');
const APPLY = process.argv.includes('--apply');

/** Finance → plantilla. */
const AUTO = {
  'app/globals.css': 'app/globals.css',
  'components/company/table.tsx': 'components/tables/table.tsx',
  'components/company/tableViews.tsx': 'components/tables/tableViews.tsx',
  'components/company/moreViews.tsx': 'components/tables/moreViews.tsx',
  'components/company/customFields.tsx': 'components/tables/customFields.tsx',
  'components/company/relations.tsx': 'components/tables/relations.tsx',
  'components/company/cellMenu.tsx': 'components/tables/cellMenu.tsx',
  'components/company/section.tsx': 'components/tables/section.tsx',
  'components/company/ui.tsx': 'components/tables/ui.tsx',
  'components/company/window.tsx': 'components/tables/window.tsx',
  'components/company/confirm.tsx': 'components/ui/confirm.tsx',
  'components/databases/DatabaseTable.tsx': 'components/databases/DatabaseTable.tsx',
  'components/databases/dbViews.tsx': 'components/databases/dbViews.tsx',
  'components/databases/DatabasesView.tsx': 'components/databases/DatabasesView.tsx',
  'components/databases/FormulaEditor.tsx': 'components/databases/FormulaEditor.tsx',
  'components/dashboard/ExpandPair.tsx': 'components/dashboard/ExpandPair.tsx',
  'components/AnimatedNumber.tsx': 'components/shell/AnimatedNumber.tsx',
  'components/WolfLogo.tsx': 'components/shell/WolfLogo.tsx',
  'components/ui/BodyPortal.tsx': 'components/ui/BodyPortal.tsx',
  'components/HelpTips.tsx': 'components/ui/HelpTips.tsx',
  'components/Toast.tsx': 'components/ui/Toast.tsx',
  'components/mm/ui.tsx': 'components/mente/ui.tsx',
  'utils/databases.ts': 'utils/databases.ts',
  'utils/notionFormula.ts': 'utils/notionFormula.ts',
  'utils/mathExpression.ts': 'utils/mathExpression.ts',
  'utils/formatters.ts': 'utils/formatters.ts',
  'utils/privacy.ts': 'utils/privacy.ts',
  'utils/theme.ts': 'utils/theme.ts',
  'utils/useEdgeReveal.ts': 'utils/useEdgeReveal.ts',
  'utils/uiPrefs.ts': 'utils/uiPrefs.ts',
  // Chat (copiado tal cual)
  'components/CommunityView.tsx': 'components/community/CommunityView.tsx',
  'components/community/AudioMessageBubble.tsx': 'components/community/AudioMessageBubble.tsx',
  'components/community/Avatar.tsx': 'components/community/Avatar.tsx',
  'components/community/ChatStoragePanel.tsx': 'components/community/ChatStoragePanel.tsx',
  'components/community/ConversationList.tsx': 'components/community/ConversationList.tsx',
  'components/community/ConversationPane.tsx': 'components/community/ConversationPane.tsx',
  'components/community/EmojiPicker.tsx': 'components/community/EmojiPicker.tsx',
  'components/community/EmptyState.tsx': 'components/community/EmptyState.tsx',
  'components/community/FloatingChatWindow.tsx': 'components/community/FloatingChatWindow.tsx',
  'components/community/GroupDetailsPanel.tsx': 'components/community/GroupDetailsPanel.tsx',
  'components/community/GroupsBridge.tsx': 'components/community/GroupsBridge.tsx',
  'components/community/NewConversationModal.tsx': 'components/community/NewConversationModal.tsx',
  'components/community/SidebarChatPanel.tsx': 'components/community/SidebarChatPanel.tsx',
  'components/community/SupportBridge.tsx': 'components/community/SupportBridge.tsx',
  'components/community/ViewModeMenu.tsx': 'components/community/ViewModeMenu.tsx',
  'components/community/VoiceRecorder.tsx': 'components/community/VoiceRecorder.tsx',
  'utils/useChatPrefs.ts': 'utils/useChatPrefs.ts',
  'utils/emojiData.ts': 'utils/emojiData.ts',
  'utils/image.ts': 'utils/image.ts',
  'utils/support.ts': 'utils/support.ts',
  'types/auth.ts': 'types/auth.ts',
  // Notas (copiadas tal cual; la orquestación está en components/notes/NotesSystem.tsx)
  'components/NotesBoard.tsx': 'components/notes/NotesBoard.tsx',
  'components/NoteEditor.tsx': 'components/notes/NoteEditor.tsx',
  'components/notes/NoteMenus.tsx': 'components/notes/NoteMenus.tsx',
  'components/notes/NoteWindow.tsx': 'components/notes/NoteWindow.tsx',
  'components/notes/NotesBridge.tsx': 'components/notes/NotesBridge.tsx',
  'components/notes/ShareNoteDialog.tsx': 'components/notes/ShareNoteDialog.tsx',
  'components/notes/ReceiveSharedNoteDialog.tsx': 'components/notes/ReceiveSharedNoteDialog.tsx',
  'components/notes/TextColorPicker.tsx': 'components/notes/TextColorPicker.tsx',
  'components/notes/VoiceNoteRecorder.tsx': 'components/notes/VoiceNoteRecorder.tsx',
  'utils/voiceVault.ts': 'utils/voiceVault.ts',
  'utils/noteImprove.ts': 'utils/noteImprove.ts',
  'components/databases/DatabaseEmbed.tsx': 'components/databases/DatabaseEmbed.tsx',
  'app/n/[token]/page.tsx': 'app/n/[token]/page.tsx',
  'utils/notes.ts': 'utils/notes.ts',
  'utils/mathText.ts': 'utils/mathText.ts',
  'lib/authFetch.ts': 'lib/authFetch.ts',
  // IA (pantalla del chat IA; el motor vive en la nube: App Master Cloud src/lib/ai)
  'components/ai/AIHistoryPanel.tsx': 'components/ai/AIHistoryPanel.tsx',
  'components/ai/ChatSidebar.tsx': 'components/ai/ChatSidebar.tsx',
  'components/ai/ChatMarkdown.tsx': 'components/ai/ChatMarkdown.tsx',
  'components/ai/EnginePicker.tsx': 'components/ai/EnginePicker.tsx',
  'components/ai/RandomFactCard.tsx': 'components/ai/RandomFactCard.tsx',
  'components/support/SupportErrorAction.tsx': 'components/support/SupportErrorAction.tsx',
  'utils/plans.ts': 'utils/plans.ts',
  // Calculadora flotante (en la plantilla se abre desde la barra superior y ⌘K)
  'components/CalculatorWidget.tsx': 'components/calculator/CalculatorWidget.tsx',
  'components/CalculatorConverter.tsx': 'components/calculator/CalculatorConverter.tsx',
  'components/CurrencyInput.tsx': 'components/calculator/CurrencyInput.tsx',
  'utils/unitConversions.ts': 'utils/unitConversions.ts',
  'utils/currencyConversion.ts': 'utils/currencyConversion.ts',
};

/** Adaptados en la plantilla: revisar el diff y aplicarlo a mano. */
const MANUAL = {
  'components/company/viewsStore.tsx': 'components/tables/viewsStore.tsx (guarda por app: app_table_views)',
  'utils/useDatabases.tsx': 'utils/useDatabases.tsx (guarda por app: app_databases)',
  'components/AmbientBackdrop.tsx': 'components/shell/AmbientBackdrop.tsx (colores por variables --amb-*)',
  'components/dashboard/DashboardUI.tsx': 'components/dashboard/DashboardUI.tsx (neón y asistente siguen el acento)',
  'components/GlobalSearch.tsx': 'components/shell/GlobalSearch.tsx (sin formatCLP)',
  'utils/globalSearch.ts': 'utils/globalSearch.ts (tipos genéricos)',
  'components/Topbar.tsx': 'components/shell/Topbar.tsx (genérica, sin ojo)',
  'components/Sidebar.tsx': 'components/shell/Sidebar.tsx (desde app.config)',
  'components/BottomDock.tsx': 'components/shell/BottomDock.tsx (desde app.config, Nube al centro)',
  'components/user/UserCenter.tsx': 'components/user/UserCenter.tsx (versión plantilla)',
  'components/mm/MMGate.tsx': 'components/mente/MenteGate.tsx',
  'components/mm/MenteMaestra.tsx': 'components/mente/MenteSingular.tsx',
  'app/layout.tsx': 'app/layout.tsx',
  'utils/useCommunityAccounts.ts': 'utils/useCommunityAccounts.ts (filtro y app por mensaje: utils/chatScope.ts)',
  'utils/useChatGroups.ts': 'utils/useChatGroups.ts (canales por app: utils/chatScope.ts)',
  'types/community.ts': 'types/community.ts (campo app en mensaje y conversación)',
  'utils/useNotes.ts': 'utils/useNotes.ts (notas por app: utils/chatScope.ts)',
  'components/FinanceChatView.tsx': 'components/ai/AIChatView.tsx (agentes y motores desde la nube, sin scope, textos generales)',
  'components/IAHome.tsx': 'components/ai/IAHome.tsx (solo Iniciar chat + créditos; sin reporte, dato random ni progreso)',
  'lib/aiClient.ts': 'lib/aiClient.ts (llama a la nube: APP.cloudUrl + app)',
  'utils/useAIConversations.ts': 'utils/useAIConversations.ts (solo las conversaciones de esta app)',
  'utils/aiCatalog.ts': 'utils/aiCatalog.ts (AGENTS los llena la nube)',
  'utils/iaQuotes.ts': 'utils/iaQuotes.ts (frases generales)',
  'components/ai/VoiceAssistant.tsx': 'components/ai/VoiceAssistant.tsx (voz por la nube: cloudAI + app + sections; sin scope)',
  'lib/ai/voice.ts': 'la voz del servidor está en la NUBE: App Master Cloud src/lib/ai/voice.ts y src/app/api/ai/voice/*',
  'lib/ai/engine.ts': 'el motor está en la NUBE: App Master Cloud src/lib/ai/* (llevar ahí los cambios del motor)',
  'app/api/calculator-solve/route.ts': 'App Master Cloud src/app/api/calculator-solve (la plantilla solo reenvía)',
  'app/api/currency-rates/route.ts': 'App Master Cloud src/app/api/currency-rates (la plantilla solo reenvía)',
  'utils/useSupabaseCollection.ts': 'utils/useSupabaseCollection.ts (sin viaje en el tiempo)',
  'types/finance.ts': 'types/notes.ts (solo los tipos de Notas, con campo app)',
  'app/page.tsx': 'components/community/ChatSystem.tsx y components/notes/NotesSystem.tsx (la orquestación del chat y de las notas que Finance tiene en su página)',
};

const rewrite = (src) =>
  src
    .replaceAll('@/components/company/confirm', '@/components/ui/confirm')
    .replaceAll('@/components/company/', '@/components/tables/')
    .replaceAll("'@/utils/mm'", "'@/utils/mente'")
    .replaceAll("'@/components/WolfLogo'", "'@/components/shell/WolfLogo'")
    .replaceAll("'@/components/community/CommunityView'", "'@/components/community/CommunityView'")
    .replaceAll("'@/components/NoteEditor'", "'@/components/notes/NoteEditor'")
    .replaceAll("'@/components/NotesBoard'", "'@/components/notes/NotesBoard'")
    .replaceAll("'@/types/finance'", "'@/types/notes'")
    .replaceAll("'@/components/CurrencyInput'", "'@/components/calculator/CurrencyInput'")
    .replaceAll("'@/components/CalculatorConverter'", "'@/components/calculator/CalculatorConverter'");

const git = (...args) => execFileSync('git', ['-C', FIN, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const show = (rev, path) => {
  try {
    return git('show', `${rev}:${path}`);
  } catch {
    return null;
  }
};

if (!existsSync(join(FIN, '.git'))) {
  console.error(`No encuentro Finance en ${FIN}. Usa FINANCE_DIR=/ruta/a/master-wolf-finance.`);
  process.exit(1);
}
git('fetch', '--quiet', 'origin');
const head = git('rev-parse', 'origin/main').trim();
const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : { financeCommit: null };
const base = state.financeCommit;

console.log(`Finance (GitHub) en ${head.slice(0, 7)} · última sincronización: ${base ? base.slice(0, 7) : 'nunca'}\n`);

if (base) {
  const log = git('log', '--format=  %h %ad %an  %s', '--date=short', `${base}..${head}`).trim();
  console.log(log ? `Commits nuevos en Finance:\n${log}\n` : 'Sin commits nuevos en Finance.\n');
}

// Lo que Emanuel marcó para la plantilla.
const claude = show(head, 'CLAUDE.md') || '';
const i = claude.indexOf('## Para la plantilla');
if (i >= 0) {
  const rest = claude.slice(i);
  const j = rest.indexOf('\n## ', 3);
  console.log(`${(j > 0 ? rest.slice(0, j) : rest).trim()}\n`);
} else {
  console.log('(El CLAUDE.md de Finance todavía no tiene la sección "## Para la plantilla".)\n');
}

// AUTO
const changed = [];
for (const [from, to] of Object.entries(AUTO)) {
  const src = show(head, from);
  if (src == null) {
    console.log(`⚠︎  ${from} ya no existe en Finance (revisar a mano)`);
    continue;
  }
  const next = rewrite(src);
  const dest = join(ROOT, to);
  const cur = existsSync(dest) ? readFileSync(dest, 'utf8') : null;
  if (cur !== next) changed.push({ from, to, next });
}
// Archivos nuevos de Finance que los automáticos importan y aún no están en la lista.
const known = new Set(Object.values(AUTO).concat(Object.values(MANUAL).map((m) => m.split(' ')[0])));
const missing = new Set();
for (const [from] of Object.entries(AUTO)) {
  const src = show(head, from) || '';
  for (const m of rewrite(src).matchAll(/from '@\/([^']+)'/g)) {
    const rel = m[1];
    const hit = ['.tsx', '.ts'].map((x) => rel + x).find((f) => known.has(f) || existsSync(join(ROOT, f)));
    if (!hit) missing.add(rel);
  }
}
if (missing.size) {
  console.log('⚠︎  Importan archivos que la plantilla no tiene (agrégalos a AUTO o MANUAL):');
  for (const m of missing) console.log(`  • @/${m}`);
  console.log('');
}
console.log(changed.length ? `Automáticos con cambios (${changed.length}):` : 'Automáticos: todo igual que Finance.');
for (const c of changed) console.log(`  • ${c.to}  ←  ${c.from}`);

// MANUAL
if (base) {
  const touched = Object.keys(MANUAL).filter((f) => git('diff', '--name-only', `${base}..${head}`, '--', f).trim());
  console.log(touched.length ? `\nPara revisar a mano (cambiaron en Finance):` : '\nManuales: sin cambios en Finance.');
  for (const f of touched) {
    console.log(`\n── ${f}  →  ${MANUAL[f]}`);
    console.log(git('diff', '--stat', `${base}..${head}`, '--', f).trim());
    if (process.argv.includes('--diff')) console.log(git('diff', `${base}..${head}`, '--', f));
  }
  if (touched.length && !process.argv.includes('--diff')) console.log('\n  (agrega --diff para ver los cambios línea por línea)');
}

if (!APPLY) {
  console.log('\nSolo revisión. Para copiar los automáticos: npm run sync:finance -- --apply');
  process.exit(0);
}
for (const c of changed) {
  mkdirSync(dirname(join(ROOT, c.to)), { recursive: true });
  writeFileSync(join(ROOT, c.to), c.next);
}
writeFileSync(STATE, JSON.stringify({ financeCommit: head, syncedAt: new Date().toISOString() }, null, 2) + '\n');
console.log(`\n✓ Copiados ${changed.length} archivos. Punto de sincronización: ${head.slice(0, 7)}.`);
console.log('Ahora: aplicar a mano los "para revisar", npm run build, probar y commit.');
