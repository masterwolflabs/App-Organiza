'use client';

import { FILE_DROP } from '@/utils/fileDrop';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { APP } from '@/app.config';
import { ALL_SECTIONS, AnySection } from '@/utils/sections';
import { SETTINGS_PAGES, VIEWS } from '@/components/views';
import { supabase } from '@/lib/supabaseClient';
import { AmbientBackdrop } from '@/components/shell/AmbientBackdrop';
import { Sidebar } from '@/components/shell/Sidebar';
import { Topbar } from '@/components/shell/Topbar';
import { BottomDock } from '@/components/shell/BottomDock';
import { GlobalSearch } from '@/components/shell/GlobalSearch';
import { UserCenter, UserSection } from '@/components/user/UserCenter';
import { MenteSingular } from '@/components/mente/MenteSingular';
import { ConfirmProvider } from '@/components/ui/confirm';
import { TableViewsProvider } from '@/components/tables/viewsStore';
import { DatabaseStoreProvider, supabaseDatabaseStore } from '@/utils/useDatabases';
import { ChatProvider, ChatView, useChat } from '@/components/community/ChatSystem';
import { NotesProvider, NotesView } from '@/components/notes/NotesSystem';
import { IAHome } from '@/components/ai/IAHome';
import { VoiceAssistant } from '@/components/ai/VoiceAssistant';
import { CalculatorWidget, CalculatorWidgetHandle } from '@/components/calculator/CalculatorWidget';
import { HelpTips } from '@/components/ui/HelpTips';
import { SearchItem } from '@/utils/globalSearch';
import { useEdgeReveal } from '@/utils/useEdgeReveal';
import { loadUiPrefs, saveUiPrefs, UiPrefs, DEFAULT_UI_PREFS } from '@/utils/uiPrefs';
import { loadThemePref, saveThemePref, ThemePref, applyTheme } from '@/utils/theme';
import { CLOCK_EVENT } from '@/utils/appClock';
import { ClockBanner } from '@/components/shell/ClockBanner';
import { AccentId, LightsId, loadAccent, loadLights, saveAppearance } from '@/utils/appearance';
import { openCloud, touchApp } from '@/utils/cloud';
import { useMyRole } from '@/utils/mente';
import { SpaceProvider, SpaceSwitch } from '@/components/organiza/space';
import { GuidedTour, TourPrompt } from '@/components/tour/GuidedTour';
import { Reminders } from '@/components/organiza/Reminders';
import { AIActionsHost } from '@/components/organiza/AIConfirm';
import { AutoFocus } from '@/components/organiza/AutoFocus';

/**
 * Esqueleto de la app (versión plantilla del app/page.tsx de Finance).
 * Cada sección de app.config.ts tiene aquí su vista. Agrega las tuyas.
 */
const keys = ALL_SECTIONS.map((s) => s.key);
const sectionFromHash = (): AnySection => {
  const h = typeof window === 'undefined' ? '' : window.location.hash.slice(1);
  return keys.includes(h as AnySection) ? (h as AnySection) : 'inicio';
};

