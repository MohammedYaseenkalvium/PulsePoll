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
  Trophy,
  Info,
  BarChart3,
  Radio,
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
  const [statusNotice, setStatusNotice] = useState<{
    type: 'duplicate' | 'closed';
    title: string;
    message: string;
  } | null>(null);
  const [hasVoted, setHasVoted] = useState(false);

  // Real-time results state
  const [optionCounts, setOptionCounts] = useState<Record<string, number>>({});
  const [totalVotes, setTotalVotes] = useState(0);
  const [sseState, setSseState] = useState<'connecting' | 'connected' | 'reconnecting'>('connecting');

  // Toast / Copy state
  const [copiedLink, setCopiedLink] = useState(false);

  // Refs for GSAP animations
  const checkmarkContainerRef = useRef<HTMLDivElement>(null);
  const checkmarkIconRef = useRef<SVGSVGElement>(null);
  const resultsContainerRef = useRef<HTMLDivElement>(null);
  const resultsListRef = useRef<HTMLDivElement>(null);
  const optionsListRef = useRef<HTMLDivElement>(null);
  const barsRef = useRef<Record<string, HTMLDivElement | null>>({});
  const optionFillRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const pctRefs = useRef<Record<string, HTMLSpanElement | null>>({});
  const countRefs = useRef<Record<string, HTMLSpanElement | null>>({});
  const totalVotesRef = useRef<HTMLSpanElement>(null);
  const prevCountsRef = useRef<Record<string, number>>({});

  // 1. Fetch Poll by shareSlug
  const fetchPoll = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await api.getPollBySlug(shareSlug);
      setPoll(data);

      const counts: Record<string, number> = {};
      let total = 0;
      data.options.forEach((opt) => {
        counts[opt.id] = opt.voteCount || 0;
        total += opt.voteCount || 0;
      });
      setOptionCounts(counts);
      setTotalVotes(total);
      prevCountsRef.current = { ...counts };

      if (localStorage.getItem(`pulsepoll_voted_${data.id}`) === 'true') {
        setHasVoted(true);
      } else if (data.status === 'closed') {
        setStatusNotice({
          type: 'closed',
          title: 'Voting has closed',
          message: 'This poll is no longer accepting responses. View the final results below.',
        });
      }
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setLoadError(err.message);
      } else {
        setLoadError('Failed to load poll. Check the link or connection.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [shareSlug]);

  useEffect(() => {
    fetchPoll();
  }, [fetchPoll]);

  // Fast entrance stagger for voting options on load (240ms)
  useEffect(() => {
    if (!isLoading && !hasVoted && poll && optionsListRef.current) {
      const ctx = gsap.context(() => {
        const mm = gsap.matchMedia();
        mm.add('(prefers-reduced-motion: no-preference)', () => {
          gsap.fromTo(
            optionsListRef.current!.children,
            { y: 8, opacity: 0 },
            {
              y: 0,
              opacity: 1,
              duration: 0.24,
              stagger: 0.04,
              ease: 'power3.out',
              clearProps: 'transform',
            }
          );
        });
      }, optionsListRef);
      return () => ctx.revert();
    }
  }, [isLoading, hasVoted, poll]);

  // Fast staggered reveal of live result bars when entering results view (280ms–320ms)
  useEffect(() => {
    if (hasVoted && poll && resultsListRef.current) {
      const ctx = gsap.context(() => {
        const mm = gsap.matchMedia();

        mm.add('(prefers-reduced-motion: reduce)', () => {
          poll.options.forEach((opt) => {
            const count = optionCounts[opt.id] ?? opt.voteCount ?? 0;
            const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
            const barEl = barsRef.current[opt.id];
            if (barEl) gsap.set(barEl, { width: `${pct}%` });
          });
        });

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

          poll.options.forEach((opt, index) => {
            const count = optionCounts[opt.id] ?? opt.voteCount ?? 0;
            const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
            const barEl = barsRef.current[opt.id];
            if (barEl) {
              gsap.fromTo(
                barEl,
                { width: '0%' },
                {
                  width: `${pct}%`,
                  duration: 0.32,
                  delay: index * 0.035,
                  ease: 'power2.out',
                }
              );
            }
          });
        });
      }, resultsListRef);

      return () => ctx.revert();
    }
  }, [hasVoted, poll?.id]);

  // 2. Connect to SSE stream once voted (or when viewing results)
  useEffect(() => {
    if (!hasVoted || !poll) return;

    const streamUrl = api.getStreamUrl(poll.id);
    let eventSource: EventSource | null = null;
    setSseState('connecting');

    try {
      eventSource = new EventSource(streamUrl);

      eventSource.onopen = () => {
        setSseState('connected');
      };

      eventSource.addEventListener('initial', (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.optionCounts) {
            updateCountsWithGSAP(data.optionCounts, data.totalVotes || 0);
          }
          if (data.status) {
            setPoll((prev) => (prev ? { ...prev, status: data.status } : null));
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
        setSseState('reconnecting');
      };
    } catch {
      setSseState('reconnecting');
    }

    return () => {
      eventSource?.close();
    };
  }, [hasVoted, poll?.id]);

  // Helper to animate bar widths and numbers smoothly with GSAP (300ms)
  const updateCountsWithGSAP = (newCounts: Record<string, number>, newTotal: number) => {
    const prevCounts = prevCountsRef.current;
    const isReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!isReduced && totalVotesRef.current && totalVotes !== newTotal) {
      const counterObj = { val: totalVotes };
      gsap.to(counterObj, {
        val: newTotal,
        duration: 0.3,
        ease: 'power2.out',
        onUpdate: () => {
          if (totalVotesRef.current) {
            totalVotesRef.current.textContent = `${Math.round(counterObj.val).toLocaleString()} votes`;
          }
        },
      });
    }

    Object.entries(newCounts).forEach(([optId, count]) => {
      const oldCount = prevCounts[optId] ?? count;
      const pct = newTotal > 0 ? Math.round((count / newTotal) * 100) : 0;
      const oldPct = totalVotes > 0 ? Math.round((oldCount / totalVotes) * 100) : 0;
      const barEl = barsRef.current[optId];
      const pctEl = pctRefs.current[optId];
      const countEl = countRefs.current[optId];

      if (isReduced) {
        if (barEl) gsap.set(barEl, { width: `${pct}%` });
        if (pctEl) pctEl.textContent = `${pct}%`;
        if (countEl) countEl.textContent = `(${count.toLocaleString()})`;
      } else {
        if (barEl) {
          gsap.to(barEl, {
            width: `${pct}%`,
            duration: 0.32,
            ease: 'power2.out',
          });
        }
        if (pctEl && oldPct !== pct) {
          const pObj = { val: oldPct };
          gsap.to(pObj, {
            val: pct,
            duration: 0.3,
            ease: 'power2.out',
            onUpdate: () => {
              if (pctEl) pctEl.textContent = `${Math.round(pObj.val)}%`;
            },
          });
        }
        if (countEl && oldCount !== count) {
          const cObj = { val: oldCount };
          gsap.to(cObj, {
            val: count,
            duration: 0.3,
            ease: 'power2.out',
            onUpdate: () => {
              if (countEl) countEl.textContent = `(${Math.round(cObj.val).toLocaleString()})`;
            },
          });
        }
      }
    });

    prevCountsRef.current = { ...newCounts };
    setOptionCounts(newCounts);
    setTotalVotes(newTotal);
  };

  // Tactile 160ms scale press & 220ms bar-fill sweep on option selection (zero click delay)
  const handleSelectOption = (e: React.MouseEvent<HTMLButtonElement>, optId: string) => {
    if (isSubmitting || poll?.status !== 'open') return;

    const btn = e.currentTarget;
    const fillEl = optionFillRefs.current[optId];
    const willBeSelected = poll.allowMultiple
      ? !selectedOptionIds.includes(optId)
      : true;

    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      gsap.fromTo(
        btn,
        { scale: 0.97 },
        {
          scale: 1,
          duration: 0.36,
          ease: 'elastic.out(1.1, 0.45)',
          overwrite: 'auto',
        }
      );

      if (fillEl) {
        gsap.fromTo(
          fillEl,
          { width: willBeSelected ? '0%' : '100%', opacity: willBeSelected ? 1 : 0.4 },
          {
            width: willBeSelected ? '100%' : '0%',
            opacity: willBeSelected ? 1 : 0,
            duration: 0.24,
            ease: 'power2.out',
          }
        );
      }
    }

    if (poll.allowMultiple) {
      if (selectedOptionIds.includes(optId)) {
        setSelectedOptionIds(selectedOptionIds.filter((id) => id !== optId));
      } else {
        setSelectedOptionIds([...selectedOptionIds, optId]);
      }
    } else {
      selectedOptionIds.forEach((prevId) => {
        if (prevId !== optId && optionFillRefs.current[prevId]) {
          gsap.to(optionFillRefs.current[prevId], { width: '0%', opacity: 0, duration: 0.16 });
        }
      });
      setSelectedOptionIds([optId]);
    }
    setSubmitError(null);
    setStatusNotice(null);
  };

  // Submit vote with strict backend gating & immediate transition on 200 OK
  const handleSubmitVote = async () => {
    if (!poll || selectedOptionIds.length === 0 || isSubmitting) return;

    setIsSubmitting(true);
    setSubmitError(null);
    setStatusNotice(null);

    const fingerprint = getVoterFingerprint();

    try {
      const res = await api.castVote(poll.id, {
        optionIds: selectedOptionIds,
        voterFingerprint: fingerprint,
      });

      const isReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      localStorage.setItem(`pulsepoll_voted_${poll.id}`, 'true');
      prevCountsRef.current = { ...res.optionCounts };
      setOptionCounts(res.optionCounts);
      setTotalVotes(res.totalVotes);
      setHasVoted(true);

      // Fast 240ms checkmark confirmation animation
      requestAnimationFrame(() => {
        if (!isReduced && checkmarkContainerRef.current && checkmarkIconRef.current) {
          gsap.fromTo(
            checkmarkContainerRef.current,
            { opacity: 0, y: 6 },
            { opacity: 1, y: 0, duration: 0.22, ease: 'power2.out' }
          );
          gsap.fromTo(
            checkmarkIconRef.current,
            { scale: 0.6, opacity: 0 },
            { scale: 1, opacity: 1, duration: 0.24, ease: 'power2.out' }
          );
        }
      });
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === 409 || err.message.toLowerCase().includes('already')) {
          localStorage.setItem(`pulsepoll_voted_${poll.id}`, 'true');
          setStatusNotice({
            type: 'duplicate',
            title: 'Vote already recorded',
            message:
              'Your response on this poll has already been counted. Switch to live results to watch the current tally.',
          });
        } else if (err.status === 403 || err.message.toLowerCase().includes('closed')) {
          setPoll((prev) => (prev ? { ...prev, status: 'closed' } : null));
          setStatusNotice({
            type: 'closed',
            title: 'Poll closed to new votes',
            message:
              'Voting has ended for this session. Switch to results to inspect the final tally.',
          });
        } else {
          setSubmitError(err.message);
        }
      } else if (err instanceof Error) {
        setSubmitError(err.message);
      } else {
        setSubmitError('Failed to record vote. Check your network connection.');
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
        <div className="flex flex-col items-center gap-2.5 text-content-secondary">
          <Loader2 className="w-6 h-6 animate-spin text-primary-500" aria-hidden="true" />
          <span className="text-xs font-medium">Loading poll...</span>
        </div>
      </div>
    );
  }

  // Render Not Found Error
  if (loadError || !poll) {
    return (
      <div className="min-h-screen bg-canvas text-content flex items-center justify-center p-4">
        <div className="w-full max-w-md p-6 rounded-2xl bg-surface border border-border-subtle text-center space-y-4">
          <div className="w-10 h-10 rounded-xl bg-error-50 dark:bg-error-950/40 text-error-600 dark:text-error-400 flex items-center justify-center mx-auto">
            <AlertCircle className="w-5 h-5" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-content">Poll not found</h2>
            <p className="text-xs text-content-secondary leading-relaxed">
              {loadError || 'This poll link does not exist or has been removed'}
            </p>
          </div>
          {onNavigateHome && (
            <button
              type="button"
              onClick={onNavigateHome}
              className="px-4 py-2 rounded-lg bg-primary-600 text-white text-xs font-medium hover:bg-primary-700 transition-colors cursor-pointer"
            >
              Back to workspace
            </button>
          )}
        </div>
      </div>
    );
  }

  const isOpen = poll.status === 'open';
  const highestCount = Math.max(
    0,
    ...poll.options.map((opt) => optionCounts[opt.id] ?? opt.voteCount ?? 0)
  );

  return (
    <div className="min-h-screen bg-canvas text-content flex flex-col justify-between p-4 sm:p-6 transition-colors duration-200">
      {/* Top Header */}
      <header className="w-full max-w-md mx-auto flex items-center justify-between pb-6 pt-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary-600 text-white flex items-center justify-center">
            <Activity className="w-4 h-4" aria-hidden="true" />
          </div>
          <span className="font-semibold text-sm tracking-tight text-content">PulsePoll</span>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Live SSE Connection & Poll Status Pill */}
          {hasVoted ? (
            <span
              role="status"
              aria-atomic="true"
              className={`text-xs px-2.5 py-1 rounded-full font-medium inline-flex items-center gap-1.5 transition-colors ${
                sseState === 'connected'
                  ? 'bg-success-50 dark:bg-success-950/50 text-success-700 dark:text-success-300 border border-success-200 dark:border-success-800'
                  : 'bg-warning-50 dark:bg-warning-950/50 text-warning-700 dark:text-warning-300 border border-warning-200 dark:border-warning-800'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  sseState === 'connected'
                    ? 'bg-success-500 animate-pulse'
                    : 'bg-warning-500 animate-pulse'
                }`}
              />
              <span>{sseState === 'connected' ? 'LIVE' : 'Reconnecting'}</span>
            </span>
          ) : (
            <span
              className={`text-xs px-2.5 py-1 rounded-full font-medium inline-flex items-center gap-1.5 ${
                isOpen
                  ? 'bg-success-50 dark:bg-success-950/40 text-success-700 dark:text-success-400 border border-success-200 dark:border-success-800'
                  : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 border border-border-subtle'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isOpen ? 'bg-success-500 animate-pulse' : 'bg-neutral-400'
                }`}
              />
              <span>{isOpen ? 'LIVE' : 'Closed'}</span>
            </span>
          )}

          <ThemeToggle size={18} />
        </div>
      </header>

      {/* Main Distraction-Free Mobile-First Container (max-w-md mx-auto) */}
      <main className="w-full max-w-md mx-auto my-auto space-y-6">
        {/* Poll Card Container */}
        <div className="p-6 rounded-2xl bg-surface border border-border-subtle shadow-sm space-y-5">
          {/* Question & Description */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-content-secondary">
              <span className="font-medium text-content-muted">
                {poll.allowMultiple ? 'Multiple choice' : 'Single choice'}
              </span>
              <span ref={totalVotesRef} className="font-mono tabular-nums">
                {totalVotes.toLocaleString()} votes
              </span>
            </div>

            <h1 className="text-xl sm:text-2xl font-semibold text-content leading-snug">
              {poll.question}
            </h1>

            {poll.description && (
              <p className="text-xs text-content-secondary leading-relaxed pt-0.5">
                {poll.description}
              </p>
            )}
          </div>

          {/* Calm --neutral / --warning Informational Status Card (Duplicate Vote or Closed Poll) */}
          {statusNotice && !hasVoted && (
            <div
              role="status"
              aria-atomic="true"
              className={`p-4 rounded-xl border flex flex-col gap-3 text-xs ${
                statusNotice.type === 'duplicate'
                  ? 'bg-warning-50/70 dark:bg-warning-950/35 border-warning-200 dark:border-warning-800/80'
                  : 'bg-surface-elevated border-border-subtle'
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    statusNotice.type === 'duplicate'
                      ? 'bg-warning-100 dark:bg-warning-900/60 text-warning-700 dark:text-warning-300 border border-warning-200 dark:border-warning-800'
                      : 'bg-neutral-100 dark:bg-neutral-800 text-content-secondary border border-border-subtle'
                  }`}
                >
                  {statusNotice.type === 'duplicate' ? (
                    <Info className="w-4 h-4" aria-hidden="true" />
                  ) : (
                    <Lock className="w-4 h-4" aria-hidden="true" />
                  )}
                </div>
                <div className="space-y-0.5 flex-1">
                  <span className="font-semibold text-content text-xs block">
                    {statusNotice.title}
                  </span>
                  <p className="text-content-secondary leading-relaxed text-xs">
                    {statusNotice.message}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setHasVoted(true)}
                className="w-full py-2 px-4 rounded-lg bg-surface hover:bg-surface-elevated border border-border-strong text-content font-medium text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <BarChart3 className="w-3.5 h-3.5 text-primary-600 dark:text-primary-400" aria-hidden="true" />
                <span>View {isOpen ? 'live results' : 'final results'}</span>
              </button>
            </div>
          )}

          {/* Genuine Validation / Network Error Alert */}
          {submitError && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-error-50 dark:bg-error-950/40 border border-error-200 dark:border-error-800 flex items-start gap-2.5 text-xs text-error-600 dark:text-error-400"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <div className="space-y-0.5">
                <span className="font-semibold">Unable to submit vote</span>
                <p className="leading-relaxed">{submitError}</p>
              </div>
            </div>
          )}

          {/* VIEW A: Active Voting Form (Before Confirmation) */}
          {!hasVoted ? (
            <div className="space-y-4">
              {/* Poll Options with Tactile GSAP Feedback & Animated Bar-Fill */}
              <div ref={optionsListRef} className="space-y-2">
                {poll.options.map((opt) => {
                  const isSelected = selectedOptionIds.includes(opt.id);

                  return (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={isSubmitting || !isOpen}
                      aria-pressed={isSelected}
                      onClick={(e) => handleSelectOption(e, opt.id)}
                      className={`group relative overflow-hidden w-full p-3.5 rounded-xl border text-left flex items-center justify-between transition-colors duration-150 cursor-pointer ${
                        isSelected
                          ? 'bg-primary-50/70 dark:bg-primary-900/35 border-primary-500 text-primary-900 dark:text-primary-100'
                          : 'bg-surface border-border-subtle hover:border-border-strong text-content hover:bg-surface-elevated/40'
                      } ${!isOpen ? 'opacity-60 cursor-not-allowed' : ''} ${
                        isSubmitting ? 'pointer-events-none' : ''
                      }`}
                    >
                      {/* Animated Bar-Fill Confirmation Layer */}
                      <div
                        ref={(el) => {
                          optionFillRefs.current[opt.id] = el;
                        }}
                        style={{ width: isSelected ? '100%' : '0%', opacity: isSelected ? 1 : 0 }}
                        className="absolute inset-y-0 left-0 bg-primary-500/10 dark:bg-primary-500/20 pointer-events-none"
                      />

                      <div className="relative z-10 flex items-center gap-3 pr-2">
                        <div
                          className={`w-4 h-4 rounded-full flex items-center justify-center border transition-colors shrink-0 ${
                            isSelected
                              ? 'bg-primary-600 border-primary-600 text-white'
                              : 'border-border-strong bg-surface group-hover:border-primary-400'
                          }`}
                        >
                          {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" aria-hidden="true" />}
                        </div>
                        <span className="font-medium text-sm leading-snug">{opt.text}</span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Submit Vote Button & Pending Warning Indicator */}
              {isOpen && (
                <div className="pt-1">
                  <button
                    type="button"
                    disabled={selectedOptionIds.length === 0 || isSubmitting}
                    onClick={handleSubmitVote}
                    className={`w-full py-3 px-5 rounded-xl text-xs font-medium transition-colors duration-150 flex items-center justify-center gap-2 cursor-pointer ${
                      isSubmitting
                        ? 'bg-warning-500 text-neutral-900'
                        : 'bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover)] text-white disabled:opacity-40 disabled:cursor-not-allowed'
                    }`}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-neutral-900" aria-hidden="true" />
                        <span>Submitting vote...</span>
                      </>
                    ) : (
                      <>
                        <span>Submit vote</span>
                        <ArrowRight className="w-4 h-4" aria-hidden="true" />
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* VIEW B: Live Post-Vote Results Stream */
            <div ref={resultsContainerRef} className="space-y-5">
              {/* Calm Status Banner: Confirmed Vote or Closed Final Summary */}
              {isOpen ? (
                <div
                  ref={checkmarkContainerRef}
                  className="p-3.5 rounded-xl bg-success-50 dark:bg-success-950/40 border border-success-200 dark:border-success-800 flex items-center gap-3 text-success-700 dark:text-success-400"
                >
                  <div className="w-8 h-8 rounded-full bg-success-600 text-white flex items-center justify-center shrink-0">
                    <CheckCircle2 ref={checkmarkIconRef} className="w-4 h-4 stroke-[2.5]" aria-hidden="true" />
                  </div>
                  <div className="space-y-0.5">
                    <span className="font-semibold text-xs block">Vote recorded</span>
                    <p className="text-xs text-content-secondary">
                      Live results update automatically as votes come in
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-3.5 rounded-xl bg-surface-elevated border border-border-subtle flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary-50 dark:bg-primary-950/60 text-primary-600 dark:text-primary-300 border border-primary-200 dark:border-primary-800 flex items-center justify-center shrink-0">
                    <Trophy className="w-4 h-4" aria-hidden="true" />
                  </div>
                  <div className="space-y-0.5">
                    <span className="font-semibold text-xs text-content block">
                      Final results
                    </span>
                    <p className="text-xs text-content-secondary">
                      Voting has closed for this poll
                    </p>
                  </div>
                </div>
              )}

              {/* Real-Time Results Bars with Winner / Leading Spotlight */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-content">
                    {isOpen ? 'Live results' : 'Final results'}
                  </span>
                  <span className="inline-flex items-center gap-1.5 font-mono text-xs text-content-secondary">
                    <Radio
                      className={`w-3 h-3 ${
                        sseState === 'connected' ? 'text-success-500' : 'text-warning-500'
                      }`}
                      aria-hidden="true"
                    />
                    <span>
                      {sseState === 'connected' ? 'SSE live' : 'Reconnecting'}
                    </span>
                  </span>
                </div>

                <div ref={resultsListRef} className="space-y-2.5">
                  {poll.options.map((opt) => {
                    const count = optionCounts[opt.id] ?? opt.voteCount ?? 0;
                    const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
                    const isMyChoice = selectedOptionIds.includes(opt.id);
                    const isLeading = count > 0 && count === highestCount;
                    const isFinalWinner = !isOpen && isLeading;

                    return (
                      <div
                        key={opt.id}
                        className={`relative p-3.5 rounded-xl border transition-colors overflow-hidden ${
                          isLeading
                            ? 'bg-primary-50/45 dark:bg-primary-950/30 border-primary-400 dark:border-primary-700'
                            : isMyChoice
                            ? 'bg-surface-elevated/60 border-primary-200 dark:border-primary-800/70'
                            : 'bg-surface-elevated/35 border-border-subtle'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs mb-2 gap-2">
                          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                            <span className="font-medium text-content leading-snug">{opt.text}</span>
                            {isMyChoice && (
                              <span className="text-[11px] px-1.5 py-0.5 rounded bg-surface border border-border-strong text-content font-medium">
                                Your vote
                              </span>
                            )}
                            {isLeading && (
                              <span
                                className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium ${
                                  isFinalWinner
                                    ? 'bg-primary-600 text-white'
                                    : 'bg-primary-100 dark:bg-primary-900/70 text-primary-700 dark:text-primary-300'
                                }`}
                              >
                                <Trophy className="w-2.5 h-2.5" aria-hidden="true" />
                                <span>{isFinalWinner ? 'Winner' : 'Leading'}</span>
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 font-mono tabular-nums font-semibold shrink-0">
                            <span
                              ref={(el) => {
                                pctRefs.current[opt.id] = el;
                              }}
                              className={
                                isLeading
                                  ? 'text-primary-600 dark:text-primary-400'
                                  : 'text-content'
                              }
                            >
                              {pct}%
                            </span>
                            <span
                              ref={(el) => {
                                countRefs.current[opt.id] = el;
                              }}
                              className="text-content-muted font-normal text-xs"
                            >
                              ({count.toLocaleString()})
                            </span>
                          </div>
                        </div>

                        <div className="w-full h-2 rounded-full bg-surface-elevated overflow-hidden">
                          <div
                            ref={(el) => {
                              barsRef.current[opt.id] = el;
                            }}
                            className={`h-full rounded-full ${
                              isLeading
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
              <div className="pt-1 flex items-center justify-between gap-2.5">
                <button
                  type="button"
                  onClick={copyShareLink}
                  className={`flex-1 py-2 px-4 rounded-lg border text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    copiedLink
                      ? 'border-success-300 dark:border-success-800 bg-success-50 dark:bg-success-950/50 text-success-700 dark:text-success-300'
                      : 'border-border-subtle hover:bg-surface-elevated text-content'
                  }`}
                >
                  {copiedLink ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-success-600" aria-hidden="true" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" aria-hidden="true" />
                      <span>Copy poll link</span>
                    </>
                  )}
                </button>

                {onNavigateHome && (
                  <button
                    type="button"
                    onClick={onNavigateHome}
                    className="py-2 px-4 rounded-lg border border-border-subtle hover:bg-surface-elevated text-xs font-medium text-content-secondary hover:text-content transition-colors cursor-pointer"
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
      <footer className="w-full max-w-md mx-auto text-center py-4 text-xs text-content-muted">
        PulsePoll
      </footer>
    </div>
  );
};
