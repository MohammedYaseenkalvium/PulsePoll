import React, { useEffect, useState, useRef, useCallback } from 'react';
import { api, type Poll, type PollOption } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { ThemeToggle } from '../motion/ThemeToggle';
import { useOriginTransition, type OriginRect } from '../motion/useOriginTransition';
import { BottomNav } from '../components/BottomNav';
import { CreatePollModal } from '../components/CreatePollModal';
import { QRCodeSVG } from 'qrcode.react';
import gsap from 'gsap';
import {
  ArrowLeft,
  Radio,
  Copy,
  CheckCircle2,
  Trophy,
  ExternalLink,
  Loader2,
  AlertCircle,
  ToggleLeft,
  ToggleRight,
  QrCode,
  X,
} from 'lucide-react';

interface LiveMonitorViewProps {
  pollId: string;
  onBack: () => void;
  onNavigateToPoll?: (pollId: string) => void;
}

interface ActivityEvent {
  id: string;
  timestamp: string;
  message: string;
  type: 'vote' | 'status' | 'system';
}

export const LiveMonitorView: React.FC<LiveMonitorViewProps> = ({
  pollId,
  onBack,
  onNavigateToPoll,
}) => {
  const { isAuthenticated, logout } = useAuth();
  const [poll, setPoll] = useState<Poll | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Create Poll Modal from Dock
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createOriginRect, setCreateOriginRect] = useState<OriginRect | null>(null);

  // Live state
  const [optionCounts, setOptionCounts] = useState<Record<string, number>>({});
  const [totalVotes, setTotalVotes] = useState<number>(0);
  const [pollStatus, setPollStatus] = useState<'open' | 'closed'>('open');
  const [isSSEConnected, setIsSSEConnected] = useState<boolean>(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<boolean>(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [events, setEvents] = useState<ActivityEvent[]>([]);

  // QR Code Popover state & Origin Transition (fast 240ms in / 160ms out)
  const [isQrOpen, setIsQrOpen] = useState(false);
  const [qrOriginRect, setQrOriginRect] = useState<OriginRect | null>(null);
  const qrPopoverRef = useRef<HTMLDivElement>(null);
  const { animateIn: animateQrIn, animateOut: animateQrOut } = useOriginTransition({
    durationIn: 0.24,
    durationOut: 0.16,
    easeIn: 'power3.out',
    easeOut: 'power2.in',
  });

  // Refs for GSAP tracking and DOM elements
  const prevCountsRef = useRef<Record<string, number>>({});
  const totalVotesRef = useRef<HTMLSpanElement>(null);
  const totalCardRef = useRef<HTMLDivElement>(null);
  const copyBtnRef = useRef<HTMLButtonElement>(null);
  const resultsListRef = useRef<HTMLDivElement>(null);
  const barRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const pulseGlowRefs = useRef<Record<string, HTMLDivElement | null>>({});
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
          message: `Monitoring "${data.question}"`,
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

  // Entrance stagger for result bars on initial load (260ms)
  useEffect(() => {
    if (!isLoading && poll && resultsListRef.current) {
      const ctx = gsap.context(() => {
        const mm = gsap.matchMedia();
        mm.add('(prefers-reduced-motion: no-preference)', () => {
          gsap.fromTo(
            resultsListRef.current!.children,
            { y: 10, opacity: 0 },
            {
              y: 0,
              opacity: 1,
              duration: 0.26,
              stagger: 0.04,
              ease: 'power3.out',
              clearProps: 'transform',
            }
          );
        });
      }, resultsListRef);
      return () => ctx.revert();
    }
  }, [isLoading, poll?.id]);

  // Animate QR popover in when opened
  useEffect(() => {
    if (isQrOpen && qrPopoverRef.current) {
      requestAnimationFrame(() => {
        if (qrPopoverRef.current) {
          animateQrIn(qrPopoverRef.current, qrOriginRect);
        }
      });
    }
  }, [isQrOpen, qrOriginRect, animateQrIn]);

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
            message: 'SSE stream connected',
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
                message: `Vote recorded · Total: ${payload.totalVotes}`,
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
                message: `Status changed to ${payload.status}`,
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

  // Core GSAP selective animation (fast 300ms): Only animate bars and percentages whose counts actually changed
  const applyUpdatedCounts = (newCounts: Record<string, number>, newTotalVotes?: number) => {
    const prevCounts = prevCountsRef.current;
    const computedTotal =
      newTotalVotes !== undefined
        ? newTotalVotes
        : Object.values(newCounts).reduce((sum, val) => sum + val, 0);
    const isReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Odometer tween on total votes counter + subtle border highlight on KPI card if changed
    if (totalVotesRef.current && totalVotes !== computedTotal) {
      if (isReduced) {
        totalVotesRef.current.textContent = computedTotal.toLocaleString();
      } else {
        const counterObj = { val: totalVotes };
        gsap.to(counterObj, {
          val: computedTotal,
          duration: 0.3,
          ease: 'power2.out',
          onUpdate: () => {
            if (totalVotesRef.current) {
              totalVotesRef.current.textContent = Math.round(counterObj.val).toLocaleString();
            }
          },
        });

        if (totalCardRef.current) {
          gsap.fromTo(
            totalCardRef.current,
            { borderColor: 'var(--primary-500)' },
            { borderColor: 'var(--border-subtle)', duration: 0.32, ease: 'power2.out' }
          );
        }
      }
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
        const pulseEl = pulseGlowRefs.current[optId];
        const pctEl = pctRefs.current[optId];
        const countEl = countRefs.current[optId];
        const cardEl = cardRefs.current[optId];

        if (isReduced) {
          if (barEl) gsap.set(barEl, { width: `${newPct}%` });
          if (pctEl) pctEl.textContent = `${newPct.toFixed(1)}%`;
          if (countEl) countEl.textContent = `${newCount.toLocaleString()} votes`;
        } else {
          if (barEl) {
            gsap.to(barEl, {
              width: `${newPct}%`,
              duration: 0.32,
              ease: 'power2.out',
            });
          }

          if (pctEl) {
            const pctObj = { val: oldPct };
            gsap.to(pctObj, {
              val: newPct,
              duration: 0.3,
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
              duration: 0.3,
              ease: 'power2.out',
              onUpdate: () => {
                if (countEl) {
                  countEl.textContent = `${Math.round(countObj.val).toLocaleString()} votes`;
                }
              },
            });
          }

          // Subtle GSAP live vote pulse highlight (320ms) on the option bar & card that received a new vote
          if (oldCount < newCount) {
            if (pulseEl) {
              gsap.fromTo(
                pulseEl,
                { opacity: 0.45 },
                { opacity: 0, duration: 0.32, ease: 'power2.out' }
              );
            }
            if (cardEl) {
              gsap.fromTo(
                cardEl,
                { borderColor: 'var(--primary-500)' },
                {
                  borderColor: 'var(--border-subtle)',
                  duration: 0.34,
                  ease: 'power2.out',
                }
              );
            }
          }
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

  // One-click share link copy with fast 160ms GSAP micro-feedback
  const handleCopyShareLink = (e?: React.MouseEvent<HTMLButtonElement>) => {
    if (!poll) return;
    const shareUrl = `${window.location.origin}/vote/${poll.shareSlug}`;
    navigator.clipboard.writeText(shareUrl);
    setCopySuccess(true);

    const targetBtn = e?.currentTarget || copyBtnRef.current;
    if (targetBtn && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      gsap.fromTo(
        targetBtn,
        { scale: 0.97 },
        { scale: 1, duration: 0.16, ease: 'power2.out' }
      );
    }

    setTimeout(() => setCopySuccess(false), 2200);
  };

  // Toggle QR Code Popover with Origin Transition
  const handleToggleQr = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (isQrOpen) {
      handleCloseQr();
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    setQrOriginRect({
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    });
    setIsQrOpen(true);
  };

  const handleCloseQr = () => {
    if (qrPopoverRef.current) {
      animateQrOut(qrPopoverRef.current, qrOriginRect, () => {
        setIsQrOpen(false);
      });
    } else {
      setIsQrOpen(false);
    }
  };

  // Calculate highest vote count and leading option
  const highestCount = Math.max(0, ...Object.values(optionCounts));
  const leadingOption =
    poll && highestCount > 0
      ? poll.options.find((opt) => (optionCounts[opt.id] ?? 0) === highestCount)
      : null;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-canvas text-content flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-2.5 text-content-secondary">
          <Loader2 className="w-6 h-6 animate-spin text-primary-500" aria-hidden="true" />
          <p className="text-xs font-medium">Loading live monitor...</p>
        </div>
      </div>
    );
  }

  if (errorMessage || !poll) {
    return (
      <div className="min-h-screen bg-canvas text-content flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-surface border border-border-strong rounded-2xl p-6 text-center space-y-4">
          <div className="w-10 h-10 rounded-xl bg-error-50 dark:bg-error-950/50 text-error-600 flex items-center justify-center mx-auto">
            <AlertCircle className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-content">Poll not found</h2>
            <p className="text-xs text-content-secondary mt-1">
              {errorMessage || 'Unable to load this poll'}
            </p>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="w-full py-2.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-xs font-medium transition-colors cursor-pointer"
          >
            Back to polls
          </button>
        </div>
      </div>
    );
  }

  const shareUrl = `${window.location.origin}/vote/${poll.shareSlug}`;
  const isClosed = pollStatus === 'closed';

  return (
    <div
      ref={containerRef}
      style={{ paddingBottom: isAuthenticated ? '96px' : undefined }}
      className="min-h-screen bg-canvas text-content flex flex-col transition-colors duration-200"
    >
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-30 bg-surface border-b border-border-subtle px-4 sm:px-8 py-3 transition-colors">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          {/* Back button & Title */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              aria-label="Back to polls"
              className="p-2 rounded-lg border border-border-subtle hover:bg-surface-elevated text-content-secondary hover:text-content transition-colors cursor-pointer"
              title="Back to polls"
            >
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            </button>
            <div>
              <span className="text-xs font-semibold text-content leading-none block">
                Live monitor
              </span>
              <span className="text-xs text-content-muted font-mono">
                /vote/{poll.shareSlug}
              </span>
            </div>
          </div>

          {/* Right Controls: Live SSE Pill, Share Pill + QR Button, Open/Close Switch, Theme */}
          <div className="flex items-center flex-wrap gap-2.5">
            {/* Live SSE Connection Status Pill */}
            <div
              role="status"
              aria-atomic="true"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                isSSEConnected
                  ? 'bg-success-50 dark:bg-success-950/50 text-success-700 dark:text-success-300 border border-success-200 dark:border-success-800'
                  : 'bg-warning-50 dark:bg-warning-950/50 text-warning-700 dark:text-warning-300 border border-warning-200 dark:border-warning-800'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isSSEConnected
                    ? 'bg-success-500 animate-pulse'
                    : 'bg-warning-500 animate-pulse'
                }`}
              />
              <span>{isSSEConnected ? 'LIVE' : 'Reconnecting'}</span>
            </div>

            {/* Shareable Link Pill with One-Click Copy + QR Popover Trigger */}
            <div className="relative flex items-center rounded-lg border border-border-subtle bg-surface">
              <span className="px-3 py-1.5 text-xs font-mono text-content-secondary border-r border-border-subtle hidden lg:inline max-w-[200px] truncate">
                /vote/{poll.shareSlug}
              </span>
              <button
                ref={copyBtnRef}
                type="button"
                onClick={handleCopyShareLink}
                className={`px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                  copySuccess
                    ? 'bg-success-50 dark:bg-success-950/40 text-success-700 dark:text-success-300'
                    : 'hover:bg-surface-elevated text-content'
                }`}
                title="Copy voting link"
              >
                {copySuccess ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-success-600" aria-hidden="true" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Copy link</span>
                  </>
                )}
              </button>

              {/* Toggleable QR Code Popover Button */}
              <button
                type="button"
                onClick={handleToggleQr}
                aria-expanded={isQrOpen}
                aria-label="Toggle QR Code share panel"
                className={`px-2.5 py-1.5 border-l border-border-subtle text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                  isQrOpen
                    ? 'bg-primary-50 dark:bg-primary-950/60 text-primary-600 dark:text-primary-300'
                    : 'hover:bg-surface-elevated text-content-secondary hover:text-content'
                }`}
                title="Show participant QR code"
              >
                <QrCode className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">QR</span>
              </button>

              <a
                href={`/vote/${poll.shareSlug}`}
                target="_blank"
                rel="noreferrer"
                aria-label="Open participant view in new tab"
                className="p-2 border-l border-border-subtle hover:bg-surface-elevated text-content-secondary hover:text-content transition-colors rounded-r-lg"
                title="Open participant view in new tab"
              >
                <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
              </a>

              {/* Origin-Aware QR Code Share Popover */}
              {isQrOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={handleCloseQr}
                    aria-hidden="true"
                  />
                  <div
                    ref={qrPopoverRef}
                    role="dialog"
                    aria-label="Scan QR Code to Vote"
                    className="absolute right-0 top-full mt-2.5 z-50 w-72 rounded-2xl bg-surface border border-border-strong shadow-xl p-5 space-y-4"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-xs font-semibold text-content">Scan to vote</h3>
                        <p className="text-xs text-content-secondary">Opens participant ballot</p>
                      </div>
                      <button
                        type="button"
                        onClick={handleCloseQr}
                        aria-label="Close QR code popover"
                        className="p-1.5 rounded-lg text-content-secondary hover:text-content hover:bg-surface-elevated transition-colors cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>

                    {/* High-Contrast QR Code Canvas using CSS Semantic Variables */}
                    <div className="p-4 rounded-xl bg-neutral-50 border border-border-subtle flex items-center justify-center">
                      <QRCodeSVG
                        value={shareUrl}
                        size={176}
                        level="M"
                        bgColor="var(--neutral-50)"
                        fgColor="var(--neutral-900)"
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="px-3 py-1.5 rounded-lg bg-surface-elevated border border-border-subtle text-xs font-mono text-content-secondary truncate text-center">
                        {shareUrl}
                      </div>
                      <button
                        type="button"
                        onClick={handleCopyShareLink}
                        className={`w-full py-2 px-3 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                          copySuccess
                            ? 'bg-success-600 text-white'
                            : 'bg-primary-600 hover:bg-primary-700 text-white'
                        }`}
                      >
                        {copySuccess ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Copy voting link</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Instant Voting Open / Closed Switch */}
            <button
              type="button"
              disabled={isUpdatingStatus}
              onClick={handleToggleStatus}
              className={`px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-2 transition-colors cursor-pointer ${
                pollStatus === 'open'
                  ? 'border-success-300 dark:border-success-800 bg-success-50 dark:bg-success-950/40 text-success-700 dark:text-success-300 hover:bg-success-100'
                  : 'border-neutral-300 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200'
              } ${isUpdatingStatus ? 'opacity-60 cursor-wait' : ''}`}
            >
              {pollStatus === 'open' ? (
                <>
                  <ToggleRight className="w-4 h-4 text-success-600" aria-hidden="true" />
                  <span>Voting open</span>
                </>
              ) : (
                <>
                  <ToggleLeft className="w-4 h-4 text-neutral-500" aria-hidden="true" />
                  <span>Voting closed</span>
                </>
              )}
            </button>

            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-8 space-y-6">
        {/* Poll Header & Telemetry Summary Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
          {/* Question & Meta (3 cols) */}
          <div className="lg:col-span-3 space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
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
                <span className="capitalize">{pollStatus}</span>
              </span>

              <span className="text-xs text-content-muted">
                {poll.allowMultiple ? 'Multiple choice' : 'Single choice'}
              </span>

              {/* Dynamic Leader / Final Winner Pill in Header (--primary accent) */}
              {leadingOption && (
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    isClosed
                      ? 'bg-primary-600 text-white'
                      : 'bg-primary-50 dark:bg-primary-950/60 text-primary-700 dark:text-primary-300 border border-primary-200 dark:border-primary-800'
                  }`}
                >
                  <Trophy className="w-3 h-3" aria-hidden="true" />
                  <span className="truncate max-w-[220px]">
                    {isClosed ? 'Winner:' : 'Leading:'} {leadingOption.text}
                  </span>
                </span>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl font-semibold text-content tracking-tight leading-snug">
              {poll.question}
            </h1>

            {poll.description && (
              <p className="text-sm text-content-secondary leading-relaxed max-w-3xl">
                {poll.description}
              </p>
            )}
          </div>

          {/* Real-time KPI Card: Total Votes Odometer (1 col, pure figure) */}
          <div
            ref={totalCardRef}
            className="lg:col-span-1 rounded-2xl bg-surface border border-border-subtle p-5 space-y-1 transition-colors"
          >
            <span className="text-xs font-medium text-content-secondary">Total votes</span>
            <div className="text-3xl font-semibold text-content font-mono tabular-nums tracking-tight">
              <span ref={totalVotesRef}>{totalVotes.toLocaleString()}</span>
            </div>
            <p className="text-xs text-content-muted font-mono truncate">
              /vote/{poll.shareSlug}
            </p>
          </div>
        </div>

        {/* Final Winner Spotlight Banner when Poll is Closed and has Votes (--primary accent) */}
        {isClosed && leadingOption && totalVotes > 0 && (
          <div className="rounded-2xl bg-primary-50/70 dark:bg-primary-950/40 border border-primary-300 dark:border-primary-800 p-5 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary-600 text-white flex items-center justify-center shrink-0">
                <Trophy className="w-4 h-4" aria-hidden="true" />
              </div>
              <div>
                <span className="text-xs font-medium text-primary-700 dark:text-primary-300">
                  Final winner
                </span>
                <h2 className="text-base sm:text-lg font-semibold text-content">
                  {leadingOption.text}
                </h2>
              </div>
            </div>
            <div className="font-mono tabular-nums">
              <span className="px-3 py-1.5 rounded-lg bg-surface border border-primary-200 dark:border-primary-800 text-xs font-medium text-primary-700 dark:text-primary-300">
                {highestCount.toLocaleString()} votes ({((highestCount / totalVotes) * 100).toFixed(1)}%)
              </span>
            </div>
          </div>
        )}

        {/* Results Section & Event Log Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Horizontal Result Bars Powered by GSAP (2 cols) */}
          <div className="lg:col-span-2 space-y-3">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-xs font-semibold text-content flex items-center gap-1.5">
                <span>{isClosed ? 'Final results' : 'Live breakdown'}</span>
                <span className="text-xs font-normal text-content-muted font-mono">
                  ({poll.options.length})
                </span>
              </h2>
              <span className="text-xs text-content-muted">
                {isSSEConnected ? 'Streaming live' : 'Reconnecting'}
              </span>
            </div>

            <div ref={resultsListRef} className="space-y-3">
              {poll.options.map((option, idx) => {
                const count = optionCounts[option.id] ?? 0;
                const percentage = totalVotes > 0 ? (count / totalVotes) * 100 : 0;
                const isLeading = count > 0 && count === highestCount;
                const isFinalWinner = isClosed && isLeading;

                return (
                  <div
                    key={option.id}
                    ref={(el) => {
                      cardRefs.current[option.id] = el;
                    }}
                    className={`group relative rounded-xl border bg-surface p-4 transition-colors overflow-hidden ${
                      isLeading
                        ? 'border-primary-400 dark:border-primary-700'
                        : 'border-border-subtle hover:border-border-strong'
                    }`}
                  >
                    {/* Background Progress Bar with GSAP target ref */}
                    <div className="absolute inset-0 bg-surface-elevated/35 pointer-events-none" />
                    <div
                      ref={(el) => {
                        barRefs.current[option.id] = el;
                      }}
                      style={{ width: `${percentage}%` }}
                      className={`absolute inset-y-0 left-0 transition-opacity pointer-events-none ${
                        isLeading
                          ? 'bg-primary-500/20 dark:bg-primary-500/30'
                          : 'bg-neutral-200/55 dark:bg-neutral-800/65'
                      }`}
                    />

                    {/* GSAP Live Vote Pulse Highlight Overlay */}
                    <div
                      ref={(el) => {
                        pulseGlowRefs.current[option.id] = el;
                      }}
                      style={{ opacity: 0 }}
                      className="absolute inset-0 bg-primary-500/15 dark:bg-primary-400/20 pointer-events-none"
                    />

                    {/* Left Accent indicator for leading/winning option */}
                    {isLeading && (
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary-600 dark:bg-primary-500" />
                    )}

                    {/* Content Layer */}
                    <div className="relative z-10 flex flex-col gap-2.5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-2.5">
                          <span
                            className={`w-6 h-6 rounded-md font-mono tabular-nums text-xs font-medium flex items-center justify-center shrink-0 border ${
                              isLeading
                                ? 'bg-primary-600 text-white border-primary-600'
                                : 'bg-surface-elevated text-content-secondary border-border-subtle'
                            }`}
                          >
                            {idx + 1}
                          </span>
                          <span className="text-sm font-semibold text-content leading-snug">
                            {option.text}
                          </span>
                        </div>

                        {isLeading && (
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${
                              isFinalWinner
                                ? 'bg-primary-600 text-white'
                                : 'bg-primary-50 dark:bg-primary-950/60 text-primary-600 dark:text-primary-300 border border-primary-200 dark:border-primary-800'
                            }`}
                          >
                            <Trophy className="w-3 h-3" aria-hidden="true" />
                            <span>{isFinalWinner ? 'Winner' : 'Leading'}</span>
                          </span>
                        )}
                      </div>

                      {/* Numbers Row */}
                      <div className="flex items-center justify-between text-xs pt-1 border-t border-border-subtle/60 font-mono tabular-nums">
                        <span
                          ref={(el) => {
                            countRefs.current[option.id] = el;
                          }}
                          className="text-content-secondary"
                        >
                          {count.toLocaleString()} votes
                        </span>

                        <span
                          ref={(el) => {
                            pctRefs.current[option.id] = el;
                          }}
                          className={`font-semibold text-sm ${
                            isLeading
                              ? 'text-primary-600 dark:text-primary-400'
                              : 'text-content'
                          }`}
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

          {/* Live Activity & Connection Telemetry + QR Quick Card (1 col) */}
          <div className="lg:col-span-1 space-y-4">
            <div className="rounded-2xl bg-surface border border-border-subtle p-5 space-y-3.5">
              <div className="flex items-center justify-between border-b border-border-subtle pb-2.5">
                <span className="text-xs font-semibold text-content">Activity feed</span>
                <span className="text-xs text-content-muted font-mono tabular-nums">
                  {events.length} events
                </span>
              </div>

              {/* Feed items */}
              <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                {events.length === 0 ? (
                  <p className="text-xs text-content-secondary py-4 text-center">
                    Waiting for votes...
                  </p>
                ) : (
                  events.map((evt) => (
                    <div
                      key={evt.id}
                      className="p-2.5 rounded-lg bg-surface-elevated/70 border border-border-subtle/80 flex items-start gap-2.5 text-xs"
                    >
                      <div className="mt-1 shrink-0">
                        {evt.type === 'vote' ? (
                          <div className="w-1.5 h-1.5 rounded-full bg-primary-500" />
                        ) : evt.type === 'status' ? (
                          <div className="w-1.5 h-1.5 rounded-full bg-warning-500" />
                        ) : (
                          <div className="w-1.5 h-1.5 rounded-full bg-success-500" />
                        )}
                      </div>
                      <div className="flex-1 space-y-0.5">
                        <p className="text-content font-medium leading-tight">{evt.message}</p>
                        <p className="text-[11px] text-content-muted tabular-nums font-mono">
                          {evt.timestamp}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Quick Share & QR Banner */}
            <div className="rounded-2xl bg-surface border border-border-subtle p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-content">
                  <Radio className="w-4 h-4 text-primary-500" aria-hidden="true" />
                  <span className="text-xs font-semibold">Participant link</span>
                </div>
                <button
                  type="button"
                  onClick={handleToggleQr}
                  className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <QrCode className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{isQrOpen ? 'Hide QR' : 'Show QR'}</span>
                </button>
              </div>
              <p className="text-xs text-content-secondary leading-relaxed">
                Participants can scan the QR code or open the link to submit their vote
              </p>
              <button
                type="button"
                onClick={handleCopyShareLink}
                className={`w-full py-2 px-3 rounded-lg text-white text-xs font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                  copySuccess
                    ? 'bg-success-600 hover:bg-success-700'
                    : 'bg-primary-600 hover:bg-primary-700'
                }`}
              >
                {copySuccess ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" aria-hidden="true" />
                    <span>Copy participant link</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </main>

      {isAuthenticated && (
        <>
          <BottomNav
            activeRoute="live"
            hasPolls={true}
            hasOpenPoll={pollStatus === 'open'}
            onNavigateDashboard={onBack}
            onCreatePoll={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setCreateOriginRect({
                left: rect.left,
                top: rect.top,
                width: rect.width,
                height: rect.height,
              });
              setIsCreateModalOpen(true);
            }}
            onNavigateLive={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            onLogout={() => {
              logout();
              onBack();
            }}
          />

          <CreatePollModal
            isOpen={isCreateModalOpen}
            originRect={createOriginRect}
            onClose={() => setIsCreateModalOpen(false)}
            onPollCreated={(newPoll) => {
              if (onNavigateToPoll) {
                onNavigateToPoll(newPoll.id);
              } else {
                onBack();
              }
            }}
          />
        </>
      )}
    </div>
  );
};