export function AppShell({ session }: { session: Session }) {
  const user = session.user;
  const [section, setSection] = useState<AnySection>('inicio');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userCenter, setUserCenter] = useState<UserSection | null>(null);
  // Perfil y Configuración ocupan una entrada del historial: Atrás del navegador (o deslizar) los cierra.
  const openUserCenter = useCallback((s: UserSection) => {
    if (!history.state?.userCenter) history.pushState({ ...history.state, userCenter: true }, '', window.location.href);
    setUserCenter(s);
  }, []);
  const closeUserCenter = useCallback(() => {
    if (history.state?.userCenter) history.back();
    else setUserCenter(null);
  }, []);
  const [menteOpen, setMenteOpen] = useState(false);
  // IA: la conversación abierta sobrevive al navegar; con el chat abierto, ocupa toda la pantalla.
  const [iaConversationId, setIaConversationId] = useState<string | null>(null);
  const [iaChatOpen, setIaChatOpen] = useState(false);
  useEffect(() => {
    const toIA = () => navigate('ia');
    window.addEventListener(FILE_DROP, toIA);
    return () => window.removeEventListener(FILE_DROP, toIA);
  }, []);
  const calculatorRef = useRef<CalculatorWidgetHandle>(null);
  const openCalculator = useCallback(() => calculatorRef.current?.open(), []);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>((user.user_metadata?.avatar_url as string) ?? null);

  const [theme, setThemeState] = useState<ThemePref>('system');
  const [accent, setAccent] = useState<AccentId>(APP.accent);
  const [lights, setLights] = useState<LightsId>('accent');
  const [ui, setUiState] = useState<UiPrefs>(DEFAULT_UI_PREFS);

  const [tourOpen, setTourOpen] = useState(false);
  const [tourAsk, setTourAsk] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem(TOUR_KEY) !== 'no' && !sessionStorage.getItem(TOUR_KEY)) setTourAsk(true);
    } catch {
      /* modo privado */
    }
  }, []);
  const role = useMyRole(user.id);
  const databaseStore = useMemo(() => supabaseDatabaseStore(user.id), [user.id]);

  // Preferencias de este navegador + aviso a la nube de que se abrió la app.
  useEffect(() => {
    setThemeState(loadThemePref());
    setAccent(loadAccent());
    setLights(loadLights());
    setUiState(loadUiPrefs());
    touchApp();
  }, []);

  // «Según la hora»: se revisa cada 30 s y al cambiar la hora de la app o tus partes del día.
  useEffect(() => {
    if (theme !== 'hora') return;
    const on = () => applyTheme('hora');
    on();
    const t = setInterval(on, 30_000);
    window.addEventListener(CLOCK_EVENT, on);
    window.addEventListener('storage', on);
    return () => {
      clearInterval(t);
      window.removeEventListener(CLOCK_EVENT, on);
      window.removeEventListener('storage', on);
    };
  }, [theme]);

  // "Sistema" sigue los cambios del sistema operativo en vivo.
  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const on = () => applyTheme('system');
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [theme]);

  // Perfil compartido (tabla profiles, la misma de Finance y la nube).
  useEffect(() => {
    supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.displayName) setProfileName(data.displayName as string);
        if (data?.avatarUrl) setAvatarUrl(data.avatarUrl as string);
      });
  }, [user.id]);

  // Sección en la dirección (#clave): atrás/adelante del navegador funcionan.
  useEffect(() => {
    setSection(sectionFromHash());
    const onPop = () => {
      setSection(sectionFromHash());
      setUserCenter(null);
      setMenteOpen(false);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((key: AnySection) => {
    setSection(key);
    const hash = key === 'inicio' ? '' : `#${key}`;
    if (window.location.hash !== hash) history.pushState(history.state, '', `${window.location.pathname}${hash}`);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  useEffect(() => {
    const label = ALL_SECTIONS.find((s) => s.key === section)?.label;
    document.title = section === 'inicio' ? APP.name : `${APP.name} - ${label}`;
  }, [section]);

  const displayName = profileName || (user.user_metadata?.full_name as string) || user.email?.split('@')[0] || 'Usuario';
  const fullScreen = userCenter !== null || menteOpen;

  const { headerShown } = useEdgeReveal({
    autoHideHeader: ui.autoHideHeader,
    edgeSidebar: ui.edgeSidebar,
    sidebarOpen,
    openSidebar: () => setSidebarOpen(true),
    closeSidebar: () => setSidebarOpen(false),
    enabled: !fullScreen,
  });

  const openSettings = useCallback(() => openUserCenter('configuracion'), [openUserCenter]);
  const goCloud = useCallback(() => {
    openCloud();
  }, []);
  const openMente = role ? () => setMenteOpen(true) : undefined;

  const quick: SearchItem[] = useMemo(
    () => [
      { id: 'calc', kind: 'accion', title: 'Calculadora', subtitle: 'Básica, científica y conversor de monedas', icon: '🧮', keywords: 'calcular sumar restar multiplicar dividir porcentaje iva conversor moneda dolar', run: openCalculator },
      { id: 'config', kind: 'accion', title: 'Configuración', subtitle: 'Tema, paleta, luces y navegación', icon: '⚙️', run: openSettings },
      { id: 'cloud', kind: 'accion', title: 'Abrir App Master Cloud', icon: '☁️', run: goCloud },
      { id: 'tour', kind: 'accion', title: 'Tutorial de la app', subtitle: 'Recorrido guiado con voz', icon: '🧭', keywords: 'ayuda guia tour', run: () => setTourOpen(true) },
    ],
    [openSettings, goCloud, openCalculator]
  );

  const getSearchItems = (): SearchItem[] => [
    ...quick,
    ...ALL_SECTIONS.map((s): SearchItem => ({ id: `s-${s.key}`, kind: 'seccion', title: s.label, run: () => navigate(s.key) })),
    { id: 'perfil', kind: 'ajuste', title: 'Perfil', keywords: 'nombre foto cuenta', run: () => openUserCenter('perfil') },
    { id: 'seguridad', kind: 'ajuste', title: 'Seguridad e inicio de sesión', keywords: 'contraseña dispositivos sesiones', run: () => openUserCenter('seguridad') },
    { id: 'tema', kind: 'ajuste', title: 'Tema claro u oscuro', keywords: 'apariencia color paleta luces', run: openSettings },
    ...(openMente ? [{ id: 'mente', kind: 'accion' as const, title: 'Mente Singular', keywords: 'administración admin laboratorio auditoría', icon: '🧠', run: openMente }] : []),
    // Agrega aquí los registros de tu app: { kind: 'registro', title, subtitle, amount?, run }
  ];

  // Voz: a qué secciones puede llevar y en cuál está la persona.
  const voiceSections = useMemo(() => Object.fromEntries(ALL_SECTIONS.map((s) => [s.key, s.label])), []);
  const sectionLabel = ALL_SECTIONS.find((s) => s.key === section)?.label ?? 'Inicio';

  const View = section === 'chat' || section === 'notas' || section === 'ia' ? null : VIEWS[section];
  const chatSession = useMemo(
    () => ({ userId: user.id, email: user.email ?? '', displayName, avatarUrl }),
    [user.id, user.email, displayName, avatarUrl]
  );

  return (
    // Chat compartido con la nube, solo con los canales y mensajes de esta app.
    <SpaceProvider userId={user.id} email={user.email ?? null} name={displayName}>
    <ChatProvider session={chatSession} scope={CHAT_SCOPE} inChat={section === 'chat'} onOpenChat={() => navigate('chat')}>
    <ClockBanner />
    {/* Datos estilo Notion de este usuario en esta app (vistas de tablas + bases de datos), también dentro de las notas. */}
    <ConfirmProvider>
    <TableViewsProvider scope={user.id}>
    <DatabaseStoreProvider store={databaseStore}>
    {/* Notas compartidas con Finance y la nube, solo las de esta app. Montadas aquí: una nota abierta sigue viva al navegar. */}
    <NotesProvider session={chatSession} scope={CHAT_SCOPE} onOpenNotes={() => navigate('notas')}>
    {/* Sin fondo aquí: body pinta el fondo y las luces quedan entre medio (-z-10). */}
    <div className="flex min-h-screen overflow-x-clip text-white">
      <AmbientBackdrop />
      <Sidebar
        activeSection={section}
        onNavigate={navigate}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onOpenSettings={openSettings}
        onOpenCloud={goCloud}
        onOpenMente={openMente}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <div className={`sticky top-0 z-30 transition-transform duration-300 ease-out ${headerShown ? 'translate-y-0' : '-translate-y-full'}`} hidden={section === 'chat'}>
          <ChatBell>
          {(unread) => (
          <Topbar
            unreadCount={unread}
            onOpenNotifications={() => navigate('chat')}
            onOpenCalculator={openCalculator}
            onOpenTour={() => setTourOpen(true)}
            displayName={displayName}
            avatarUrl={avatarUrl}
            extra={<SpaceSwitch />}
            search={<GlobalSearch getItems={getSearchItems} quick={quick} />}
            onOpenSidebar={() => setSidebarOpen(true)}
            onOpenUserCenter={openUserCenter}
            onOpenCloud={goCloud}
            onOpenMente={openMente}
            onLogout={() => supabase.auth.signOut()}
          />
          )}
          </ChatBell>
        </div>
        <main className="mx-auto w-full max-w-[1640px] px-4 py-8 pb-36 sm:px-6 lg:px-8">
          {section === 'notas' ? (
            <NotesView scopeLabel={APP.name} />
          ) : section === 'ia' ? (
            // IA con el motor de App Master Cloud (las llaves viven solo allá).
            <IAHome
              userId={user.id}
              activeConversationId={iaConversationId}
              onActiveConversationChange={setIaConversationId}
              onBack={() => navigate('inicio')}
              onChatOpenChange={setIaChatOpen}
            />
          ) : (
            View && <View onOpenSettings={openSettings} onOpenCloud={goCloud} />
          )}
        </main>
      </div>

      {section !== 'chat' && !(section === 'ia' && iaChatOpen) && <BottomDock activeSection={section} onNavigate={navigate} onOpenSettings={openSettings} onOpenCloud={goCloud} />}

      {userCenter && (
        <UserCenter
          user={{
            id: user.id,
            email: user.email ?? '',
            displayName,
            avatarUrl,
            providers: (user.identities ?? []).map((i) => i.provider),
          }}
          initial={userCenter}
          pages={SETTINGS_PAGES}
          onClose={closeUserCenter}
          onProfileSaved={setProfileName}
          settings={{
            theme,
            setTheme: (t) => {
              setThemeState(t);
              saveThemePref(t);
            },
            accent,
            lights,
            setAppearance: (a, l) => {
              setAccent(a);
              setLights(l);
              saveAppearance(a, l);
            },
            ui,
            setUi: (p) => {
              setUiState(p);
              saveUiPrefs(p);
            },
          }}
        />
      )}

      {menteOpen && role && <MenteSingular role={role} onClose={() => setMenteOpen(false)} onOpenCloud={goCloud} />}
      {section === 'chat' && <ChatView onBack={() => navigate('inicio')} />}

      <GuidedTour open={tourOpen} onEnterStep={(step) => step.section && navigate(step.section as AnySection)} onClose={() => setTourOpen(false)} />
      {tourAsk && (
        <TourPrompt
          name={displayName.split(' ')[0]}
          onStart={() => {
            setTourAsk(false);
            try { sessionStorage.setItem(TOUR_KEY, '1'); } catch { /* modo privado */ }
            setTourOpen(true);
          }}
          onDismiss={(never) => {
            setTourAsk(false);
            try {
              sessionStorage.setItem(TOUR_KEY, '1');
              if (never) localStorage.setItem(TOUR_KEY, 'no');
            } catch { /* modo privado */ }
          }}
        />
      )}
      <Reminders />
      <AutoFocus />
      <AIActionsHost />

      {/* Calculadora de Finance: flota encima de todas las páginas y ventanas (portal, z-[95]). */}
      <CalculatorWidget ref={calculatorRef} />
      {/* Ayuda de 2 segundos: cualquier elemento con data-help (como en Finance). */}
      <HelpTips />

      {/* Asistente de voz en tiempo real (por App Master Cloud): en todas partes menos en los chats a pantalla completa. */}
      {section !== 'chat' && !(section === 'ia' && iaChatOpen) && !fullScreen && (
        <VoiceAssistant
          sections={voiceSections}
          where={sectionLabel}
          onNavigate={(key) => keys.includes(key as AnySection) && navigate(key as AnySection)}
          userName={displayName}
        />
      )}
    </div>
    </NotesProvider>
    </DatabaseStoreProvider>
    </TableViewsProvider>
    </ConfirmProvider>
    </ChatProvider>
    </SpaceProvider>
  );
}

const TOUR_KEY = 'organiza-tour';
const CHAT_SCOPE = { filter: APP.slug, send: APP.slug };

/** Campana de la barra superior: mensajes sin leer del chat. */
function ChatBell({ children }: { children: (unread: number) => React.ReactNode }) {
  const chat = useChat();
  return <>{children(chat?.unread ?? 0)}</>;
}
