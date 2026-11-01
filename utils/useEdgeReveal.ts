'use client';

import { useEffect, useRef, useState } from 'react';

/** How long the pointer has to rest on a screen edge before it reveals something. */
const EDGE_DELAY_MS = 700;
/** Pixels from the edge that count as "resting on it". */
const EDGE_PX = 8;
/** Below this scroll the header is always visible (the top of every view). */
const TOP_ZONE = 64;

/**
 * Auto-hiding header + hover-to-open sidebar (Emanuel, 2026-10-14):
 * - The header is visible at the top of the page and hides while scrolling
 *   down. It does NOT come back when scrolling up (it got in the way); it
 *   comes back at the top of the page, or by resting the mouse on the top
 *   edge of the window for a moment. Revealed that way, it hides again once
 *   the mouse moves well below it.
 * - Resting the mouse on the left edge opens the sidebar; opened that way, it
 *   closes again when the mouse leaves it.
 */
export function useEdgeReveal({
  sidebarOpen,
  openSidebar,
  closeSidebar,
  sidebarWidth = 256,
  enabled = true,
  autoHideHeader = true,
  edgeSidebar = true,
}: {
  sidebarOpen: boolean;
  openSidebar: () => void;
  closeSidebar: () => void;
  sidebarWidth?: number;
  enabled?: boolean;
  /** Configuración → "Ocultar la barra superior al bajar". */
  autoHideHeader?: boolean;
  /** Configuración → "Abrir el menú con el mouse en el borde izquierdo". */
  edgeSidebar?: boolean;
}) {
  const [headerShown, setHeaderShown] = useState(true);
  const headerShownRef = useRef(true);
  const headerByHover = useRef(false);
  const sidebarByHover = useRef(false);
  const sidebarOpenRef = useRef(sidebarOpen);
  const cbs = useRef({ openSidebar, closeSidebar });
  cbs.current = { openSidebar, closeSidebar };

  useEffect(() => {
    sidebarOpenRef.current = sidebarOpen;
    if (!sidebarOpen) sidebarByHover.current = false;
  }, [sidebarOpen]);

  const show = (v: boolean) => {
    if (headerShownRef.current === v) return;
    headerShownRef.current = v;
    setHeaderShown(v);
  };

  // Scroll: visible at the top, hidden while going down.
  useEffect(() => {
    if (!autoHideHeader) {
      headerByHover.current = false;
      show(true);
      return;
    }
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (y < TOP_ZONE) {
        headerByHover.current = false;
        show(true);
      } else if (y > last + 2) {
        headerByHover.current = false;
        show(false);
      }
      last = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [autoHideHeader]);

  // Pointer resting on the top / left edges.
  useEffect(() => {
    if (!enabled) return;
    let topTimer: number | null = null;
    let leftTimer: number | null = null;
    const clearTop = () => {
      if (topTimer !== null) window.clearTimeout(topTimer);
      topTimer = null;
    };
    const clearLeft = () => {
      if (leftTimer !== null) window.clearTimeout(leftTimer);
      leftTimer = null;
    };

    const onMove = (e: MouseEvent) => {
      // Top edge → header.
      if (e.clientY <= EDGE_PX) {
        if (!headerShownRef.current && topTimer === null) {
          topTimer = window.setTimeout(() => {
            topTimer = null;
            headerByHover.current = true;
            show(true);
          }, EDGE_DELAY_MS);
        }
      } else {
        clearTop();
        if (headerByHover.current && e.clientY > 180 && window.scrollY >= TOP_ZONE) {
          headerByHover.current = false;
          show(false);
        }
      }

      // Left edge → sidebar.
      if (!edgeSidebar) return;
      if (e.clientX <= EDGE_PX) {
        if (!sidebarOpenRef.current && leftTimer === null) {
          leftTimer = window.setTimeout(() => {
            leftTimer = null;
            sidebarByHover.current = true;
            cbs.current.openSidebar();
          }, EDGE_DELAY_MS);
        }
      } else {
        clearLeft();
        if (sidebarByHover.current && sidebarOpenRef.current && e.clientX > sidebarWidth + 48) {
          sidebarByHover.current = false;
          cbs.current.closeSidebar();
        }
      }
    };
    // Leaving the window (e.g. going up to the browser tabs) cancels both.
    const onLeave = () => {
      clearTop();
      clearLeft();
    };

    window.addEventListener('mousemove', onMove, { passive: true });
    document.documentElement.addEventListener('mouseleave', onLeave);
    return () => {
      clearTop();
      clearLeft();
      window.removeEventListener('mousemove', onMove);
      document.documentElement.removeEventListener('mouseleave', onLeave);
    };
  }, [enabled, sidebarWidth, edgeSidebar]);

  return { headerShown };
}
