import React, { useEffect, useState, useRef } from 'react';
import gsap from 'gsap';
import { Sun, Moon } from 'lucide-react';

export interface ThemeToggleProps {
  className?: string;
  size?: number;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ className = '', size = 20 }) => {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light';
    const stored = localStorage.getItem('pulsepoll-theme');
    if (stored === 'dark' || stored === 'light') return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  const sunRef = useRef<HTMLDivElement>(null);
  const moonRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const isFirstMount = useRef(true);

  // Sync class on document element
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
    } else {
      root.classList.add('light');
      root.classList.remove('dark');
    }
    localStorage.setItem('pulsepoll-theme', theme);
  }, [theme]);

  // GSAP animation on theme change
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      // Set initial visual positions without full animation
      if (theme === 'dark') {
        gsap.set(sunRef.current, { scale: 0, rotation: -90, opacity: 0 });
        gsap.set(moonRef.current, { scale: 1, rotation: 0, opacity: 1 });
      } else {
        gsap.set(sunRef.current, { scale: 1, rotation: 0, opacity: 1 });
        gsap.set(moonRef.current, { scale: 0, rotation: 90, opacity: 0 });
      }
      return;
    }

    const ctx = gsap.context(() => {
      const mm = gsap.matchMedia();

      mm.add('(prefers-reduced-motion: reduce)', () => {
        if (theme === 'dark') {
          gsap.set(sunRef.current, { opacity: 0, scale: 0 });
          gsap.set(moonRef.current, { opacity: 1, scale: 1, rotation: 0 });
        } else {
          gsap.set(sunRef.current, { opacity: 1, scale: 1, rotation: 0 });
          gsap.set(moonRef.current, { opacity: 0, scale: 0 });
        }
      });

      mm.add('(prefers-reduced-motion: no-preference)', () => {
        const tl = gsap.timeline({ defaults: { ease: 'power2.out' } });

        if (theme === 'dark') {
          // Transition sun out (rotate & shrink), moon in (rotate into place & bounce slightly)
          tl.to(
            sunRef.current,
            {
              scale: 0.3,
              rotation: -100,
              opacity: 0,
              duration: 0.32,
              force3D: true,
            },
            0
          ).fromTo(
            moonRef.current,
            {
              scale: 0.4,
              rotation: 80,
              opacity: 0,
            },
            {
              scale: 1,
              rotation: 0,
              opacity: 1,
              duration: 0.4,
              ease: 'back.out(1.8)',
              force3D: true,
            },
            0.12
          );
        } else {
          // Transition moon out, sun in
          tl.to(
            moonRef.current,
            {
              scale: 0.3,
              rotation: 100,
              opacity: 0,
              duration: 0.32,
              force3D: true,
            },
            0
          ).fromTo(
            sunRef.current,
            {
              scale: 0.4,
              rotation: -80,
              opacity: 0,
            },
            {
              scale: 1,
              rotation: 0,
              opacity: 1,
              duration: 0.4,
              ease: 'back.out(1.8)',
              force3D: true,
            },
            0.12
          );
        }
      });
    }, buttonRef);

    return () => ctx.revert();
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={toggleTheme}
      aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
      className={`relative inline-flex items-center justify-center p-2 rounded-xl transition-all duration-200 
        bg-surface hover:bg-surface-elevated text-content-secondary hover:text-content 
        border border-border-subtle hover:border-border-strong 
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 shadow-sm ${className}`}
    >
      <div className="relative w-6 h-6 flex items-center justify-center overflow-hidden">
        <div ref={sunRef} className="absolute inset-0 flex items-center justify-center text-warning-500">
          <Sun size={size} strokeWidth={2.2} />
        </div>
        <div ref={moonRef} className="absolute inset-0 flex items-center justify-center text-primary-400">
          <Moon size={size} strokeWidth={2.2} />
        </div>
      </div>
    </button>
  );
};
