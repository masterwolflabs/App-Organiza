// Copia de utils/aiCatalog.ts de Finance; en la plantilla los agentes vienen de la nube (ver AGENTS).
// Catalog shared by the IA chat UI and the Master Finanzas AI Engine (lib/ai/):
// the selectable engines (motor) and the investment agents of "Iniciar chat".
// Pure data — safe to import from client and server.

export type EngineProvider = 'openai' | 'anthropic';
export type EngineTier = 'rapido' | 'estandar' | 'profundo';

export interface EngineOption {
  id: string;
  label: string;
  description: string;
  /** Set for a specific model; tier-only options use the default provider. */
  provider?: EngineProvider;
  model?: string;
  /** Tier used for tool steps / output budget (and the model, for tier-only options). */
  tier?: EngineTier;
}

export const ENGINE_OPTIONS: EngineOption[] = [
  { id: 'auto', label: 'Auto', description: 'Elige el mejor motor para cada pregunta' },
  { id: 'rapido', label: 'Rápido', description: 'Respuestas cortas al instante', tier: 'rapido' },
  { id: 'estandar', label: 'Estándar', description: 'Análisis con tus datos reales', tier: 'estandar' },
  { id: 'profundo', label: 'Profundo', description: 'Razona más a fondo, tarda más', tier: 'profundo' },
  { id: 'gpt-4o-mini', label: 'GPT-4o mini', description: 'OpenAI · ágil y económico', provider: 'openai', model: 'gpt-4o-mini', tier: 'estandar' },
  { id: 'gpt-4o', label: 'GPT-4o', description: 'OpenAI · más capaz', provider: 'openai', model: 'gpt-4o', tier: 'profundo' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', description: 'Anthropic · rápido', provider: 'anthropic', model: 'claude-haiku-4-5', tier: 'estandar' },
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', description: 'Anthropic · análisis profundo', provider: 'anthropic', model: 'claude-sonnet-5', tier: 'profundo' },
];

export const engineById = (id: unknown): EngineOption => ENGINE_OPTIONS.find((e) => e.id === id) ?? ENGINE_OPTIONS[0];

export interface AgentOption {
  id: string;
  emoji: string;
  name: string;
  tagline: string;
  /** Extra instructions for the engine (the investments-only rule applies to all). */
  focus: string;
  suggestions: string[];
}

/**
 * Plantilla: los agentes de "Iniciar chat" los define cada app en la nube
 * (hub_apps.ai, SQL 11) y llegan con fetchAvailableEngines (lib/aiClient.ts),
 * que llena esta lista. Hasta entonces, un asistente general.
 */
export const AGENTS: AgentOption[] = [
  {
    id: 'asistente',
    emoji: '🤖',
    name: 'Asistente',
    tagline: 'Te ayuda con todo dentro de la app',
    focus: '',
    suggestions: ['¿Qué notas tengo?', 'Resume mi última nota', '¿Qué bases de datos tengo?', 'Ayúdame a ordenar una idea'],
  },
];

/** Reemplaza los agentes por los de esta app (misma lista, así quien la importó ve los nuevos). */
export function setAppAgents(list: Omit<AgentOption, 'focus'>[]) {
  if (list.length) AGENTS.splice(0, AGENTS.length, ...list.map((a) => ({ ...a, focus: '' })));
}

export const agentById = (id: unknown): AgentOption => AGENTS.find((a) => a.id === id) ?? AGENTS[0];
