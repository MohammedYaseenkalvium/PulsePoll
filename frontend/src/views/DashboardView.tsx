import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { api, type Poll } from '../lib/api';
import { ThemeToggle } from '../motion/ThemeToggle';
import { type OriginRect } from '../motion/useOriginTransition';
import { CreatePollModal } from '../components/CreatePollModal';
import { LiveMonitorModal } from '../components/LiveMonitorModal';
import gsap from 'gsap';
import {
  Activity,
  Plus,
  LogOut,
  Radio,
  CheckCircle2,
  Copy,
  Trash2,
  RefreshCw,
  Layers,
  Settings,
  LayoutDashboard,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
} from 'lucide-react';

interface DashboardViewProps {
  onNavigateToLive?: (pollId: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigateToLive }) => {
  const { user, logout } = useAuth();
  const [polls, setPolls] = useState<Poll[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Active navigation tab
  const [activeTab, setActiveTab] = useState<'dashboard' | 'monitor' | 'settings'>('dashboard');

  // Sidebar collapse state
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const sidebarLabelsRef = useRef<(HTMLSpanElement | null)[]>([]);

  // Toast Notification state
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Create Poll Modal state & origin
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createOriginRect, setCreateOriginRect] = useState<OriginRect | null>(null);

  // Live Monitor Modal state & origin
  const [isMonitorModalOpen, setIsMonitorModalOpen] = useState(false);
  const [selectedMonitorPoll, setSelectedMonitorPoll] = useState<Poll | null>(null);
  const [monitorOriginRect, setMonitorOriginRect] = useState<OriginRect | null>(null);

  // KPI Refs for GSAP entrance animation
  const kpiContainerRef = useRef<HTMLDivElement>(null);

  const fetchPolls = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await api.getMyPolls();
      setPolls(data);
    } catch {
      // Handled gracefully
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPolls();
  }, [fetchPolls]);

  // GSAP Animated Sidebar Width and Labels
  useEffect(() => {
    const ctx = gsap.context(() => {
      const mm = gsap.matchMedia();

      mm.add('(prefers-reduced-motion: reduce)', () => {
        if (sidebarRef.current) {
          gsap.set(sidebarRef.current, { width: isSidebarCollapsed ? 80 : 260 });
        }
      });

      mm.add('(prefers-reduced-motion: no-preference)', () => {
        if (sidebarRef.current) {
          gsap.to(sidebarRef.current, {
            width: isSidebarCollapsed ? 80 : 260,
            duration: 0.32,
            ease: 'power3.inOut',
          });

          // Label opacity / transform
          sidebarLabelsRef.current.forEach((label) => {
            if (label) {
              if (isSidebarCollapsed) {
                gsap.to(label, { opacity: 0, x: -6, duration: 0.15, display: 'none' });
              } else {
                gsap.to(label, { opacity: 1, x: 0, duration: 0.25, delay: 0.1, display: 'inline' });
              }
            }
          });
        }
      });
    }, sidebarRef);

    return () => ctx.revert();
  }, [isSidebarCollapsed]);

  // GSAP Entrance animation for KPI cards
  useEffect(() => {
    if (!isLoading && kpiContainerRef.current) {
      const ctx = gsap.context(() => {
        const mm = gsap.matchMedia();
        mm.add('(prefers-reduced-motion: no-preference)', () => {
          gsap.from(kpiContainerRef.current!.children, {
            y: 16,
            opacity: 0,
            duration: 0.45,
            stagger: 0.08,
            ease: 'power3.out',
          });
        });
      }, kpiContainerRef);
      return () => ctx.revert();
    }
  }, [isLoading]);

  // Compute KPI values
  const totalPolls = polls.length;
  const totalVotes = polls.reduce(
    (acc, p) => acc + p.options.reduce((sum, o) => sum + (o.voteCount || 0), 0),
    0
  );
  const activePolls = polls.filter((p) => p.status === 'open').length;

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 2800);
  };

  const handleCopyLink = (shareSlug: string) => {
    const url = `${window.location.origin}/vote/${shareSlug}`;
    navigator.clipboard.writeText(url);
    triggerToast(`Link copied: /vote/${shareSlug}`);
  };

  const handleOpenCreateModal = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const savedRect: OriginRect = {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    };
    setCreateOriginRect(savedRect);
    setIsCreateModalOpen(true);
  };

  const handleOpenLiveMonitor = (e: React.MouseEvent<HTMLButtonElement>, poll: Poll) => {
    if (onNavigateToLive) {
      onNavigateToLive(poll.id);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const savedRect: OriginRect = {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    };
    setMonitorOriginRect(savedRect);
    setSelectedMonitorPoll(poll);
    setIsMonitorModalOpen(true);
  };

  const handleToggleStatus = async (pollId: string) => {
    try {
      await api.updatePollStatus(pollId);
      fetchPolls();
      triggerToast('Poll status updated');
    } catch {
      triggerToast('Failed to update poll status');
    }
  };

  const handleDeletePoll = async (pollId: string) => {
    if (window.confirm('Delete this poll and its real-time metrics?')) {
      try {
        await api.deletePoll(pollId);
        fetchPolls();
        triggerToast('Poll deleted successfully');
      } catch {
        triggerToast('Failed to delete poll');
      }
    }
  };

  return (
    <div className="min-h-screen bg-canvas text-content flex transition-colors duration-200">
      {/* Toast Notification Container */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <div className="px-4 py-3 rounded-2xl bg-success-50 dark:bg-success-950/80 text-success-700 dark:text-success-300 border border-success-200 dark:border-success-800 shadow-xl flex items-center gap-2.5 text-xs font-semibold backdrop-blur-md">
            <CheckCircle2 className="w-4 h-4 text-success-600 dark:text-success-400 shrink-0" />
            <span>{toastMessage}</span>
          </div>
        </div>
      )}

      {/* GSAP-Animated Collapsible Sidebar */}
      <aside
        ref={sidebarRef}
        style={{ width: isSidebarCollapsed ? 80 : 260 }}
        className="hidden md:flex flex-col justify-between border-r border-border-subtle bg-surface transition-colors shrink-0 z-20"
      >
        <div className="p-4 space-y-6">
          {/* Logo & Toggle */}
          <div className="flex items-center justify-between gap-2 px-2 py-1">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="w-9 h-9 rounded-xl bg-primary-600 text-white flex items-center justify-center shadow-md shrink-0">
                <Activity className="w-5 h-5" />
              </div>
              <span
                ref={(el) => {
                  sidebarLabelsRef.current[0] = el;
                }}
                className="font-bold text-base tracking-tight text-content whitespace-nowrap"
              >
                PulsePoll
              </span>
            </div>

            <button
              type="button"
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              className="p-1.5 rounded-lg text-content-secondary hover:text-content hover:bg-surface-elevated transition-colors cursor-pointer"
              title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {isSidebarCollapsed ? (
                <ChevronRight className="w-4 h-4" />
              ) : (
                <ChevronLeft className="w-4 h-4" />
              )}
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1.5 pt-2">
            <button
              type="button"
              onClick={() => setActiveTab('dashboard')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'dashboard'
                  ? 'bg-primary-50 dark:bg-primary-950/50 text-primary-600 dark:text-primary-400 shadow-xs'
                  : 'text-content-secondary hover:text-content hover:bg-surface-elevated'
              }`}
            >
              <LayoutDashboard className="w-4 h-4 shrink-0" />
              <span
                ref={(el) => {
                  sidebarLabelsRef.current[1] = el;
                }}
                className="whitespace-nowrap"
              >
                Dashboard
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (polls.length > 0) {
                  setSelectedMonitorPoll(polls[0]);
                  setIsMonitorModalOpen(true);
                } else {
                  triggerToast('Create a poll first to monitor real-time streams.');
                }
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold text-content-secondary hover:text-content hover:bg-surface-elevated transition-all cursor-pointer"
            >
              <Radio className="w-4 h-4 shrink-0 text-success-600 dark:text-success-400" />
              <span
                ref={(el) => {
                  sidebarLabelsRef.current[2] = el;
                }}
                className="whitespace-nowrap"
              >
                Live Monitor
              </span>
            </button>

            <button
              type="button"
              onClick={() => triggerToast('Workspace settings is up to date.')}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold text-content-secondary hover:text-content hover:bg-surface-elevated transition-all cursor-pointer"
            >
              <Settings className="w-4 h-4 shrink-0" />
              <span
                ref={(el) => {
                  sidebarLabelsRef.current[3] = el;
                }}
                className="whitespace-nowrap"
              >
                Settings
              </span>
            </button>
          </nav>
        </div>

        {/* User Card & Logout */}
        <div className="p-4 border-t border-border-subtle space-y-3">
          <div className="flex items-center gap-3 px-2">
            <div className="w-8 h-8 rounded-full bg-surface-elevated text-primary-600 dark:text-primary-400 flex items-center justify-center font-bold text-xs shrink-0 border border-border-subtle">
              {user?.username?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="overflow-hidden">
              <span
                ref={(el) => {
                  sidebarLabelsRef.current[4] = el;
                }}
                className="block text-xs font-bold text-content truncate whitespace-nowrap"
              >
                {user?.username || 'Creator'}
              </span>
              <span
                ref={(el) => {
                  sidebarLabelsRef.current[5] = el;
                }}
                className="block text-[11px] text-content-muted truncate whitespace-nowrap"
              >
                {user?.email}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold text-content-secondary hover:text-error-600 hover:bg-error-50 dark:hover:bg-error-950/40 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span
              ref={(el) => {
                sidebarLabelsRef.current[6] = el;
              }}
              className="whitespace-nowrap"
            >
              Sign Out
            </span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar with Workspace Title, ThemeToggle, and + Create Poll Button */}
        <header className="px-6 py-4 border-b border-border-subtle bg-surface/70 backdrop-blur-md sticky top-0 z-10 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <h1 className="text-base font-bold text-content tracking-tight">Creator Workspace</h1>
            <span className="hidden sm:inline-block text-xs px-2 py-0.5 rounded-full bg-surface-elevated border border-border-subtle text-content-secondary font-mono">
              Live Ingestion
            </span>
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle />

            <button
              type="button"
              onClick={handleOpenCreateModal}
              className="px-4 py-2 rounded-xl bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover)] text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all duration-150 active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ Create Poll</span>
            </button>
          </div>
        </header>

        {/* Dashboard Body */}
        <main className="flex-1 p-6 md:p-10 space-y-8 max-w-6xl w-full mx-auto">
          {/* 3 KPI Summary Cards using tabular-nums */}
          <section ref={kpiContainerRef} className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {/* Total Polls */}
            <div className="p-6 rounded-3xl bg-surface border border-border-subtle shadow-sm flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-xs font-semibold text-content-secondary">Total Polls</span>
                <div className="text-3xl font-extrabold text-content font-mono tabular-nums">
                  {totalPolls}
                </div>
              </div>
              <div className="w-11 h-11 rounded-2xl bg-primary-50 dark:bg-primary-950/40 text-primary-600 dark:text-primary-400 flex items-center justify-center">
                <Layers className="w-5 h-5" />
              </div>
            </div>

            {/* Total Ingested Votes */}
            <div className="p-6 rounded-3xl bg-surface border border-border-subtle shadow-sm flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-xs font-semibold text-content-secondary">Total Ingested Votes</span>
                <div className="text-3xl font-extrabold text-primary-600 dark:text-primary-400 font-mono tabular-nums">
                  {totalVotes}
                </div>
              </div>
              <div className="w-11 h-11 rounded-2xl bg-success-50 dark:bg-success-950/40 text-success-600 dark:text-success-400 flex items-center justify-center">
                <TrendingUp className="w-5 h-5" />
              </div>
            </div>

            {/* Active Live Polls */}
            <div className="p-6 rounded-3xl bg-surface border border-border-subtle shadow-sm flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-xs font-semibold text-content-secondary">Active Live Polls</span>
                <div className="text-3xl font-extrabold text-success-600 dark:text-success-400 font-mono tabular-nums">
                  {activePolls}
                </div>
              </div>
              <div className="w-11 h-11 rounded-2xl bg-warning-50 dark:bg-warning-950/40 text-warning-600 dark:text-warning-400 flex items-center justify-center">
                <Radio className="w-5 h-5" />
              </div>
            </div>
          </section>

          {/* Polls Listing Section Header */}
          <div className="flex items-center justify-between pt-2">
            <div className="space-y-0.5">
              <h2 className="text-lg font-bold text-content">Your Real-Time Polls</h2>
              <p className="text-xs text-content-secondary">
                Live metrics synced in real time via Redis Hashes and Pub/Sub.
              </p>
            </div>

            <button
              type="button"
              onClick={fetchPolls}
              className="p-2 rounded-xl border border-border-subtle bg-surface hover:bg-surface-elevated text-content-secondary hover:text-content transition-colors cursor-pointer"
              title="Refresh polls list"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Polls Cards Grid */}
          {isLoading && polls.length === 0 ? (
            <div className="p-16 text-center rounded-3xl bg-surface border border-border-subtle flex flex-col items-center justify-center gap-3">
              <RefreshCw className="w-6 h-6 animate-spin text-primary-500" />
              <span className="text-xs text-content-secondary font-medium">Loading polls...</span>
            </div>
          ) : polls.length === 0 ? (
            <div className="p-16 text-center rounded-3xl bg-surface border border-border-subtle shadow-sm space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-surface-elevated text-content-muted flex items-center justify-center mx-auto">
                <Layers className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-base text-content">No polls launched yet</h3>
                <p className="text-xs text-content-secondary max-w-sm mx-auto">
                  Create your first real-time poll to begin collecting live votes with zero refresh.
                </p>
              </div>
              <button
                type="button"
                onClick={handleOpenCreateModal}
                className="px-5 py-2.5 rounded-xl bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover)] text-white text-xs font-semibold inline-flex items-center gap-2 shadow-sm transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>+ Create Poll</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {polls.map((poll) => {
                const pollTotalVotes = poll.options.reduce(
                  (sum, o) => sum + (o.voteCount || 0),
                  0
                );

                return (
                  <div
                    key={poll.id}
                    className="p-6 rounded-3xl bg-surface border border-border-subtle shadow-sm hover:border-border-strong transition-all flex flex-col justify-between space-y-5"
                  >
                    <div className="space-y-3">
                      {/* Card Header with Pulsing status indicator */}
                      <div className="flex items-center justify-between">
                        <span
                          className={`text-xs px-2.5 py-0.5 rounded-full font-medium inline-flex items-center gap-1.5 ${
                            poll.status === 'open'
                              ? 'bg-success-50 dark:bg-success-950/40 text-success-700 dark:text-success-300'
                              : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'
                          }`}
                        >
                          <span
                            className={`w-2 h-2 rounded-full ${
                              poll.status === 'open' ? 'bg-success-500 animate-pulse' : 'bg-neutral-400'
                            }`}
                          />
                          <span className="capitalize">{poll.status}</span>
                        </span>

                        <span className="text-xs font-mono text-content-secondary">
                          {pollTotalVotes} total votes
                        </span>
                      </div>

                      {/* Question & Description */}
                      <div className="space-y-1">
                        <h3 className="font-bold text-base text-content leading-snug">
                          {poll.question}
                        </h3>
                        {poll.description && (
                          <p className="text-xs text-content-secondary line-clamp-2">
                            {poll.description}
                          </p>
                        )}
                      </div>

                      {/* Live Option Bars Preview */}
                      <div className="space-y-2 pt-2">
                        {poll.options.map((opt) => {
                          const pct =
                            pollTotalVotes > 0
                              ? Math.round(((opt.voteCount || 0) / pollTotalVotes) * 100)
                              : 0;

                          return (
                            <div key={opt.id} className="space-y-1">
                              <div className="flex justify-between text-xs">
                                <span className="font-medium text-content truncate max-w-[70%]">
                                  {opt.text}
                                </span>
                                <span className="font-mono text-content-secondary">
                                  {pct}% ({opt.voteCount || 0})
                                </span>
                              </div>
                              <div className="w-full h-1.5 rounded-full bg-surface-elevated overflow-hidden border border-border-subtle">
                                <div
                                  className="h-full bg-primary-600 dark:bg-primary-500 rounded-full transition-all duration-500"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="pt-4 border-t border-border-subtle flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {/* Copy Link Button */}
                        <button
                          type="button"
                          onClick={() => handleCopyLink(poll.shareSlug)}
                          className="px-3 py-1.5 rounded-xl border border-border-subtle hover:bg-surface-elevated text-xs font-semibold text-content flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy Link</span>
                        </button>

                        {/* Live Monitor Button with Origin Transition */}
                        <button
                          type="button"
                          onClick={(e) => handleOpenLiveMonitor(e, poll)}
                          className="px-3 py-1.5 rounded-xl border border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-950/40 hover:bg-primary-100 dark:hover:bg-primary-900/60 text-xs font-semibold text-primary-600 dark:text-primary-400 flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Radio className="w-3.5 h-3.5" />
                          <span>Live Monitor</span>
                        </button>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {/* Open/Close Status Toggle */}
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(poll.id)}
                          className="px-3 py-1.5 rounded-xl border border-border-subtle hover:bg-surface-elevated text-xs font-semibold text-content-secondary hover:text-content transition-colors cursor-pointer"
                        >
                          {poll.status === 'open' ? 'Close' : 'Reopen'}
                        </button>

                        {/* Delete Button */}
                        <button
                          type="button"
                          onClick={() => handleDeletePoll(poll.id)}
                          className="p-2 rounded-xl border border-border-subtle hover:bg-error-50 dark:hover:bg-error-950/40 text-content-secondary hover:text-error-600 transition-colors cursor-pointer"
                          title="Delete poll"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>

      {/* Multi-Step Origin-Aware Create Poll Modal */}
      <CreatePollModal
        isOpen={isCreateModalOpen}
        originRect={createOriginRect}
        onClose={() => setIsCreateModalOpen(false)}
        onPollCreated={(newPoll) => {
          setPolls((prev) => [newPoll, ...prev]);
          triggerToast(`Poll "${newPoll.question}" launched successfully!`);
        }}
      />

      {/* Origin-Aware Live Poll Monitor Modal */}
      <LiveMonitorModal
        poll={selectedMonitorPoll}
        isOpen={isMonitorModalOpen}
        originRect={monitorOriginRect}
        onClose={() => {
          setIsMonitorModalOpen(false);
          setSelectedMonitorPoll(null);
        }}
      />
    </div>
  );
};
