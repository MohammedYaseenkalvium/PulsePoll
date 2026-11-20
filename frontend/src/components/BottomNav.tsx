import React, { useEffect, useRef, useCallback } from 'react';
import gsap from 'gsap';
import { LayoutDashboard, Plus, Radio, LogOut } from 'lucide-react';

export type NavRoute = 'dashboard' | 'live';

export interface BottomNavProps {
  activeRoute: NavRoute;
  hasPolls?: boolean;
  hasOpenPoll?: boolean;
  onNavigateDashboard: () => void;
  onCreatePoll: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onNavigateLive: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onLogout: () => void;
}

interface NavItemConfig {
  id: 'dashboard' | 'create' | 'live' | 'logout';
  label: string;
  icon: React.ReactNode;
  isActive?: boolean;
  badgeDot?: boolean;
  isPrimaryAction?: boolean;
  isDanger?: boolean;
  dividerBefore?: boolean;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

const BASE_PAD_X = 14;
const HOVER_PAD_X = 20;
const NEIGHBOR_1_PAD_X = 11;
const NEIGHBOR_2_PAD_X = 12.5;

export const BottomNav: React.FC<BottomNavProps> = ({
  activeRoute,
  hasPolls = false,
  hasOpenPoll = false,
  onNavigateDashboard,
  onCreatePoll,
  onNavigateLive,
  onLogout,
}) => {
  const navRef = useRef<HTMLElement>(null);
  const pillContainerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const hoveredIndexRef = useRef<number | null>(null);

  const canAnimateSquish = useCallback(() => {
    if (typeof window === 'undefined') return false;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    return !reduced && !coarse;
  }, []);

  const isReducedMotion = useCallback(() => {
    return (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }, []);

  const items: NavItemConfig[] = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: <LayoutDashboard className="w-4 h-4 shrink-0" aria-hidden="true" />,
      isActive: activeRoute === 'dashboard',
      onClick: () => onNavigateDashboard(),
    },
    {
      id: 'create',
      label: 'Create Poll',
      icon: <Plus className="w-4 h-4 shrink-0" aria-hidden="true" />,
      isPrimaryAction: true,
      onClick: (e) => onCreatePoll(e),
    },
    ...(hasPolls || activeRoute === 'live'
      ? [
          {
            id: 'live' as const,
            label: 'Live Poll',
            icon: <Radio className="w-4 h-4 shrink-0" aria-hidden="true" />,
            isActive: activeRoute === 'live',
            badgeDot: hasOpenPoll,
            onClick: (e: React.MouseEvent<HTMLButtonElement>) => onNavigateLive(e),
          },
        ]
      : []),
    {
      id: 'logout',
      label: 'Sign Out',
      icon: <LogOut className="w-4 h-4 shrink-0" aria-hidden="true" />,
      isDanger: true,
      dividerBefore: true,
      onClick: () => onLogout(),
    },
  ];

