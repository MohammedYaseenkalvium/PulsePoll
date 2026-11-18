import React, { useState, useRef } from 'react';
import { ThemeToggle } from './motion/ThemeToggle';
import { useOriginTransition } from './motion/useOriginTransition';
import { Activity, X, CheckCircle2, AlertTriangle, AlertCircle, Sparkles } from 'lucide-react';

export const App: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const modalCardRef = useRef<HTMLDivElement>(null);
  const { captureOrigin, animateIn, animateOut } = useOriginTransition();

  const handleOpenModal = (e: React.MouseEvent<HTMLButtonElement>) => {
    captureOrigin(e);
    setIsModalOpen(true);
    // Give react time to mount the DOM node before animating in
    requestAnimationFrame(() => {
      if (modalCardRef.current) {
        animateIn(modalCardRef.current);
      }
    });
  };

  const handleCloseModal = () => {
    if (modalCardRef.current) {
      animateOut(modalCardRef.current, null, () => {
        setIsModalOpen(false);
      });
    } else {
      setIsModalOpen(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas text-content transition-colors duration-200 p-6 md:p-12 flex flex-col items-center">
      {/* Header bar */}
      <header className="w-full max-w-4xl flex items-center justify-between pb-8 border-b border-border-subtle">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-600 text-white flex items-center justify-center shadow-md">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-content">PulsePoll</h1>
            <p className="text-xs text-content-secondary">Real-Time Foundation Architecture</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <ThemeToggle />
        </div>
      </header>

      {/* Main container */}
      <main className="w-full max-w-4xl mt-10 space-y-8">
        {/* Foundation Status Card */}
        <section className="p-6 md:p-8 rounded-2xl bg-surface border border-border-subtle shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-primary-500 font-semibold text-sm">
              <Sparkles className="w-4 h-4" />
              <span>Foundation Verified</span>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-full bg-success-50 text-success-700 dark:bg-success-900/30 font-medium">
              Zero-FOUC & Tokens Active
            </span>
          </div>

          <h2 className="text-2xl font-bold text-content">Design System & GSAP Motion Primitives</h2>
          <p className="text-sm text-content-secondary leading-relaxed">
            All color tokens are bound to semantic CSS variables mapped through Tailwind CSS. Hardcoded hex colors are completely eliminated.
          </p>

          {/* Palette Tokens Verification Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
            <div className="p-3 rounded-xl bg-primary-50 dark:bg-primary-950/40 border border-primary-200 dark:border-primary-800 text-center">
              <div className="w-full h-8 rounded-lg bg-primary-600 mb-2 flex items-center justify-center text-white text-xs font-mono font-medium">
                #4F46E5
              </div>
              <span className="text-xs font-semibold text-primary-700 dark:text-primary-300">Primary (Indigo)</span>
            </div>

            <div className="p-3 rounded-xl bg-success-50 dark:bg-success-950/40 border border-success-200 dark:border-success-800 text-center">
              <div className="w-full h-8 rounded-lg bg-success-600 mb-2 flex items-center justify-center text-white text-xs font-mono font-medium">
                #059669
              </div>
              <span className="text-xs font-semibold text-success-700 dark:text-success-300">Success Emerald</span>
            </div>

            <div className="p-3 rounded-xl bg-warning-50 dark:bg-warning-950/40 border border-warning-200 dark:border-warning-800 text-center">
              <div className="w-full h-8 rounded-lg bg-warning-500 mb-2 flex items-center justify-center text-neutral-900 text-xs font-mono font-medium">
                #F59E0B
              </div>
              <span className="text-xs font-semibold text-warning-700 dark:text-warning-300">Warning Amber</span>
            </div>

            <div className="p-3 rounded-xl bg-error-50 dark:bg-error-950/40 border border-error-200 dark:border-error-800 text-center">
              <div className="w-full h-8 rounded-lg bg-error-600 mb-2 flex items-center justify-center text-white text-xs font-mono font-medium">
                #DC2626
              </div>
              <span className="text-xs font-semibold text-error-700 dark:text-error-300">Error Red</span>
            </div>
          </div>

          {/* Interactive Origin Transition Trigger */}
          <div className="pt-4 border-t border-border-subtle flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-content">Origin-Aware GSAP Motion Test</h3>
              <p className="text-xs text-content-secondary">
                Click below to launch an origin-aware modal that expands from the trigger button's coordinates.
              </p>
            </div>
            <button
              type="button"
              onClick={handleOpenModal}
              className="px-5 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-700 active:scale-95 text-white font-medium text-sm transition-all duration-150 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-neutral-950"
            >
              Launch Origin Transition
            </button>
          </div>
        </section>

        {/* Backend & Architecture Overview */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-5 rounded-2xl bg-surface border border-border-subtle shadow-sm space-y-2">
            <div className="flex items-center gap-2 text-success-700 dark:text-success-400 font-semibold text-xs">
              <CheckCircle2 className="w-4 h-4" />
              <span>Go 1.27 + Gin</span>
            </div>
            <h4 className="font-semibold text-sm text-content">REST API & SSE</h4>
            <p className="text-xs text-content-secondary leading-relaxed">
              JWT authentication, bcrypt hashing, poll lifecycle handlers, and SSE live vote streaming.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-surface border border-border-subtle shadow-sm space-y-2">
            <div className="flex items-center gap-2 text-warning-700 dark:text-warning-400 font-semibold text-xs">
              <AlertTriangle className="w-4 h-4" />
              <span>Redis 7 (Doing Real Work)</span>
            </div>
            <h4 className="font-semibold text-sm text-content">Atomic HINCRBY & Pub/Sub</h4>
            <p className="text-xs text-content-secondary leading-relaxed">
              Atomic vote increments via hash structures and Pub/Sub channel broadcasts to real-time streams.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-surface border border-border-subtle shadow-sm space-y-2">
            <div className="flex items-center gap-2 text-primary-600 dark:text-primary-400 font-semibold text-xs">
              <AlertCircle className="w-4 h-4" />
              <span>MongoDB 7</span>
            </div>
            <h4 className="font-semibold text-sm text-content">Persistent Storage</h4>
            <p className="text-xs text-content-secondary leading-relaxed">
              Official MongoDB driver handling users, polls, options, and vote deduplication records.
            </p>
          </div>
        </section>
      </main>

      {/* Origin-Aware Modal Overlay */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/50 backdrop-blur-sm"
          onClick={handleCloseModal}
        >
          <div
            ref={modalCardRef}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md p-6 rounded-2xl bg-surface border border-border-strong shadow-2xl relative"
          >
            <div className="flex items-center justify-between pb-4 border-b border-border-subtle">
              <div className="flex items-center gap-2 text-primary-600 font-semibold">
                <Sparkles className="w-5 h-5" />
                <span>Origin Modal</span>
              </div>
              <button
                type="button"
                onClick={handleCloseModal}
                className="p-1 rounded-lg text-content-secondary hover:text-content hover:bg-surface-elevated transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-5 space-y-3">
              <p className="text-sm text-content leading-relaxed">
                This modal was dynamically projected using <code className="text-xs bg-surface-elevated px-1.5 py-0.5 rounded text-primary-500">useOriginTransition</code>.
              </p>
              <p className="text-xs text-content-secondary leading-relaxed">
                Transforms are calculated from the bounding box of the trigger element to the center coordinates using GPU-accelerated transforms (<code className="text-xs">x, y, scale, opacity</code>) inside a scoped GSAP context.
              </p>
            </div>

            <div className="pt-3 flex justify-end">
              <button
                type="button"
                onClick={handleCloseModal}
                className="px-4 py-2 rounded-xl bg-surface-elevated hover:bg-neutral-200 dark:hover:bg-neutral-700 text-content text-xs font-semibold transition-colors"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
