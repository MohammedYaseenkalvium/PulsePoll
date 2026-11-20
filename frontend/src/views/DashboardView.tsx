import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { api, type Poll } from '../lib/api';
import { ThemeToggle } from '../motion/ThemeToggle';
import { type OriginRect } from '../motion/useOriginTransition';
import { CreatePollModal } from '../components/CreatePollModal';
import { LiveMonitorModal } from '../components/LiveMonitorModal';
import { BottomNav } from '../components/BottomNav';
import gsap from 'gsap';
import {
  Activity,
  Plus,
  Radio,
  CheckCircle2,
  Copy,
  Trash2,
  RefreshCw,
  Trophy,
  Check,
} from 'lucide-react';

interface DashboardViewProps {
  onNavigateToLive?: (pollId: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigateToLive }) => {
  const { user, logout } = useAuth();
  const [polls, setPolls] = useState<Poll[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Toast Notification state & per-card copy state
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  // Create Poll Modal state & origin
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createOriginRect, setCreateOriginRect] = useState<OriginRect | null>(null);

  // Live Monitor Modal state & origin
  const [isMonitorModalOpen, setIsMonitorModalOpen] = useState(false);
  const [selectedMonitorPoll, setSelectedMonitorPoll] = useState<Poll | null>(null);
  const [monitorOriginRect, setMonitorOriginRect] = useState<OriginRect | null>(null);

  // KPI & Polls Grid Refs for GSAP entrance animations
  const kpiContainerRef = useRef<HTMLDivElement>(null);
  const pollsGridRef = useRef<HTMLDivElement>(null);

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

  // GSAP Entrance animation for KPI cards (260ms)
  useEffect(() => {
    if (!isLoading && kpiContainerRef.current) {
      const ctx = gsap.context(() => {
        const mm = gsap.matchMedia();
        mm.add('(prefers-reduced-motion: no-preference)', () => {
          gsap.from(kpiContainerRef.current!.children, {
            y: 10,
            opacity: 0,
            duration: 0.26,
            stagger: 0.04,
            ease: 'power3.out',
          });
        });
      }, kpiContainerRef);
      return () => ctx.revert();
    }
  }, [isLoading]);

  // GSAP Staggered Entrance for Poll Cards (280ms)
  useEffect(() => {
    if (!isLoading && polls.length > 0 && pollsGridRef.current) {
      const ctx = gsap.context(() => {
        const mm = gsap.matchMedia();
        mm.add('(prefers-reduced-motion: no-preference)', () => {
          gsap.fromTo(
            pollsGridRef.current!.children,
            { y: 12, opacity: 0 },
            {
              y: 0,
              opacity: 1,
              duration: 0.28,
              stagger: 0.045,
              ease: 'power3.out',
              clearProps: 'transform',
            }
          );
        });
      }, pollsGridRef);
      return () => ctx.revert();
    }
  }, [isLoading, polls.length]);

  // Subtle GSAP Hover Lift for Poll Cards (160ms, compositor-only transform)
  const handleCardHover = (el: HTMLDivElement, isEnter: boolean) => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    gsap.to(el, {
      y: isEnter ? -2 : 0,
      duration: 0.16,
      ease: 'power2.out',
      overwrite: 'auto',
    });
  };

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
    }, 2600);
  };

  const handleCopyLink = (shareSlug: string) => {
    const url = `${window.location.origin}/vote/${shareSlug}`;
    navigator.clipboard.writeText(url);
    setCopiedSlug(shareSlug);
    triggerToast(`Copied /vote/${shareSlug}`);
    setTimeout(() => {
      setCopiedSlug((prev) => (prev === shareSlug ? null : prev));
    }, 2000);
  };

  const handleOpenCreateModal = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setCreateOriginRect({
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    });
    setIsCreateModalOpen(true);
  };

  const handleOpenLiveMonitor = (e: React.MouseEvent<HTMLButtonElement>, poll: Poll) => {
    if (onNavigateToLive) {
      onNavigateToLive(poll.id);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    setMonitorOriginRect({
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    });
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
    if (window.confirm('Delete this poll and its vote records?')) {
      try {
        await api.deletePoll(pollId);
        fetchPolls();
        triggerToast('Poll deleted');
      } catch {
        triggerToast('Failed to delete poll');
      }
    }
  };

  const primaryActivePoll = polls.find((p) => p.status === 'open') || polls[0] || null;

  return (
    <div
      style={{ paddingBottom: '96px' }}
      className="min-h-screen bg-canvas text-content flex flex-col transition-colors duration-200"
    >
      {/* Toast Notification Container */}
      {toastMessage && (
        <div
          role="status"
          aria-atomic="true"
          className="fixed bottom-24 right-6 z-50"
        >
          <div className="px-4 py-2.5 rounded-xl bg-surface border border-border-strong shadow-lg flex items-center gap-2 text-xs font-medium text-content">
            <CheckCircle2 className="w-4 h-4 text-success-600 dark:text-success-400 shrink-0" aria-hidden="true" />
            <span>{toastMessage}</span>
          </div>
        </div>
      )}

      {/* Top Bar */}
      <header className="px-6 py-3.5 border-b border-border-subtle bg-surface sticky top-0 z-20">
        <div className="max-w-6xl w-full mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary-600 text-white flex items-center justify-center shrink-0">
              <Activity className="w-4 h-4" aria-hidden="true" />
            </div>
            <span className="font-semibold text-base tracking-tight text-content">
              PulsePoll
            </span>
            {user?.username && (
              <span className="hidden sm:inline-block text-xs text-content-muted font-mono pl-1">
                / {user.username}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle />

            <button
              type="button"
              onClick={handleOpenCreateModal}
              className="px-3.5 py-2 rounded-lg bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover)] text-white text-xs font-medium flex items-center gap-1.5 transition-colors duration-150 cursor-pointer"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>New poll</span>
            </button>
          </div>
        </div>
      </header>

      {/* Dashboard Body */}
      <main className="flex-1 p-6 md:p-8 space-y-8 max-w-6xl w-full mx-auto">
        {/* 3 Number-Focused KPI Summary Cards using tabular-nums */}
        <section ref={kpiContainerRef} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-5 rounded-2xl bg-surface border border-border-subtle space-y-1">
            <span className="text-xs font-medium text-content-secondary">Total polls</span>
            <div className="text-3xl font-semibold text-content font-mono tabular-nums">
              {totalPolls}
            </div>
            <p className="text-xs text-content-muted">All created sessions</p>
          </div>

          <div className="p-5 rounded-2xl bg-surface border border-border-subtle space-y-1">
            <span className="text-xs font-medium text-content-secondary">Total votes</span>
            <div className="text-3xl font-semibold text-content font-mono tabular-nums">
              {totalVotes.toLocaleString()}
            </div>
            <p className="text-xs text-content-muted">Recorded across all polls</p>
          </div>

          <div className="p-5 rounded-2xl bg-surface border border-border-subtle space-y-1">
            <span className="text-xs font-medium text-content-secondary">Open polls</span>
            <div className="text-3xl font-semibold text-success-600 dark:text-success-400 font-mono tabular-nums">
              {activePolls}
            </div>
            <p className="text-xs text-content-muted">Currently accepting votes</p>
          </div>
        </section>

        {/* Polls Listing Section Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-content">All polls</h1>
            <p className="text-xs text-content-secondary">
              Share a participant link or open the live presenter monitor
            </p>
          </div>

          <button
            type="button"
            onClick={fetchPolls}
            aria-label="Refresh polls list"
            className="p-2 rounded-lg border border-border-subtle bg-surface hover:bg-surface-elevated text-content-secondary hover:text-content transition-colors cursor-pointer"
            title="Refresh polls list"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
          </button>
        </div>

        {/* Polls Cards Grid */}
        {isLoading && polls.length === 0 ? (
          <div className="p-12 text-center rounded-2xl bg-surface border border-border-subtle flex flex-col items-center justify-center gap-2.5">
            <RefreshCw className="w-5 h-5 animate-spin text-primary-500" aria-hidden="true" />
            <span className="text-xs text-content-secondary">Loading polls...</span>
          </div>
        ) : polls.length === 0 ? (
          <div className="p-12 text-center rounded-2xl bg-surface border border-border-subtle space-y-3">
            <div className="space-y-1">
              <h2 className="font-semibold text-sm text-content">No polls yet</h2>
              <p className="text-xs text-content-secondary max-w-xs mx-auto">
                Create your first poll to generate a shareable voting link
              </p>
            </div>
            <button
              type="button"
              onClick={handleOpenCreateModal}
              className="px-4 py-2 rounded-lg bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover)] text-white text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>New poll</span>
            </button>
          </div>
        ) : (
          <div ref={pollsGridRef} className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {polls.map((poll) => {
              const pollTotalVotes = poll.options.reduce(
                (sum, o) => sum + (o.voteCount || 0),
                0
              );
              const maxOptionVotes = Math.max(
                0,
                ...poll.options.map((o) => o.voteCount || 0)
              );
              const isCopied = copiedSlug === poll.shareSlug;

              return (
                <div
                  key={poll.id}
                  onMouseEnter={(e) => handleCardHover(e.currentTarget, true)}
                  onMouseLeave={(e) => handleCardHover(e.currentTarget, false)}
                  className="p-5 rounded-2xl bg-surface border border-border-subtle hover:border-border-strong transition-colors flex flex-col justify-between space-y-5"
                >
                  <div className="space-y-3">
                    {/* Card Header with Pulsing status indicator */}
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-xs px-2.5 py-0.5 rounded-full font-medium inline-flex items-center gap-1.5 ${
                          poll.status === 'open'
                            ? 'bg-success-50 dark:bg-success-950/40 text-success-700 dark:text-success-300 border border-success-200 dark:border-success-800/60'
                            : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 border border-border-subtle'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            poll.status === 'open' ? 'bg-success-500 animate-pulse' : 'bg-neutral-400'
                          }`}
                        />
                        <span className="capitalize">{poll.status}</span>
                      </span>

                      <span className="text-xs font-mono tabular-nums text-content-secondary">
                        {pollTotalVotes.toLocaleString()} votes
                      </span>
                    </div>

                    {/* Question & Description */}
                    <div className="space-y-1">
                      <h3 className="font-semibold text-base text-content leading-snug">
                        {poll.question}
                      </h3>
                      {poll.description && (
                        <p className="text-xs text-content-secondary line-clamp-2">
                          {poll.description}
                        </p>
                      )}
                    </div>

                    {/* Live Option Bars Preview with Leader/Winner Spotlight */}
                    <div className="space-y-2 pt-1">
                      {poll.options.map((opt) => {
                        const voteCount = opt.voteCount || 0;
                        const pct =
                          pollTotalVotes > 0
                            ? Math.round((voteCount / pollTotalVotes) * 100)
                            : 0;
                        const isTopOption = voteCount > 0 && voteCount === maxOptionVotes;

                        return (
                          <div key={opt.id} className="space-y-1">
                            <div className="flex items-center justify-between text-xs gap-2">
                              <div className="flex items-center gap-1.5 min-w-0 max-w-[72%]">
                                <span
                                  className={`truncate ${
                                    isTopOption
                                      ? 'font-medium text-content'
                                      : 'font-normal text-content-secondary'
                                  }`}
                                >
                                  {opt.text}
                                </span>
                                {isTopOption && (
                                  <span
                                    className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[11px] font-medium shrink-0 ${
                                      poll.status === 'closed'
                                        ? 'bg-primary-600 text-white'
                                        : 'bg-primary-50 dark:bg-primary-950/60 text-primary-600 dark:text-primary-300'
                                    }`}
                                  >
                                    <Trophy className="w-2.5 h-2.5" aria-hidden="true" />
                                    <span>{poll.status === 'closed' ? 'Winner' : 'Leading'}</span>
                                  </span>
                                )}
                              </div>
                              <span className="font-mono tabular-nums text-content-secondary shrink-0">
                                {pct}% ({voteCount})
                              </span>
                            </div>
                            <div className="w-full h-1.5 rounded-full bg-surface-elevated overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-[width] duration-300 ease-out ${
                                  isTopOption
                                    ? 'bg-primary-600 dark:bg-primary-500'
                                    : 'bg-neutral-400 dark:bg-neutral-600'
                                }`}
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
                        className={`px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                          isCopied
                            ? 'border-success-300 dark:border-success-800 bg-success-50 dark:bg-success-950/50 text-success-700 dark:text-success-300'
                            : 'border-border-subtle hover:bg-surface-elevated text-content'
                        }`}
                      >
                        {isCopied ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-success-600" aria-hidden="true" />
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Copy link</span>
                          </>
                        )}
                      </button>

                      {/* Live Monitor Button */}
                      <button
                        type="button"
                        onClick={(e) => handleOpenLiveMonitor(e, poll)}
                        className="px-3 py-1.5 rounded-lg border border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-950/40 hover:bg-primary-100 dark:hover:bg-primary-900/60 text-xs font-medium text-primary-600 dark:text-primary-400 flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Radio className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Live monitor</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {/* Open/Close Status Toggle */}
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(poll.id)}
                        className="px-3 py-1.5 rounded-lg border border-border-subtle hover:bg-surface-elevated text-xs font-medium text-content-secondary hover:text-content transition-colors cursor-pointer"
                      >
                        {poll.status === 'open' ? 'Close' : 'Reopen'}
                      </button>

                      {/* Delete Button */}
                      <button
                        type="button"
                        onClick={() => handleDeletePoll(poll.id)}
                        aria-label="Delete poll"
                        className="p-1.5 rounded-lg border border-border-subtle hover:bg-error-50 dark:hover:bg-error-950/40 text-content-secondary hover:text-error-600 transition-colors cursor-pointer"
                        title="Delete poll"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Apple-Style Elastic Squish Floating Bottom Pill Navbar */}
      <BottomNav
        activeRoute="dashboard"
        hasPolls={polls.length > 0}
        hasOpenPoll={activePolls > 0}
        onNavigateDashboard={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        onCreatePoll={handleOpenCreateModal}
        onNavigateLive={(e) => {
          if (primaryActivePoll) {
            handleOpenLiveMonitor(e, primaryActivePoll);
          } else {
            triggerToast('Create a poll first to open the live monitor');
          }
        }}
        onLogout={logout}
      />

      {/* Multi-Step Origin-Aware Create Poll Modal */}
      <CreatePollModal
        isOpen={isCreateModalOpen}
        originRect={createOriginRect}
        onClose={() => setIsCreateModalOpen(false)}
        onPollCreated={(newPoll) => {
          setPolls((prev) => [newPoll, ...prev]);
          triggerToast(`Poll "${newPoll.question}" created`);
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
