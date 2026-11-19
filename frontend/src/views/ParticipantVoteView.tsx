import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api, type Poll, ApiError } from '../lib/api';
import { ThemeToggle } from '../motion/ThemeToggle';
import gsap from 'gsap';
import {
  Activity,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  Check,
  Copy,
  Lock,
} from 'lucide-react';

interface ParticipantVoteViewProps {
  shareSlug: string;
  onNavigateHome?: () => void;
}

const getVoterFingerprint = (): string => {
  if (typeof window === 'undefined') return 'anonymous_voter';
  let fp = localStorage.getItem('pulsepoll_voter_fp');
  if (!fp) {
    fp = 'vfp_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now().toString(36);
    localStorage.setItem('pulsepoll_voter_fp', fp);
  }
  return fp;
};

export const ParticipantVoteView: React.FC<ParticipantVoteViewProps> = ({
  shareSlug,
  onNavigateHome,
}) => {
  const [poll, setPoll] = useState<Poll | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Voting interaction state
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [hasVoted, setHasVoted] = useState(false);

  // Real-time results state
  const [optionCounts, setOptionCounts] = useState<Record<string, number>>({});
  const [totalVotes, setTotalVotes] = useState(0);
  const [isSseConnected, setIsSseConnected] = useState(false);

  // Toast / Copy state
  const [copiedLink, setCopiedLink] = useState(false);

  // Refs for GSAP animations
  const checkmarkContainerRef = useRef<HTMLDivElement>(null);
  const checkmarkIconRef = useRef<SVGSVGElement>(null);
  const resultsContainerRef = useRef<HTMLDivElement>(null);
  const barsRef = useRef<Record<string, HTMLDivElement | null>>({});

  // 1. Fetch Poll by shareSlug
  const fetchPoll = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await api.getPollBySlug(shareSlug);
      setPoll(data);

      // Hydrate counts
      const counts: Record<string, number> = {};
      let total = 0;
      data.options.forEach((opt) => {
        counts[opt.id] = opt.voteCount || 0;
        total += opt.voteCount || 0;
      });
      setOptionCounts(counts);
      setTotalVotes(total);

      // Check if already voted locally
      if (localStorage.getItem(`pulsepoll_voted_${data.id}`) === 'true') {
        setHasVoted(true);
      }
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setLoadError(err.message);
      } else {
        setLoadError('Failed to load poll. Please check the URL or connection.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [shareSlug]);

  useEffect(() => {
    fetchPoll();
  }, [fetchPoll]);

  // 2. Connect to SSE stream once voted
  useEffect(() => {
    if (!hasVoted || !poll) return;

    const streamUrl = api.getStreamUrl(poll.id);
    let eventSource: EventSource | null = null;

    try {
      eventSource = new EventSource(streamUrl);

      eventSource.onopen = () => {
        setIsSseConnected(true);
      };

      eventSource.addEventListener('initial', (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.optionCounts) {
            updateCountsWithGSAP(data.optionCounts, data.totalVotes || 0);
          }
        } catch {}
      });

      eventSource.addEventListener('vote_update', (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.optionCounts) {
            updateCountsWithGSAP(data.optionCounts, data.totalVotes || 0);
          }
        } catch {}
      });

      eventSource.addEventListener('status_change', (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.status) {
            setPoll((prev) => (prev ? { ...prev, status: data.status } : null));
          }
        } catch {}
      });

      eventSource.onerror = () => {
        setIsSseConnected(false);
      };
    } catch {
      setIsSseConnected(false);
    }

    return () => {
      eventSource?.close();
      setIsSseConnected(false);
    };
  }, [hasVoted, poll?.id]);

  // Helper to animate bar widths smoothly with GSAP
  const updateCountsWithGSAP = (newCounts: Record<string, number>, newTotal: number) => {
    setOptionCounts(newCounts);
    setTotalVotes(newTotal);

    if (newTotal <= 0) return;

    Object.entries(newCounts).forEach(([optId, count]) => {
      const barEl = barsRef.current[optId];
      if (barEl) {
        const pct = Math.round((count / newTotal) * 100);
        gsap.to(barEl, {
          width: `${pct}%`,
          duration: 0.6,
          ease: 'power2.out',
        });
      }
    });
  };

  // Tactile press on option selection
  const handleSelectOption = (e: React.MouseEvent<HTMLButtonElement>, optId: string) => {
    if (isSubmitting || poll?.status !== 'open') return;

    // Tactile GSAP press animation (scale: 0.985)
    gsap.to(e.currentTarget, {
      scale: 0.985,
      duration: 0.08,
      yoyo: true,
      repeat: 1,
      ease: 'power2.inOut',
    });

    if (poll.allowMultiple) {
      if (selectedOptionIds.includes(optId)) {
        setSelectedOptionIds(selectedOptionIds.filter((id) => id !== optId));
      } else {
        setSelectedOptionIds([...selectedOptionIds, optId]);
      }
    } else {
      setSelectedOptionIds([optId]);
    }
    setSubmitError(null);
  };

  // Submit vote with strict backend gating
  const handleSubmitVote = async () => {
    if (!poll || selectedOptionIds.length === 0 || isSubmitting) return;

    setIsSubmitting(true);
    setSubmitError(null);

    const fingerprint = getVoterFingerprint();

    try {
      const res = await api.castVote(poll.id, {
        optionIds: selectedOptionIds,
        voterFingerprint: fingerprint,
      });

      // API confirmed 200 OK!
      localStorage.setItem(`pulsepoll_voted_${poll.id}`, 'true');
      setOptionCounts(res.optionCounts);
      setTotalVotes(res.totalVotes);
      setHasVoted(true);

      // Play crisp GSAP checkmark confirmation animation (success-700)
      requestAnimationFrame(() => {
        if (checkmarkContainerRef.current && checkmarkIconRef.current) {
          const tl = gsap.timeline();
          tl.fromTo(
            checkmarkContainerRef.current,
            { scale: 0.5, opacity: 0 },
            { scale: 1, opacity: 1, duration: 0.35, ease: 'back.out(2)' }
          ).fromTo(
            checkmarkIconRef.current,
            { scale: 0, rotation: -45 },
            { scale: 1, rotation: 0, duration: 0.3, ease: 'power3.out' },
            '-=0.15'
          );
        }
      });
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setSubmitError(err.message);
        if (err.status === 409) {
          // Already voted on server
          localStorage.setItem(`pulsepoll_voted_${poll.id}`, 'true');
        }
      } else if (err instanceof Error) {
        setSubmitError(err.message);
      } else {
        setSubmitError('Failed to record vote. Please check your network connection.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyShareLink = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // Render Skeleton / Loading
  if (isLoading) {
    return (
      <div className="min-h-screen bg-canvas text-content flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3 text-content-secondary">
          <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
          <span className="text-xs font-semibold">Connecting to live poll...</span>
        </div>
      </div>
    );
  }

  // Render Error
  if (loadError || !poll) {
    return (
      <div className="min-h-screen bg-canvas text-content flex items-center justify-center p-4">
        <div className="w-full max-w-md p-8 rounded-3xl bg-surface border border-border-subtle shadow-xl text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-error-50 dark:bg-error-950/40 text-error-600 dark:text-error-400 flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-content">Poll Not Found</h2>
            <p className="text-xs text-content-secondary leading-relaxed">
              {loadError || 'The requested poll link does not exist or may have been removed.'}
            </p>
          </div>
          {onNavigateHome && (
            <button
              type="button"
              onClick={onNavigateHome}
              className="px-5 py-2.5 rounded-xl bg-primary-600 text-white text-xs font-semibold shadow-sm hover:bg-primary-700 transition-all cursor-pointer"
            >
              Go to Workspace
            </button>
          )}
        </div>
      </div>
    );
  }

  const isOpen = poll.status === 'open';

  return (
    <div className="min-h-screen bg-canvas text-content flex flex-col justify-between p-4 sm:p-6 transition-colors duration-200">
      {/* Top Header */}
      <header className="w-full max-w-md mx-auto flex items-center justify-between pb-6 pt-2">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-primary-600 text-white flex items-center justify-center shadow-md">
            <Activity className="w-4 h-4" />
          </div>
          <span className="font-bold text-sm tracking-tight text-content">PulsePoll</span>
        </div>

        <div className="flex items-center gap-3">
          {/* Live Status Pill */}
          <span
            className={`text-xs px-2.5 py-1 rounded-full font-semibold inline-flex items-center gap-1.5 ${
              isOpen
                ? 'bg-success-50 dark:bg-success-950/40 text-success-700 dark:text-success-400 border border-success-200 dark:border-success-800'
                : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 border border-border-subtle'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isOpen ? 'bg-success-500 animate-pulse' : 'bg-neutral-400'
              }`}
            />
            <span>{isOpen ? 'Live' : 'Closed'}</span>
          </span>

          <ThemeToggle size={18} />
        </div>
      </header>

      {/* Main Distraction-Free Mobile-First Container (max-w-md mx-auto) */}
      <main className="w-full max-w-md mx-auto my-auto space-y-6">
        {/* Poll Card Container */}
        <div className="p-6 sm:p-7 rounded-3xl bg-surface border border-border-subtle shadow-xl space-y-6">
          {/* Question & Description */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-content-secondary">
              <span className="font-semibold text-primary-500 uppercase tracking-wider text-[11px]">
                {poll.allowMultiple ? 'Multiple Choice' : 'Single Choice'}
              </span>
              <span className="font-mono">{totalVotes} votes recorded</span>
            </div>

            <h1 className="text-xl sm:text-2xl font-extrabold text-content leading-tight">
              {poll.question}
            </h1>

            {poll.description && (
              <p className="text-xs text-content-secondary leading-relaxed pt-1">
                {poll.description}
              </p>
            )}
          </div>

          {/* Inline Error Alert */}
          {submitError && (
            <div className="p-3.5 rounded-2xl bg-error-50 dark:bg-error-950/40 border border-error-200 dark:border-error-800 flex items-start gap-2.5 text-xs text-error-600 dark:text-error-400 animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-semibold">Submission Rejected</span>
                <p className="leading-relaxed">{submitError}</p>
                {submitError.includes('already cast') && (
                  <button
                    type="button"
                    onClick={() => setHasVoted(true)}
                    className="mt-1 text-primary-600 dark:text-primary-400 font-bold underline cursor-pointer"
                  >
                    View live results
                  </button>
                )}
              </div>
            </div>
          )}

          {/* VIEW A: Active Voting Form (Before Confirmation) */}
          {!hasVoted ? (
            <div className="space-y-4">
              {/* Poll Options */}
              <div className="space-y-2.5">
                {poll.options.map((opt) => {
                  const isSelected = selectedOptionIds.includes(opt.id);

                  return (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={isSubmitting || !isOpen}
                      onClick={(e) => handleSelectOption(e, opt.id)}
                      className={`w-full p-4 rounded-2xl border text-left flex items-center justify-between transition-all duration-150 cursor-pointer ${
                        isSelected
                          ? 'bg-primary-50 dark:bg-primary-900/40 border-primary-500 text-primary-900 dark:text-primary-100 shadow-sm ring-1 ring-primary-500/20'
                          : 'bg-surface border-border-subtle hover:border-border-strong text-content hover:bg-surface-elevated/40'
                      } ${!isOpen ? 'opacity-60 cursor-not-allowed' : ''} ${
                        isSubmitting ? 'pointer-events-none' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3 pr-2">
                        <div
                          className={`w-5 h-5 rounded-full flex items-center justify-center border transition-all ${
                            isSelected
                              ? 'bg-primary-600 border-primary-600 text-white'
                              : 'border-border-strong bg-surface'
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                        <span className="font-semibold text-sm leading-snug">{opt.text}</span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Submit Vote Button & Pending Warning Indicator */}
              <div className="pt-2">
                {!isOpen ? (
                  <div className="p-3.5 rounded-2xl bg-neutral-100 dark:bg-neutral-800/60 text-center text-xs font-semibold text-content-secondary flex items-center justify-center gap-2">
                    <Lock className="w-4 h-4 text-content-muted" />
                    <span>This poll is closed. Voting is currently disabled.</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={selectedOptionIds.length === 0 || isSubmitting}
                    onClick={handleSubmitVote}
                    className={`w-full py-3.5 px-5 rounded-2xl text-xs font-bold transition-all duration-150 flex items-center justify-center gap-2 shadow-sm cursor-pointer ${
                      isSubmitting
                        ? 'bg-warning-500 text-neutral-900 shadow-warning-500/20 animate-pulse'
                        : 'bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover)] text-white active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed'
                    }`}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-neutral-900" />
                        <span>Recording vote in Redis...</span>
                      </>
                    ) : (
                      <>
                        <span>Submit Vote</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          ) : (
            /* VIEW B: Live Post-Vote Results Stream */
            <div ref={resultsContainerRef} className="space-y-6 animate-in fade-in duration-300">
              {/* Crisp GSAP Checkmark Confirmation (success-700) */}
              <div
                ref={checkmarkContainerRef}
                className="p-4 rounded-2xl bg-success-50 dark:bg-success-950/40 border border-success-200 dark:border-success-800 flex items-center gap-3 text-success-700 dark:text-success-400"
              >
                <div className="w-9 h-9 rounded-full bg-success-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                  <CheckCircle2 ref={checkmarkIconRef} className="w-5 h-5 stroke-[2.5]" />
                </div>
                <div className="space-y-0.5">
                  <span className="font-extrabold text-xs">Vote Confirmed by Redis</span>
                  <p className="text-[11px] text-content-secondary">
                    Your choice has been atomically counted. Below are live stream results.
                  </p>
                </div>
              </div>

              {/* Real-Time Results Bars */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-content uppercase tracking-wider text-[11px]">
                    Live Results
                  </span>
                  <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-content-secondary">
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isSseConnected ? 'bg-success-500 animate-pulse' : 'bg-neutral-400'
                      }`}
                    />
                    <span>{isSseConnected ? 'SSE Stream Live' : 'Polling'}</span>
                  </span>
                </div>

                <div className="space-y-3">
                  {poll.options.map((opt) => {
                    const count = optionCounts[opt.id] ?? opt.voteCount ?? 0;
                    const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
                    const isMyChoice = selectedOptionIds.includes(opt.id);

                    return (
                      <div
                        key={opt.id}
                        className={`p-3.5 rounded-2xl border transition-all ${
                          isMyChoice
                            ? 'bg-primary-50/50 dark:bg-primary-950/30 border-primary-300 dark:border-primary-800'
                            : 'bg-surface-elevated/40 border-border-subtle'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-content leading-snug">{opt.text}</span>
                            {isMyChoice && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-primary-600 text-white font-bold">
                                You
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 font-mono tabular-nums font-bold">
                            <span className="text-primary-600 dark:text-primary-400">{pct}%</span>
                            <span className="text-content-muted font-normal text-[11px]">
                              ({count})
                            </span>
                          </div>
                        </div>

                        <div className="w-full h-2 rounded-full bg-surface-elevated overflow-hidden border border-border-subtle">
                          <div
                            ref={(el) => {
                              barsRef.current[opt.id] = el;
                            }}
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
              <div className="pt-2 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={copyShareLink}
                  className="flex-1 py-2.5 px-4 rounded-xl border border-border-subtle hover:bg-surface-elevated text-xs font-semibold text-content flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  {copiedLink ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-success-600" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Share Poll</span>
                    </>
                  )}
                </button>

                {onNavigateHome && (
                  <button
                    type="button"
                    onClick={onNavigateHome}
                    className="py-2.5 px-4 rounded-xl border border-border-subtle hover:bg-surface-elevated text-xs font-semibold text-content-secondary hover:text-content transition-colors cursor-pointer"
                  >
                    Workspace
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Mobile-Friendly Footer */}
      <footer className="w-full max-w-md mx-auto text-center py-4 text-[11px] text-content-muted">
        Powered by PulsePoll &bull; Real-time Redis event streaming
      </footer>
    </div>
  );
};
