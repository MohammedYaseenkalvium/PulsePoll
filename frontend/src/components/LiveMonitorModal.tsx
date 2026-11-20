import React, { useEffect, useState, useRef } from 'react';
import { api, type Poll } from '../lib/api';
import { useOriginTransition, type OriginRect } from '../motion/useOriginTransition';
import {
  X,
  Radio,
  CheckCircle2,
  Copy,
} from 'lucide-react';

interface LiveMonitorModalProps {
  poll: Poll | null;
  isOpen: boolean;
  onClose: () => void;
  originRect?: OriginRect | null;
}

interface StreamEventLog {
  id: string;
  time: string;
  text: string;
  type: 'vote' | 'status' | 'info';
}

export const LiveMonitorModal: React.FC<LiveMonitorModalProps> = ({
  poll,
  isOpen,
  onClose,
  originRect,
}) => {
  const [optionCounts, setOptionCounts] = useState<Record<string, number>>({});
  const [totalVotes, setTotalVotes] = useState<number>(0);
  const [status, setStatus] = useState<'open' | 'closed'>('open');
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [events, setEvents] = useState<StreamEventLog[]>([]);
  const [copied, setCopied] = useState(false);

  const modalRef = useRef<HTMLDivElement>(null);
  const { animateIn, animateOut } = useOriginTransition({
    durationIn: 0.25,
    durationOut: 0.18,
  });

  useEffect(() => {
    if (poll) {
      const initialCounts: Record<string, number> = {};
      let total = 0;
      poll.options.forEach((opt) => {
        initialCounts[opt.id] = opt.voteCount || 0;
        total += opt.voteCount || 0;
      });
      setOptionCounts(initialCounts);
      setTotalVotes(total);
      setStatus(poll.status);
      setEvents([
        {
          id: 'init-1',
          time: new Date().toLocaleTimeString(),
          text: `Monitoring "${poll.question}"`,
          type: 'info',
        },
      ]);
    }
  }, [poll]);

  useEffect(() => {
    if (isOpen && poll) {
      requestAnimationFrame(() => {
        if (modalRef.current) {
          animateIn(modalRef.current, originRect);
        }
      });
    }
  }, [isOpen, originRect, poll, animateIn]);

  useEffect(() => {
    if (!isOpen || !poll) return;

    const streamUrl = api.getStreamUrl(poll.id);
    let eventSource: EventSource | null = null;

    try {
      eventSource = new EventSource(streamUrl);

      eventSource.onopen = () => {
        setIsConnected(true);
        setEvents((prev) => [
          {
            id: `conn-${Date.now()}`,
            time: new Date().toLocaleTimeString(),
            text: 'SSE stream connected',
            type: 'info',
          },
          ...prev.slice(0, 30),
        ]);
      };

      eventSource.addEventListener('initial', (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.optionCounts) {
            setOptionCounts(data.optionCounts);
            setTotalVotes(data.totalVotes || 0);
          }
          if (data.status) {
            setStatus(data.status);
          }
        } catch {}
      });

      eventSource.addEventListener('vote_update', (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.optionCounts) {
            setOptionCounts(data.optionCounts);
            setTotalVotes(data.totalVotes || 0);
            setEvents((prev) => [
              {
                id: `vote-${Date.now()}`,
                time: new Date().toLocaleTimeString(),
                text: `Vote recorded · Total: ${data.totalVotes}`,
                type: 'vote',
              },
              ...prev.slice(0, 30),
            ]);
          }
        } catch {}
      });

      eventSource.addEventListener('status_change', (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.status) {
            setStatus(data.status);
            setEvents((prev) => [
              {
                id: `status-${Date.now()}`,
                time: new Date().toLocaleTimeString(),
                text: `Status changed to ${data.status}`,
                type: 'status',
              },
              ...prev.slice(0, 30),
            ]);
          }
        } catch {}
      });

      eventSource.onerror = () => {
        setIsConnected(false);
      };
    } catch {
      setIsConnected(false);
    }

    return () => {
      eventSource?.close();
      setIsConnected(false);
    };
  }, [isOpen, poll]);

  const handleClose = () => {
    if (modalRef.current) {
      animateOut(modalRef.current, originRect, () => {
        onClose();
      });
    } else {
      onClose();
    }
  };

  const copyShareLink = () => {
    if (!poll) return;
    const url = `${window.location.origin}/vote/${poll.shareSlug}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen || !poll) return null;

  const highestCount = Math.max(0, ...Object.values(optionCounts));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/60 backdrop-blur-xs"
      onClick={handleClose}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl rounded-2xl bg-surface border border-border-strong shadow-xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-border-subtle flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-primary-50 dark:bg-primary-950/50 text-primary-600 dark:text-primary-400 flex items-center justify-center shrink-0">
              <Radio className="w-4 h-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-content leading-tight">Live monitor</h2>
                <span
                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                    status === 'open'
                      ? 'bg-primary-50 dark:bg-primary-950/40 text-primary-600 dark:text-primary-300'
                      : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'
                  }`}
                >
                  {status}
                </span>
                <span
                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
                    isConnected
                      ? 'bg-success-50 dark:bg-success-950/40 text-success-700 dark:text-success-400'
                      : 'bg-warning-50 dark:bg-warning-950/40 text-warning-700 dark:text-warning-300'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isConnected ? 'bg-success-500 animate-pulse' : 'bg-warning-500 animate-pulse'
                    }`}
                  />
                  <span>{isConnected ? 'LIVE' : 'Reconnecting'}</span>
                </span>
              </div>
              <p className="text-xs text-content-secondary truncate">{poll.question}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={copyShareLink}
              className="px-3 py-1.5 rounded-lg border border-border-subtle hover:bg-surface-elevated text-xs font-medium text-content flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              {copied ? (
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
            <button
              type="button"
              onClick={handleClose}
              aria-label="Close live monitor"
              className="p-1.5 rounded-lg text-content-secondary hover:text-content hover:bg-surface-elevated transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 flex-1 overflow-y-auto space-y-5">
          {/* Total Votes KPI Card */}
          <div className="p-4 rounded-xl bg-surface-elevated border border-border-subtle flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-xs font-medium text-content-secondary">Total votes</span>
              <p className="text-xs text-content-muted font-mono">/vote/{poll.shareSlug}</p>
            </div>
            <div className="font-mono text-2xl font-semibold text-content tabular-nums">
              {totalVotes.toLocaleString()}
            </div>
          </div>

          {/* Real-Time Option Bars */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-content">Vote breakdown</h3>
              <span className="text-xs text-content-muted font-mono">
                {poll.options.length} options
              </span>
            </div>

            <div className="space-y-2.5">
              {poll.options.map((opt) => {
                const count = optionCounts[opt.id] ?? opt.voteCount ?? 0;
                const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
                const isLead = count > 0 && count === highestCount;

                return (
                  <div
                    key={opt.id}
                    className="p-3.5 rounded-xl bg-surface border border-border-subtle space-y-2"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-content">{opt.text}</span>
                      <div className="flex items-center gap-2 font-mono tabular-nums">
                        <span className="font-semibold text-content">{pct}%</span>
                        <span className="text-content-muted">({count.toLocaleString()})</span>
                      </div>
                    </div>

                    <div className="w-full h-2 rounded-full bg-surface-elevated overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-[width] duration-300 ease-out ${
                          isLead
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

          {/* Live Event Stream Log */}
          <div className="space-y-2 pt-2 border-t border-border-subtle">
            <div className="flex items-center justify-between text-xs font-medium text-content-secondary">
              <span>Activity log</span>
              <span className="text-xs text-content-muted font-mono tabular-nums">
                {events.length} events
              </span>
            </div>

            <div className="p-3 rounded-xl bg-surface-elevated font-mono text-xs space-y-1.5 max-h-36 overflow-y-auto border border-border-subtle">
              {events.map((ev) => (
                <div key={ev.id} className="flex items-start gap-2 text-content-secondary">
                  <span className="text-content-muted tabular-nums shrink-0">{ev.time}</span>
                  <span
                    className={
                      ev.type === 'vote'
                        ? 'text-primary-600 dark:text-primary-400 font-medium'
                        : ev.type === 'status'
                        ? 'text-warning-600 dark:text-warning-400 font-medium'
                        : 'text-content'
                    }
                  >
                    {ev.text}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-border-subtle bg-surface-elevated/40 flex items-center justify-end">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-1.5 rounded-lg border border-border-subtle hover:bg-surface text-xs text-content font-medium transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
