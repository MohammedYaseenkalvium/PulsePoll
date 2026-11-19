import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { ThemeToggle } from '../motion/ThemeToggle';
import { Activity, Mail, Lock, User, ArrowRight, Loader2, AlertCircle, CheckCircle2, Radio, AlertTriangle, Sparkles } from 'lucide-react';
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
            details: 'MongoDB and Redis are currently unreachable. To connect local databases, start Docker Desktop and run: docker compose up -d',
          });
        } else {
          setDbStatus({ checked: true, online: true });
        }
      })
      .catch(() => {
        setDbStatus({
          checked: true,
          online: false,
          details: 'Backend server is starting up or unreachable at http://localhost:8080.',
        });
      });
  }, []);

  // Live simulation for the miniature preview card in the right panel
  const [simVotes, setSimVotes] = useState({
    opt1: 72,
    opt2: 28,
    opt3: 14,
    total: 114,
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setSimVotes((prev) => {
        const rand = Math.random();
        if (rand < 0.6) {
          return {
            ...prev,
            opt1: prev.opt1 + 1,
            total: prev.total + 1,
          };
        } else if (rand < 0.85) {
          return {
            ...prev,
            opt2: prev.opt2 + 1,
            total: prev.total + 1,
          };
        } else {
          return {
            ...prev,
            opt3: prev.opt3 + 1,
            total: prev.total + 1,
          };
        }
      });
    }, 2800);

    return () => clearInterval(interval);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Client-side quick checks
    if (!email || !password) {
      setErrorMessage('Please fill in all required fields.');
      return;
    }

    if (mode === 'register' && !username) {
      setErrorMessage('Username is required.');
      return;
    }

    if (password.length < 8) {
      setErrorMessage('Password must be at least 8 characters long.');
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
        setErrorMessage('Authentication request failed. Please check backend connection.');
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
      {/* Top Navigation Bar with ThemeToggle */}
      <nav className="w-full px-6 py-4 flex items-center justify-between border-b border-border-subtle bg-surface/50 backdrop-blur-sm sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary-600 text-white flex items-center justify-center shadow-md">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <span className="font-bold text-base tracking-tight text-content">PulsePoll</span>
            <span className="hidden sm:inline-block ml-2 text-xs px-2 py-0.5 rounded-full bg-surface-elevated text-content-secondary border border-border-subtle">
              Real-time Ingestion
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <ThemeToggle />
        </div>
      </nav>

      {/* Main Split Layout: 50/50 Desktop, Centered Mobile */}
      <div className="flex-1 w-full max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2">
        {/* Left Panel: Auth Form */}
        <div className="flex flex-col justify-center items-center px-6 py-12 sm:px-12 lg:px-16">
          <div className="w-full max-w-md space-y-8">
            {/* Header & Mode Switcher */}
            <div className="space-y-4">
              <div className="space-y-2">
                <h1 className="text-3xl font-extrabold tracking-tight text-content">
                  {mode === 'login' ? 'Welcome back' : 'Create your account'}
                </h1>
                <p className="text-sm text-content-secondary">
                  {mode === 'login'
                    ? 'Enter your credentials to access your real-time poll dashboard.'
                    : 'Get started with high-concurrency polls and instant Redis streaming.'}
                </p>
              </div>

              {/* Mode Toggle Pills */}
              <div className="grid grid-cols-2 p-1 rounded-xl bg-surface-elevated border border-border-subtle">
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setErrorMessage(null);
                  }}
                  className={`py-2 text-xs font-semibold rounded-lg transition-all duration-150 ${
                    mode === 'login'
                      ? 'bg-surface text-content shadow-sm'
                      : 'text-content-secondary hover:text-content'
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('register');
                    setErrorMessage(null);
                  }}
                  className={`py-2 text-xs font-semibold rounded-lg transition-all duration-150 ${
                    mode === 'register'
                      ? 'bg-surface text-content shadow-sm'
                      : 'text-content-secondary hover:text-content'
                  }`}
                >
                  Create Account
                </button>
              </div>
            </div>

            {/* Database Offline Notice & Instant Demo Option */}
            {!dbStatus.online && dbStatus.checked && (
              <div className="p-4 rounded-2xl bg-warning-50 dark:bg-warning-950/40 border border-warning-200 dark:border-warning-800 space-y-2.5 text-xs text-warning-800 dark:text-warning-300">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-warning-600 shrink-0 mt-0.5" />
                  <div className="space-y-1 flex-1">
                    <span className="font-bold text-content">Database Containers Offline</span>
                    <p className="text-[11px] text-content-secondary leading-relaxed">
                      MongoDB (`:27017`) and Redis (`:6379`) are not detected. To use full persistence, start Docker Desktop and run:
                    </p>
                    <code className="inline-block mt-0.5 px-2 py-0.5 rounded bg-surface border border-border-subtle font-mono text-[11px] text-primary-600 dark:text-primary-400">
                      docker compose up -d
                    </code>
                  </div>
                </div>

                <div className="pt-2 border-t border-warning-200/60 dark:border-warning-800/60 flex items-center justify-between">
                  <span className="text-[11px] text-content-secondary">Or explore immediately:</span>
                  <button
                    type="button"
                    onClick={() => {
                      enterDemoMode();
                      onSuccess?.();
                    }}
                    className="px-3 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white font-semibold text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer active:scale-95"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Launch Demo Dashboard</span>
                  </button>
                </div>
              </div>
            )}

            {/* Error Notification Alert */}
            {errorMessage && (
              <div className="p-3.5 rounded-xl bg-error-50 dark:bg-error-950/40 border border-error-200 dark:border-error-800 flex items-start gap-3 text-error-600 dark:text-error-400 text-xs animate-in fade-in duration-200">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="flex-1 leading-relaxed">{errorMessage}</div>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
              {mode === 'register' && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-content-secondary">
                    Username
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-content-muted">
                      <User className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="e.g. dev_architect"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-surface border border-border-subtle text-content text-sm placeholder:text-content-muted transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-content-secondary">
                  Email address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-content-muted">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-surface border border-border-subtle text-content text-sm placeholder:text-content-muted transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-content-secondary">
                    Password
                  </label>
                  {mode === 'login' && (
                    <span className="text-xs text-primary-500 hover:text-primary-600 cursor-pointer">
                      Forgot?
                    </span>
                  )}
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-content-muted">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-surface border border-border-subtle text-content text-sm placeholder:text-content-muted transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                {mode === 'register' && (
                  <p className="text-[11px] text-content-muted">Minimum 8 characters required</p>
                )}
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 px-4 rounded-xl bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover)] text-white font-medium text-sm shadow-md shadow-primary-500/10 transition-all duration-150 active:scale-[0.99] disabled:opacity-60 flex items-center justify-center gap-2 cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>Connecting to backend...</span>
                  </>
                ) : (
                  <>
                    <span>{mode === 'login' ? 'Sign in to Dashboard' : 'Create PulsePoll Account'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            {/* Footer switcher notice */}
            <div className="text-center text-xs text-content-secondary pt-2">
              {mode === 'login' ? (
                <span>
                  Don't have an account?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setMode('register');
                      setErrorMessage(null);
                    }}
                    className="font-semibold text-primary-500 hover:text-primary-600 ml-1 cursor-pointer"
                  >
                    Create account
                  </button>
                </span>
              ) : (
                <span>
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setMode('login');
                      setErrorMessage(null);
                    }}
                    className="font-semibold text-primary-500 hover:text-primary-600 ml-1 cursor-pointer"
                  >
                    Sign in
                  </button>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right Panel: Atmospheric Canvas with Radial Glow & Live Miniature Preview */}
        <div className="hidden lg:flex relative overflow-hidden bg-gradient-to-br from-surface via-surface-elevated to-canvas p-12 items-center justify-center border-l border-border-subtle">
          {/* Subtle Indigo & Emerald Radial Glow Background Elements */}
          <div className="absolute -top-32 -left-32 w-[28rem] h-[28rem] rounded-full bg-primary-500/15 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-32 -right-32 w-[28rem] h-[28rem] rounded-full bg-success-500/10 blur-3xl pointer-events-none" />

          {/* Miniature Live Poll Preview Card */}
          <div className="w-full max-w-sm rounded-3xl bg-surface/90 backdrop-blur-xl border border-border-strong shadow-2xl p-7 space-y-6 relative z-10 transition-all duration-300">
            {/* Card Header & Status */}
            <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-success-500" />
                </span>
                <span className="text-xs font-semibold text-success-700 dark:text-success-400">
                  Live SSE Stream
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-content-secondary font-mono">
                <Radio className="w-3.5 h-3.5 text-primary-500" />
                <span>{simVotes.total} votes</span>
              </div>
            </div>

            {/* Poll Question */}
            <div className="space-y-1">
              <span className="text-[11px] font-semibold tracking-wider uppercase text-primary-500">
                Real-Time Showcase
              </span>
              <h3 className="font-bold text-base text-content leading-snug">
                Which event streaming architecture scales best for live voting?
              </h3>
            </div>

            {/* Live Option Vote Bars */}
            <div className="space-y-4">
              {/* Option 1 */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="font-medium text-content">Redis Pub/Sub + SSE</span>
                  <span className="font-mono font-semibold text-primary-600 dark:text-primary-400">
                    {pct1}% ({simVotes.opt1})
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-surface-elevated overflow-hidden border border-border-subtle">
                  <div
                    className="h-full bg-primary-500 rounded-full transition-all duration-700 ease-out"
                    style={{ width: `${pct1}%` }}
                  />
                </div>
              </div>

              {/* Option 2 */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="font-medium text-content">WebSockets Server</span>
                  <span className="font-mono font-semibold text-success-700 dark:text-success-300">
                    {pct2}% ({simVotes.opt2})
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-surface-elevated overflow-hidden border border-border-subtle">
                  <div
                    className="h-full bg-success-500 rounded-full transition-all duration-700 ease-out"
                    style={{ width: `${pct2}%` }}
                  />
                </div>
              </div>

              {/* Option 3 */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="font-medium text-content">Short Polling Interval</span>
                  <span className="font-mono font-semibold text-warning-700 dark:text-warning-300">
                    {pct3}% ({simVotes.opt3})
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-surface-elevated overflow-hidden border border-border-subtle">
                  <div
                    className="h-full bg-warning-500 rounded-full transition-all duration-700 ease-out"
                    style={{ width: `${pct3}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Feature Callouts */}
            <div className="pt-2 border-t border-border-subtle grid grid-cols-2 gap-2 text-[11px] text-content-secondary">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-success-600 dark:text-success-400 shrink-0" />
                <span>Zero page refresh</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-primary-500 shrink-0" />
                <span>Atomic HINCRBY</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="w-full py-4 text-center text-xs text-content-muted border-t border-border-subtle">
        PulsePoll &copy; {new Date().getFullYear()} — Built with Go, MongoDB, Redis, and React.
      </footer>
    </div>
  );
};
