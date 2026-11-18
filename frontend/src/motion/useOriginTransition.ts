import { useState, useRef, useCallback, useEffect } from 'react';
import gsap from 'gsap';

export interface OriginRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface UseOriginTransitionOptions {
  durationIn?: number;
  durationOut?: number;
  easeIn?: string;
  easeOut?: string;
}

export function useOriginTransition(options: UseOriginTransitionOptions = {}) {
  const {
    durationIn = 0.36,
    durationOut = 0.24,
    easeIn = 'power3.out',
    easeOut = 'power2.in',
  } = options;

  const [origin, setOrigin] = useState<OriginRect | null>(null);
  const originRef = useRef<OriginRect | null>(null);
  const mmRef = useRef<gsap.MatchMedia | null>(null);
  const ctxRef = useRef<gsap.Context | null>(null);

  useEffect(() => {
    originRef.current = origin;
  }, [origin]);

  useEffect(() => {
    mmRef.current = gsap.matchMedia();
    return () => {
      mmRef.current?.revert();
      ctxRef.current?.revert();
    };
  }, []);

  const captureOrigin = useCallback((targetOrEvent: React.MouseEvent<HTMLElement> | HTMLElement | DOMRect) => {
    let rect: DOMRect;
    if ('currentTarget' in targetOrEvent && targetOrEvent.currentTarget) {
      rect = targetOrEvent.currentTarget.getBoundingClientRect();
    } else if (targetOrEvent instanceof HTMLElement) {
      rect = targetOrEvent.getBoundingClientRect();
    } else if ('left' in targetOrEvent && 'top' in targetOrEvent) {
      rect = targetOrEvent as DOMRect;
    } else {
      return;
    }

    const saved: OriginRect = {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    };
    originRef.current = saved;
    setOrigin(saved);
  }, []);

  const clearOrigin = useCallback(() => {
    originRef.current = null;
    setOrigin(null);
  }, []);

  const animateIn = useCallback(
    (targetEl: HTMLElement | null, customOrigin?: OriginRect | null, onComplete?: () => void) => {
      if (!targetEl) return;
      const trig = customOrigin || originRef.current;

      ctxRef.current?.revert();
      ctxRef.current = gsap.context(() => {
        const mm = mmRef.current || gsap.matchMedia();

        mm.add('(prefers-reduced-motion: reduce)', () => {
          gsap.fromTo(
            targetEl,
            { opacity: 0 },
            { opacity: 1, duration: 0.15, ease: 'none', onComplete }
          );
        });

        mm.add('(prefers-reduced-motion: no-preference)', () => {
          if (!trig) {
            gsap.fromTo(
              targetEl,
              { opacity: 0, scale: 0.94, y: 12 },
              { opacity: 1, scale: 1, y: 0, duration: durationIn, ease: easeIn, force3D: true, onComplete }
            );
            return;
          }

          const targetRect = targetEl.getBoundingClientRect();
          const targetCenterX = targetRect.left + targetRect.width / 2;
          const targetCenterY = targetRect.top + targetRect.height / 2;
          const trigCenterX = trig.left + trig.width / 2;
          const trigCenterY = trig.top + trig.height / 2;

          const deltaX = trigCenterX - targetCenterX;
          const deltaY = trigCenterY - targetCenterY;
          const initialScale = Math.max(0.12, Math.min(trig.width / (targetRect.width || 1), trig.height / (targetRect.height || 1)));

          gsap.fromTo(
            targetEl,
            {
              x: deltaX,
              y: deltaY,
              scale: initialScale,
              opacity: 0,
              transformOrigin: '50% 50%',
            },
            {
              x: 0,
              y: 0,
              scale: 1,
              opacity: 1,
              duration: durationIn,
              ease: easeIn,
              force3D: true,
              clearProps: 'transformOrigin',
              onComplete,
            }
          );
        });
      });
    },
    [durationIn, easeIn]
  );

  const animateOut = useCallback(
    (targetEl: HTMLElement | null, customOrigin?: OriginRect | null, onComplete?: () => void) => {
      if (!targetEl) return;
      const trig = customOrigin || originRef.current;

      ctxRef.current?.revert();
      ctxRef.current = gsap.context(() => {
        const mm = mmRef.current || gsap.matchMedia();

        mm.add('(prefers-reduced-motion: reduce)', () => {
          gsap.to(targetEl, {
            opacity: 0,
            duration: 0.12,
            ease: 'none',
            onComplete,
          });
        });

        mm.add('(prefers-reduced-motion: no-preference)', () => {
          if (!trig) {
            gsap.to(targetEl, {
              opacity: 0,
              scale: 0.94,
              y: 8,
              duration: durationOut,
              ease: easeOut,
              force3D: true,
              onComplete,
            });
            return;
          }

          const targetRect = targetEl.getBoundingClientRect();
          const targetCenterX = targetRect.left + targetRect.width / 2;
          const targetCenterY = targetRect.top + targetRect.height / 2;
          const trigCenterX = trig.left + trig.width / 2;
          const trigCenterY = trig.top + trig.height / 2;

          const deltaX = trigCenterX - targetCenterX;
          const deltaY = trigCenterY - targetCenterY;
          const exitScale = Math.max(0.15, Math.min(trig.width / (targetRect.width || 1), trig.height / (targetRect.height || 1)));

          gsap.to(targetEl, {
            x: deltaX,
            y: deltaY,
            scale: exitScale,
            opacity: 0,
            duration: durationOut,
            ease: easeOut,
            force3D: true,
            onComplete,
          });
        });
      });
    },
    [durationOut, easeOut]
  );

  return {
    origin,
    originRef,
    captureOrigin,
    clearOrigin,
    animateIn,
    animateOut,
  };
}
