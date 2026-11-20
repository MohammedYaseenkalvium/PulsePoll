import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { ThemeToggle } from '../motion/ThemeToggle';
import {
  Activity,
  Mail,
  Lock,
  User,
  ArrowRight,
  Loader2,
  AlertCircle,
  AlertTriangle,
} from 'lucide-react';
import { ApiError } from '../lib/api';

interface AuthViewProps {
  onSuccess?: () => void;
}

export const AuthView: React.FC<AuthViewProps> = ({ onSuccess }) => {
  const { login, register, enterDemoMode } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');

  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [dbStatus, setDbStatus] = useState<{
    checked: boolean;
    online: boolean;
    details?: string;
  }>({ checked: false, online: true });

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => {
        const mongoOk = data?.database?.mongodb === 'connected';
        const redisOk = data?.database?.redis === 'connected';
        if (!mongoOk || !redisOk) {
          setDbStatus({
            checked: true,
            online: false,
            details:
              'MongoDB and Redis are currently unreachable. Start Docker Desktop and run: docker compose up -d',
          });
        } else {
          setDbStatus({ checked: true, online: true });
        }
      })
      .catch(() => {
        setDbStatus({
          checked: true,
          online: false,
          details: 'Backend service is offline on port 8080',
        });
      });
  }, []);

  // Plausible live tally simulation for the right-hand preview card
  const [simVotes, setSimVotes] = useState({
    opt1: 72,
    opt2: 28,
    opt3: 14,
    total: 114,
  });

  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }

    const interval = setInterval(() => {
      setSimVotes((prev) => {
        const rand = Math.random();
        if (rand < 0.6) {
          return { ...prev, opt1: prev.opt1 + 1, total: prev.total + 1 };
        }
        if (rand < 0.85) {
          return { ...prev, opt2: prev.opt2 + 1, total: prev.total + 1 };
        }
        return { ...prev, opt3: prev.opt3 + 1, total: prev.total + 1 };
      });
    }, 2800);

    return () => clearInterval(interval);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!email || !password) {
      setErrorMessage('Enter your email address and password');
      return;
    }

    if (mode === 'register' && !username) {
      setErrorMessage('Enter a username');
      return;
    }

    if (password.length < 8) {
      setErrorMessage('Password must be at least 8 characters');
      return;
    }

    setIsLoading(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(email, username, password);
      }
      onSuccess?.();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Authentication request failed. Check your backend connection');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const pct1 = Math.round((simVotes.opt1 / simVotes.total) * 100);
  const pct2 = Math.round((simVotes.opt2 / simVotes.total) * 100);
  const pct3 = Math.max(0, 100 - pct1 - pct2);

  return (
    <div className="min-h-screen w-full bg-canvas text-content flex flex-col justify-between transition-colors duration-200">
      {/* Top Navigation Bar */}
      <nav className="w-full px-6 py-4 flex items-center justify-between border-b border-border-subtle bg-surface sticky top-0 z-30">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary-600 text-white flex items-center justify-center">
            <Activity className="w-4 h-4" aria-hidden="true" />
          </div>
          <span className="font-semibold text-base tracking-tight text-content">PulsePoll</span>
        </div>

        <ThemeToggle />
      </nav>

      {/* Main Split Layout: 50/50 Desktop, Centered Mobile */}
      <div className="flex-1 w-full max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2">
        {/* Left Panel: Auth Form */}
        <div className="flex flex-col justify-center items-center px-6 py-12 sm:px-12 lg:px-16">
          <div className="w-full max-w-md space-y-6">
            {/* Header & Mode Switcher */}
            <div className="space-y-4">
              <div className="space-y-1.5">
                <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-content">
                  {mode === 'login' ? 'Sign in to PulsePoll' : 'Create a creator account'}
                </h1>
                <p className="text-sm text-content-secondary">
                  {mode === 'login'
                    ? 'Manage live polls and monitor audience responses in real time'
                    : 'Set up your workspace to launch polls and stream live results'}
                </p>
              </div>

              {/* Mode Toggle */}
              <div className="grid grid-cols-2 p-1 rounded-xl bg-surface-elevated border border-border-subtle">
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setErrorMessage(null);
                  }}
                  className={`py-2 text-xs font-medium rounded-lg transition-colors duration-150 cursor-pointer ${
                    mode === 'login'
                      ? 'bg-surface text-content shadow-xs'
                      : 'text-content-secondary hover:text-content'
                  }`}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('register');
                    setErrorMessage(null);
                  }}
                  className={`py-2 text-xs font-medium rounded-lg transition-colors duration-150 cursor-pointer ${
                    mode === 'register'
                      ? 'bg-surface text-content shadow-xs'
                      : 'text-content-secondary hover:text-content'
                  }`}
                >
                  Create account
                </button>
              </div>
            </div>

            {/* Database Offline Notice & Demo Mode Option */}
            {!dbStatus.online && dbStatus.checked && (
              <div className="p-4 rounded-xl bg-warning-50 dark:bg-warning-950/40 border border-warning-200 dark:border-warning-800 space-y-3 text-xs text-warning-800 dark:text-warning-300">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-warning-600 shrink-0 mt-0.5" aria-hidden="true" />
                  <div className="space-y-1 flex-1">
                    <span className="font-semibold text-content">Local databases offline</span>
                    <p className="text-xs text-content-secondary leading-relaxed">
                      MongoDB (`:27017`) and Redis (`:6379`) were not detected. Start Docker Desktop and run:
                    </p>
                    <code className="inline-block mt-0.5 px-2 py-0.5 rounded bg-surface border border-border-subtle font-mono text-xs text-primary-600 dark:text-primary-400">
                      docker compose up -d
                    </code>
                  </div>
                </div>

                <div className="pt-2.5 border-t border-warning-200/60 dark:border-warning-800/60 flex items-center justify-between">
                  <span className="text-xs text-content-secondary">Or preview with local session data</span>
                  <button
                    type="button"
                    onClick={() => {
                      enterDemoMode();
                      onSuccess?.();
                    }}
                    className="px-3 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white font-medium text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <span>Open demo workspace</span>
                    <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            )}

            {/* Error Notification Alert */}
            {errorMessage && (
              <div
                role="alert"
                className="p-3.5 rounded-xl bg-error-50 dark:bg-error-950/40 border border-error-200 dark:border-error-800 flex items-start gap-2.5 text-error-600 dark:text-error-400 text-xs"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                <div className="flex-1 leading-relaxed">{errorMessage}</div>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'register' && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-content-secondary">
                    Username
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-content-muted">
                      <User className="w-4 h-4" aria-hidden="true" />
                    </div>
                    <input
                      type="text"
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="alex_mercer"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-surface border border-border-subtle text-content text-sm placeholder:text-content-muted transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-content-secondary">
                  Email address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-content-muted">
                    <Mail className="w-4 h-4" aria-hidden="true" />
                  </div>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-surface border border-border-subtle text-content text-sm placeholder:text-content-muted transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-content-secondary">
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-content-muted">
                    <Lock className="w-4 h-4" aria-hidden="true" />
                  </div>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="8+ characters"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-surface border border-border-subtle text-content text-sm placeholder:text-content-muted transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 px-4 rounded-xl bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover)] text-white font-medium text-sm transition-colors duration-150 disabled:opacity-60 flex items-center justify-center gap-2 cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" aria-hidden="true" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <>
                    <span>{mode === 'login' ? 'Sign in' : 'Create account'}</span>
                    <ArrowRight className="w-4 h-4" aria-hidden="true" />
                  </>
                )}
              </button>
            </form>

            {/* Footer switcher notice */}
            <div className="text-center text-xs text-content-secondary pt-1">
              {mode === 'login' ? (
                <span>
                  No account yet?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setMode('register');
                      setErrorMessage(null);
                    }}
                    className="font-medium text-primary-600 dark:text-primary-400 hover:underline ml-1 cursor-pointer"
                  >
                    Create account
                  </button>
                </span>
              ) : (
                <span>
                  Already registered?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setMode('login');
                      setErrorMessage(null);
                    }}
                    className="font-medium text-primary-600 dark:text-primary-400 hover:underline ml-1 cursor-pointer"
                  >
                    Sign in
                  </button>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right Panel: Grounded Surface with Real Product Preview Card */}
        <div className="hidden lg:flex bg-surface-elevated/50 p-12 items-center justify-center border-l border-border-subtle">
          <div className="w-full max-w-sm rounded-2xl bg-surface border border-border-subtle shadow-sm p-6 space-y-5">
            {/* Card Header & Status */}
            <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-success-500 animate-pulse" />
                <span className="text-xs font-medium text-success-700 dark:text-success-400">
                  Live poll preview
                </span>
              </div>
              <span className="text-xs text-content-secondary font-mono tabular-nums">
                {simVotes.total} votes
              </span>
            </div>

            {/* Poll Question */}
            <div className="space-y-1">
              <span className="text-xs text-content-muted">Single choice</span>
              <h3 className="font-semibold text-base text-content leading-snug">
                Which event streaming transport fits our audience Q&amp;A?
              </h3>
            </div>

            {/* Live Option Vote Bars: One Accent for Leading Series, Neutral Ramp for Others */}
            <div className="space-y-3.5">
              {/* Option 1 (Leading — Accent) */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="font-medium text-content">Redis Pub/Sub + SSE</span>
                  <span className="font-mono tabular-nums font-medium text-primary-600 dark:text-primary-400">
                    {pct1}% ({simVotes.opt1})
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-surface-elevated overflow-hidden">
                  <div
                    className="h-full bg-primary-600 dark:bg-primary-500 rounded-full transition-[width] duration-300 ease-out"
                    style={{ width: `${pct1}%` }}
                  />
                </div>
              </div>

              {/* Option 2 (Secondary — Neutral) */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="font-normal text-content-secondary">WebSockets Server</span>
                  <span className="font-mono tabular-nums text-content-secondary">
                    {pct2}% ({simVotes.opt2})
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-surface-elevated overflow-hidden">
                  <div
                    className="h-full bg-neutral-400 dark:bg-neutral-600 rounded-full transition-[width] duration-300 ease-out"
                    style={{ width: `${pct2}%` }}
                  />
                </div>
              </div>

              {/* Option 3 (Secondary — Neutral) */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="font-normal text-content-secondary">HTTP Polling Interval</span>
                  <span className="font-mono tabular-nums text-content-secondary">
                    {pct3}% ({simVotes.opt3})
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-surface-elevated overflow-hidden">
                  <div
                    className="h-full bg-neutral-400 dark:bg-neutral-600 rounded-full transition-[width] duration-300 ease-out"
                    style={{ width: `${pct3}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Footer Meta */}
            <div className="pt-3 border-t border-border-subtle flex items-center justify-between text-xs text-content-muted font-mono">
              <span>/vote/arch-qa</span>
              <span>SSE connected</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="w-full py-4 text-center text-xs text-content-muted border-t border-border-subtle">
        PulsePoll &middot; Go, MongoDB, Redis, and React
      </footer>
    </div>
  );
};
