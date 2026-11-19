import React, { useEffect, useState, useRef, useCallback } from 'react';
import { api, type Poll, type PollOption } from '../lib/api';
import { ThemeToggle } from '../motion/ThemeToggle';
import gsap from 'gsap';
import {
  ArrowLeft,
  Radio,
  Copy,
  CheckCircle2,
  Users,
  Trophy,
  ExternalLink,
  Loader2,
  AlertCircle,
  ToggleLeft,
  ToggleRight,
  Activity,
  Layers,
} from 'lucide-react';

interface LiveMonitorViewProps {
  pollId: string;
  onBack: () => void;
}

interface ActivityEvent {
  id: string;
  timestamp: string;
  message: string;
  type: 'vote' | 'status' | 'system';
}

export const LiveMonitorView: React.FC<LiveMonitorViewProps> = ({ pollId, onBack }) => {
  const [poll, setPoll] = useState<Poll | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Live state
  const [optionCounts, setOptionCounts] = useState<Record<string, number>>({});
  const [totalVotes, setTotalVotes] = useState<number>(0);
  const [pollStatus, setPollStatus] = useState<'open' | 'closed'>('open');
  const [isSSEConnected, setIsSSEConnected] = useState<boolean>(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<boolean>(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [events, setEvents] = useState<ActivityEvent[]>([]);

  // Refs for GSAP tracking and DOM elements
  const prevCountsRef = useRef<Record<string, number>>({});
  const totalVotesRef = useRef<HTMLSpanElement>(null);
  const barRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const pctRefs = useRef<Record<string, HTMLSpanElement | null>>({});
  const countRefs = useRef<Record<string, HTMLSpanElement | null>>({});
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const containerRef = useRef<HTMLDivElement>(null);

  // Initial fetch of poll data
  const fetchPollData = useCallback(async () => {
    try {
      setIsLoading(true);
      setErrorMessage(null);
      const data = await api.getPollById(pollId);
      setPoll(data);
      setPollStatus(data.status);

      const initialCounts: Record<string, number> = {};
      let initialTotal = 0;
      data.options.forEach((opt: PollOption) => {
        const count = opt.voteCount || 0;
        initialCounts[opt.id] = count;
        initialTotal += count;
      });

      setOptionCounts(initialCounts);
      setTotalVotes(initialTotal);
      prevCountsRef.current = { ...initialCounts };

      setEvents([
        {
          id: `init-${Date.now()}`,
          timestamp: new Date().toLocaleTimeString(),
          message: `Live monitor initialized for "${data.question}"`,
          type: 'system',
        },
      ]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load poll details';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  }, [pollId]);

  useEffect(() => {
    fetchPollData();
  }, [fetchPollData]);

  // Connect to SSE stream
  useEffect(() => {
    if (!pollId || isLoading) return;

    const streamUrl = api.getStreamUrl(pollId);
    let eventSource: EventSource | null = null;

    try {
      eventSource = new EventSource(streamUrl);

      eventSource.onopen = () => {
        setIsSSEConnected(true);
        setEvents((prev) => [
          {
            id: `conn-${Date.now()}`,
            timestamp: new Date().toLocaleTimeString(),
            message: 'Real-time Redis Pub/Sub stream connected',
            type: 'system',
          },
          ...prev.slice(0, 40),
        ]);
      };

      eventSource.addEventListener('initial', (e) => {
        try {
          const payload = JSON.parse(e.data);
          if (payload.optionCounts) {
            applyUpdatedCounts(payload.optionCounts, payload.totalVotes);
          }
          if (payload.status) {
            setPollStatus(payload.status);
          }
        } catch {}
      });

      eventSource.addEventListener('vote_update', (e) => {
        try {
          const payload = JSON.parse(e.data);
          if (payload.optionCounts) {
            applyUpdatedCounts(payload.optionCounts, payload.totalVotes);
            setEvents((prev) => [
              {
                id: `vote-${Date.now()}-${Math.random()}`,
                timestamp: new Date().toLocaleTimeString(),
                message: `New vote registered! Total votes now: ${payload.totalVotes}`,
                type: 'vote',
              },
              ...prev.slice(0, 40),
            ]);
          }
        } catch {}
      });

      eventSource.addEventListener('status_change', (e) => {
        try {
          const payload = JSON.parse(e.data);
          if (payload.status) {
            setPollStatus(payload.status);
            setEvents((prev) => [
              {
                id: `status-${Date.now()}`,
                timestamp: new Date().toLocaleTimeString(),
                message: `Poll status updated to ${payload.status.toUpperCase()}`,
                type: 'status',
              },
              ...prev.slice(0, 40),
            ]);
          }
        } catch {}
      });

      eventSource.onerror = () => {
        setIsSSEConnected(false);
      };
    } catch {
      setIsSSEConnected(false);
    }

    return () => {
      eventSource?.close();
      setIsSSEConnected(false);
    };
  }, [pollId, isLoading]);

  // Core GSAP selective animation: Only animate bars and percentages whose counts actually changed
  const applyUpdatedCounts = (newCounts: Record<string, number>, newTotalVotes?: number) => {
    const prevCounts = prevCountsRef.current;
    const computedTotal =
      newTotalVotes !== undefined
        ? newTotalVotes
        : Object.values(newCounts).reduce((sum, val) => sum + val, 0);

    // Animate total votes counter if changed
    if (totalVotesRef.current && totalVotes !== computedTotal) {
      const counterObj = { val: totalVotes };
      gsap.to(counterObj, {
        val: computedTotal,
        duration: 0.6,
        ease: 'power2.out',
        onUpdate: () => {
          if (totalVotesRef.current) {
            totalVotesRef.current.textContent = Math.round(counterObj.val).toLocaleString();
          }
        },
      });
    }

    // Inspect each option to determine if it changed
    Object.keys(newCounts).forEach((optId) => {
      const oldCount = prevCounts[optId] ?? 0;
      const newCount = newCounts[optId] ?? 0;

      const newPct = computedTotal > 0 ? (newCount / computedTotal) * 100 : 0;
      const oldPct =
        totalVotes > 0 && prevCounts[optId] !== undefined
          ? (oldCount / totalVotes) * 100
          : 0;

      // Only tween if count or percentage actually changed
      if (oldCount !== newCount || oldPct !== newPct) {
        const barEl = barRefs.current[optId];
        const pctEl = pctRefs.current[optId];
        const countEl = countRefs.current[optId];
        const cardEl = cardRefs.current[optId];

        if (barEl) {
          gsap.to(barEl, {
            width: `${newPct}%`,
            duration: 0.7,
            ease: 'power2.out',
          });
        }

        if (pctEl) {
          const pctObj = { val: oldPct };
          gsap.to(pctObj, {
            val: newPct,
            duration: 0.7,
            ease: 'power2.out',
            onUpdate: () => {
              if (pctEl) {
                pctEl.textContent = `${pctObj.val.toFixed(1)}%`;
              }
            },
          });
        }

        if (countEl) {
          const countObj = { val: oldCount };
          gsap.to(countObj, {
            val: newCount,
            duration: 0.7,
            ease: 'power2.out',
            onUpdate: () => {
              if (countEl) {
                countEl.textContent = `${Math.round(countObj.val).toLocaleString()} votes`;
              }
            },
          });
        }

        // Brief tactile highlight on updated card
        if (cardEl && oldCount !== newCount) {
          gsap.fromTo(
            cardEl,
            { borderColor: 'var(--primary-500)', scale: 1.01 },
            { borderColor: 'var(--border-subtle)', scale: 1, duration: 0.8, ease: 'power2.out' }
          );
        }
      }
    });

    // Update state and store the new counts in ref
    prevCountsRef.current = { ...newCounts };
    setOptionCounts(newCounts);
    setTotalVotes(computedTotal);
  };

  // Instant status toggle wired to PATCH /api/polls/:id/status
  const handleToggleStatus = async () => {
    if (!poll || isUpdatingStatus) return;
    const nextStatus = pollStatus === 'open' ? 'closed' : 'open';
    setIsUpdatingStatus(true);
    try {
      await api.updatePollStatus(poll.id, nextStatus);
      setPollStatus(nextStatus);
    } catch {
      // Revert if API failed
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // One-click share link copy
  const handleCopyShareLink = () => {
    if (!poll) return;
    const shareUrl = `${window.location.origin}/vote/${poll.shareSlug}`;
    navigator.clipboard.writeText(shareUrl);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2400);
  };

  // Calculate highest vote count for leader badge
  const highestCount = Math.max(0, ...Object.values(optionCounts));

  if (isLoading) {
    return (
      <div className="min-h-screen bg-canvas text-content flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3 text-content-secondary">
          <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
          <p className="text-sm font-semibold">Connecting to live presenter stream...</p>
        </div>
      </div>
    );
  }

  if (errorMessage || !poll) {
    return (
      <div className="min-h-screen bg-canvas text-content flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-surface border border-border-strong rounded-3xl p-8 text-center space-y-5 shadow-xl">
          <div className="w-12 h-12 rounded-2xl bg-error-50 dark:bg-error-950/50 text-error-600 flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-content">Poll Not Found</h2>
            <p className="text-xs text-content-secondary mt-1">
              {errorMessage || 'Unable to load real-time telemetry for this poll.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="w-full py-2.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold transition-colors cursor-pointer"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="min-h-screen bg-canvas text-content flex flex-col transition-colors duration-200">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-30 bg-surface/85 backdrop-blur-md border-b border-border-subtle px-4 sm:px-8 py-3.5 transition-colors">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          {/* Back button & Title */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className="p-2 rounded-xl border border-border-subtle hover:bg-surface-elevated text-content-secondary hover:text-content transition-colors cursor-pointer group"
              title="Return to Dashboard"
            >
              <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
            </button>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-primary-50 dark:bg-primary-950/60 text-primary-600 dark:text-primary-400 flex items-center justify-center shadow-xs">
                <Radio className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-bold text-content leading-none flex items-center gap-2">
                  Live Poll Monitor
                </span>
                <span className="text-[11px] text-content-secondary">
                  Sub-millisecond Redis Pub/Sub telemetry
                </span>
              </div>
            </div>
          </div>

          {/* Right Controls: Share Pill, Open/Close Switch, Live Status, Theme */}
          <div className="flex items-center flex-wrap gap-2.5 sm:gap-3">
            {/* Live SSE Pulsing Pill */}
            <div
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
                isSSEConnected
                  ? 'bg-success-50 dark:bg-success-950/50 text-success-700 dark:text-success-300 border border-success-200 dark:border-success-800'
                  : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 border border-neutral-200 dark:border-neutral-700'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isSSEConnected ? 'bg-success-500 animate-pulse' : 'bg-neutral-400'
                }`}
              />
              <span>{isSSEConnected ? 'LIVE' : 'DISCONNECTED'}</span>
            </div>

            {/* Shareable Link Pill with One-Click Copy */}
            <div className="flex items-center rounded-xl border border-border-strong bg-surface overflow-hidden shadow-xs">
              <span className="px-3 py-1.5 text-xs font-mono text-content-secondary border-r border-border-subtle hidden lg:inline max-w-[220px] truncate">
                /vote/{poll.shareSlug}
              </span>
              <button
                type="button"
                onClick={handleCopyShareLink}
                className="px-3 py-1.5 hover:bg-surface-elevated text-xs font-semibold text-content flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Copy voting link"
              >
                {copySuccess ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-success-600" />
                    <span className="text-success-700 dark:text-success-400">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Link</span>
                  </>
                )}
              </button>
              <a
                href={`/vote/${poll.shareSlug}`}
                target="_blank"
                rel="noreferrer"
                className="p-2 border-l border-border-subtle hover:bg-surface-elevated text-content-secondary hover:text-content transition-colors"
                title="Open participant view in new tab"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            {/* Instant Voting Open / Closed Switch */}
            <button
              type="button"
              disabled={isUpdatingStatus}
              onClick={handleToggleStatus}
              className={`px-3.5 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                pollStatus === 'open'
                  ? 'border-success-300 dark:border-success-800 bg-success-50 dark:bg-success-950/40 text-success-700 dark:text-success-300 hover:bg-success-100'
                  : 'border-neutral-300 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200'
              } ${isUpdatingStatus ? 'opacity-60 cursor-wait' : ''}`}
            >
              {pollStatus === 'open' ? (
                <>
                  <ToggleRight className="w-4 h-4 text-success-600" />
                  <span>Voting Open</span>
                </>
              ) : (
                <>
                  <ToggleLeft className="w-4 h-4 text-neutral-500" />
                  <span>Voting Closed</span>
                </>
              )}
            </button>

            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-8 space-y-8">
        {/* Poll Header & Telemetry Summary Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
          {/* Question & Meta (3 cols) */}
          <div className="lg:col-span-3 space-y-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                  pollStatus === 'open'
                    ? 'bg-success-50 dark:bg-success-950/50 text-success-700 dark:text-success-300 border border-success-200 dark:border-success-800'
                    : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 border border-neutral-200 dark:border-neutral-700'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    pollStatus === 'open' ? 'bg-success-500 animate-pulse' : 'bg-neutral-400'
                  }`}
                />
                <span className="capitalize">{pollStatus} for Voting</span>
              </span>

              {poll.allowMultiple && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-50 dark:bg-primary-950/40 text-primary-600 dark:text-primary-300 border border-primary-200 dark:border-primary-800">
                  <Layers className="w-3 h-3" />
                  <span>Multiple Choice</span>
                </span>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-content tracking-tight leading-snug">
              {poll.question}
            </h1>

            {poll.description && (
              <p className="text-sm text-content-secondary leading-relaxed max-w-3xl">
                {poll.description}
              </p>
            )}
          </div>

          {/* Real-time KPI Card: Total Votes (1 col) */}
          <div className="lg:col-span-1 rounded-3xl bg-surface border border-border-subtle p-6 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between text-content-secondary mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">Total Votes Cast</span>
              <Users className="w-4 h-4 text-primary-500" />
            </div>
            <div className="text-3xl sm:text-4xl font-extrabold text-content tabular-nums tracking-tight">
              <span ref={totalVotesRef}>{totalVotes.toLocaleString()}</span>
            </div>
            <p className="text-[11px] text-content-secondary mt-2 flex items-center gap-1">
              <Activity className="w-3 h-3 text-success-500" />
              <span>Real-time Redis atomic tally</span>
            </p>
          </div>
        </div>

        {/* Results Section & Event Log Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          {/* Horizontal Result Bars Powered by GSAP (2 cols) */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-sm font-bold text-content uppercase tracking-wider flex items-center gap-2">
                <span>Live Breakdown</span>
                <span className="text-xs font-normal text-content-secondary lowercase">
                  ({poll.options.length} options)
                </span>
              </h2>
              <span className="text-xs text-content-secondary">
                Updated automatically via SSE
              </span>
            </div>

            <div className="space-y-3.5">
              {poll.options.map((option, idx) => {
                const count = optionCounts[option.id] ?? 0;
                const percentage = totalVotes > 0 ? (count / totalVotes) * 100 : 0;
                const isLeading = count > 0 && count === highestCount;

                return (
                  <div
                    key={option.id}
                    ref={(el) => {
                      cardRefs.current[option.id] = el;
                    }}
                    className={`group relative rounded-2xl border bg-surface p-5 shadow-xs transition-colors overflow-hidden ${
                      isLeading
                        ? 'border-primary-300 dark:border-primary-700/80'
                        : 'border-border-subtle hover:border-border-strong'
                    }`}
                  >
                    {/* Background Progress Bar with GSAP target ref */}
                    <div className="absolute inset-0 bg-surface-elevated/40 pointer-events-none" />
                    <div
                      ref={(el) => {
                        barRefs.current[option.id] = el;
                      }}
                      style={{ width: `${percentage}%` }}
                      className={`absolute inset-y-0 left-0 transition-opacity pointer-events-none ${
                        isLeading
                          ? 'bg-primary-500/15 dark:bg-primary-500/25'
                          : 'bg-neutral-200/50 dark:bg-neutral-800/60'
                      }`}
                    />

                    {/* Left Accent indicator for leading option */}
                    {isLeading && (
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary-600 dark:bg-primary-500" />
                    )}

                    {/* Content Layer */}
                    <div className="relative z-10 flex flex-col gap-3">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <span className="w-6 h-6 rounded-lg bg-surface-elevated text-content-secondary font-mono text-xs font-bold flex items-center justify-center shrink-0 border border-border-subtle">
                            {idx + 1}
                          </span>
                          <span className="text-base font-bold text-content leading-snug">
                            {option.text}
                          </span>
                        </div>

                        {isLeading && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-primary-50 dark:bg-primary-950/60 text-primary-600 dark:text-primary-300 border border-primary-200 dark:border-primary-800 shrink-0">
                            <Trophy className="w-3 h-3 text-primary-500" />
                            <span>Leading</span>
                          </span>
                        )}
                      </div>

                      {/* Numbers Row */}
                      <div className="flex items-center justify-between text-xs font-semibold pt-1 border-t border-border-subtle/60">
                        <span
                          ref={(el) => {
                            countRefs.current[option.id] = el;
                          }}
                          className="text-content-secondary tabular-nums"
                        >
                          {count.toLocaleString()} votes
                        </span>

                        <span
                          ref={(el) => {
                            pctRefs.current[option.id] = el;
                          }}
                          className="text-content font-bold tabular-nums text-sm"
                        >
                          {percentage.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Live Activity & Connection Telemetry (1 col) */}
          <div className="lg:col-span-1 space-y-4">
            <div className="rounded-3xl bg-surface border border-border-subtle p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-border-subtle pb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-content flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-primary-500" />
                  <span>Real-Time Stream Feed</span>
                </span>
                <span className="text-[11px] text-content-secondary tabular-nums">
                  {events.length} events
                </span>
              </div>

              {/* Feed items */}
              <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
                {events.length === 0 ? (
                  <p className="text-xs text-content-secondary py-4 text-center">
                    Awaiting live voting events...
                  </p>
                ) : (
                  events.map((evt) => (
                    <div
                      key={evt.id}
                      className="p-3 rounded-xl bg-surface-elevated/70 border border-border-subtle/80 flex items-start gap-2.5 text-xs animate-in fade-in duration-200"
                    >
                      <div className="mt-0.5 shrink-0">
                        {evt.type === 'vote' ? (
                          <div className="w-2 h-2 rounded-full bg-primary-500" />
                        ) : evt.type === 'status' ? (
                          <div className="w-2 h-2 rounded-full bg-warning-500" />
                        ) : (
                          <div className="w-2 h-2 rounded-full bg-success-500" />
                        )}
                      </div>
                      <div className="flex-1 space-y-0.5">
                        <p className="text-content font-medium leading-tight">{evt.message}</p>
                        <p className="text-[10px] text-content-secondary tabular-nums font-mono">
                          {evt.timestamp}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Quick Share Banner */}
            <div className="rounded-3xl bg-primary-50 dark:bg-primary-950/30 border border-primary-200 dark:border-primary-800 p-5 space-y-3">
              <div className="flex items-center gap-2 text-primary-700 dark:text-primary-300">
                <Radio className="w-4 h-4" />
                <span className="text-xs font-bold">Presenter Link</span>
              </div>
              <p className="text-xs text-content-secondary leading-relaxed">
                Invite audience members to cast their votes instantly using the public participant link.
              </p>
              <button
                type="button"
                onClick={handleCopyShareLink}
                className="w-full py-2 px-3 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-xs"
              >
                {copySuccess ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Link Copied to Clipboard</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copy Participant Link</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