  // Clean up any active GSAP tweens on unmount or reduced-motion change
  useEffect(() => {
    const ctx = gsap.context(() => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: reduce), (pointer: coarse)', () => {
        itemRefs.current.forEach((el) => {
          if (el) {
            gsap.set(el, {
              scaleX: 1,
              scaleY: 1,
              x: 0,
              paddingInline: BASE_PAD_X,
              transformOrigin: '50% 50%',
            });
          }
        });
      });
    }, navRef);

    return () => ctx.revert();
  }, [items.length]);

  // Apple-Style Neighbor-Squish Hover Physics:
  // Hovered item expands horizontally while pushing and laterally compressing adjacent sibling items
  const handleItemPointerEnter = (hoveredIdx: number, e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === 'touch' || !canAnimateSquish()) return;
    hoveredIndexRef.current = hoveredIdx;

    itemRefs.current.forEach((el, idx) => {
      if (!el) return;
      gsap.killTweensOf(el);

      if (idx === hoveredIdx) {
        // Hovered item expands horizontally
        gsap.to(el, {
          paddingInline: HOVER_PAD_X,
          scaleX: 1.06,
          scaleY: 0.96,
          x: 0,
          transformOrigin: '50% 50%',
          duration: 0.42,
          ease: 'elastic.out(1, 0.55)',
          overwrite: 'auto',
        });
      } else {
        // Adjacent and outer siblings compress laterally and nudge outward
        const dist = Math.abs(idx - hoveredIdx);
        const dir = idx < hoveredIdx ? -1 : 1;
        const isImmediateNeighbor = dist === 1;

        gsap.to(el, {
          paddingInline: isImmediateNeighbor ? NEIGHBOR_1_PAD_X : NEIGHBOR_2_PAD_X,
          scaleX: isImmediateNeighbor ? 0.92 : 0.96,
          scaleY: 1.02,
          x: dir * (isImmediateNeighbor ? 3.5 : 2),
          transformOrigin: dir < 0 ? '0% 50%' : '100% 50%',
          duration: 0.42,
          ease: 'elastic.out(1, 0.55)',
          overwrite: 'auto',
        });
      }
    });
  };

  // Spring all items smoothly back to neutral when the pointer leaves the navbar
  const handleNavPointerLeave = () => {
    hoveredIndexRef.current = null;
    if (!canAnimateSquish()) return;

    itemRefs.current.forEach((el) => {
      if (!el) return;
      gsap.killTweensOf(el);
      gsap.to(el, {
        paddingInline: BASE_PAD_X,
        scaleX: 1,
        scaleY: 1,
        x: 0,
        transformOrigin: '50% 50%',
        duration: 0.45,
        ease: 'elastic.out(1, 0.5)',
        overwrite: 'auto',
      });
    });
  };

  // Crisp press impulse (scale: 0.94) on pointerdown
  const handleItemPointerDown = (idx: number) => {
    if (isReducedMotion()) return;
    const el = itemRefs.current[idx];
    if (!el) return;

    gsap.killTweensOf(el, 'scaleX,scaleY');
    gsap.to(el, {
      scaleX: 0.94,
      scaleY: 0.94,
      duration: 0.1,
      ease: 'power2.out',
      overwrite: 'auto',
    });
  };

  // Rebound with elastic.out(1.1, 0.45) on release
  const handleItemPointerUp = (idx: number, e: React.PointerEvent<HTMLButtonElement>) => {
    if (isReducedMotion()) return;
    const el = itemRefs.current[idx];
    if (!el) return;

    const isStillHovered =
      e.pointerType !== 'touch' && canAnimateSquish() && hoveredIndexRef.current === idx;

    gsap.killTweensOf(el, 'scaleX,scaleY');
    gsap.to(el, {
      scaleX: isStillHovered ? 1.06 : 1,
      scaleY: isStillHovered ? 0.96 : 1,
      duration: 0.44,
      ease: 'elastic.out(1.1, 0.45)',
      overwrite: 'auto',
    });
  };

  return (
    <nav
      ref={navRef}
      aria-label="Creator navigation"
      onPointerLeave={handleNavPointerLeave}
      style={{ bottom: '20px' }}
      className="fixed left-1/2 -translate-x-1/2 z-40 max-w-[calc(100vw-24px)]"
    >
      <div
        ref={pillContainerRef}
        style={{
          backgroundColor: 'var(--bg-elevated)',
          border: '1px solid var(--border-subtle)',
        }}
        className="px-2 py-1.5 rounded-full backdrop-blur-md shadow-xl flex items-center gap-1"
      >
        {items.map((item, idx) => (
          <React.Fragment key={item.id}>
            {item.dividerBefore && (
              <div
                className="w-px h-5 bg-border-subtle mx-1 shrink-0"
                role="separator"
                aria-orientation="vertical"
              />
            )}

            <button
              ref={(el) => {
                itemRefs.current[idx] = el;
              }}
              type="button"
              aria-label={item.label}
              aria-current={item.isActive ? 'page' : undefined}
              onPointerEnter={(e) => handleItemPointerEnter(idx, e)}
              onPointerDown={() => handleItemPointerDown(idx)}
              onPointerUp={(e) => handleItemPointerUp(idx, e)}
              onClick={item.onClick}
              style={{
                paddingInline: `${BASE_PAD_X}px`,
                willChange: 'transform, padding',
              }}
              className={`relative py-2 rounded-full text-xs font-medium flex items-center gap-2 transition-colors duration-150 cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
                item.isActive
                  ? 'bg-primary-50 dark:bg-primary-950/70 text-primary-700 dark:text-primary-300 border border-primary-200 dark:border-primary-800/80 font-semibold'
                  : item.isPrimaryAction
                  ? 'bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover)] text-white shadow-xs border border-transparent'
                  : item.isDanger
                  ? 'text-content-secondary hover:text-error-600 hover:bg-error-50/70 dark:hover:bg-error-950/40 border border-transparent'
                  : 'text-content-secondary hover:text-content hover:bg-surface-elevated/60 border border-transparent'
              }`}
            >
              <span className="relative flex items-center justify-center">
                {item.icon}
                {item.badgeDot && (
                  <span
                    className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-success-500 animate-pulse ring-2 ring-surface"
                    aria-hidden="true"
                  />
                )}
              </span>
              <span className="whitespace-nowrap">{item.label}</span>
            </button>
          </React.Fragment>
        ))}
      </div>
    </nav>
  );
};
