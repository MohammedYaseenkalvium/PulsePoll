import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { api, type Poll } from '../lib/api';
import { ThemeToggle } from '../motion/ThemeToggle';
import {
  Activity,
  Plus,
  LogOut,
  CheckCircle,
  Copy,
  Trash2,
  RefreshCw,
  BarChart3,
  Layers,
  Sparkles,
} from 'lucide-react';

export const DashboardView: React.FC = () => {
  const { user, logout } = useAuth();
  const [polls, setPolls] = useState<Poll[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // New poll modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [description, setDescription] = useState('');
  const [options, setOptions] = useState<string[]>(['Option 1', 'Option 2']);
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const fetchPolls = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await api.getMyPolls();
      setPolls(data);
    } catch {
      // Handle error gracefully
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPolls();
  }, [fetchPolls]);

  const handleAddOption = () => {
    if (options.length < 10) {
      setOptions([...options, `Option ${options.length + 1}`]);
    }
  };

  const handleRemoveOption = (index: number) => {
    if (options.length > 2) {
      setOptions(options.filter((_, i) => i !== index));
    }
  };

  const handleOptionChange = (index: number, val: string) => {
    const updated = [...options];
    updated[index] = val;
    setOptions(updated);
  };

  const handleCreatePoll = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    const trimmedQ = question.trim();
    if (!trimmedQ) {
      setCreateError('Question is required');
      return;
    }

    const trimmedOpts = options.map((o) => o.trim()).filter(Boolean);
    if (trimmedOpts.length < 2) {
      setCreateError('At least 2 non-empty options are required');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.createPoll({
        question: trimmedQ,
        description: description.trim(),
        options: trimmedOpts.map((text) => ({ text })),
        allowMultiple,
      });

      setIsModalOpen(false);
      setQuestion('');
      setDescription('');
      setOptions(['Option 1', 'Option 2']);
      setAllowMultiple(false);
      fetchPolls();
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create poll');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (pollId: string) => {
    try {
      await api.updatePollStatus(pollId);
      fetchPolls();
    } catch {
      // Error
    }
  };

  const handleDeletePoll = async (pollId: string) => {
    if (window.confirm('Are you sure you want to delete this poll?')) {
      try {
        await api.deletePoll(pollId);
        fetchPolls();
      } catch {
        // Error
      }
    }
  };

  const copyShareLink = (slug: string) => {
    const url = `${window.location.origin}/poll/${slug}`;
    navigator.clipboard.writeText(url);
    setCopiedId(slug);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="min-h-screen bg-canvas text-content flex flex-col transition-colors duration-200">
      {/* Top Navbar */}
      <header className="px-6 py-4 border-b border-border-subtle bg-surface/60 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary-600 text-white flex items-center justify-center shadow-md">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-base tracking-tight text-content">PulsePoll</span>
              <span className="hidden sm:inline-block ml-2 text-xs px-2 py-0.5 rounded-full bg-primary-50 dark:bg-primary-950/40 text-primary-600 dark:text-primary-300 font-medium">
                Creator Dashboard
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <div className="h-6 w-[1px] bg-border-subtle hidden sm:block" />
            <div className="hidden sm:flex items-center gap-2 text-xs text-content-secondary">
              <span className="font-semibold text-content">{user?.username}</span>
              <span className="text-content-muted">({user?.email})</span>
            </div>
            <button
              type="button"
              onClick={logout}
              title="Sign out"
              className="p-2 rounded-xl border border-border-subtle hover:bg-surface-elevated text-content-secondary hover:text-content transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-6 md:p-10 space-y-8">
        {/* Banner Section */}
        <section className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-6 rounded-2xl bg-surface border border-border-subtle shadow-sm">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-content">Real-Time Polls</h1>
            <p className="text-xs text-content-secondary">
              Manage your polls with sub-millisecond atomic Redis counts and instant live SSE streams.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={fetchPolls}
              className="p-2.5 rounded-xl border border-border-subtle bg-surface hover:bg-surface-elevated text-content-secondary hover:text-content transition-colors cursor-pointer"
              title="Refresh polls"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="px-4 py-2.5 rounded-xl bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover)] text-white text-xs font-semibold flex items-center gap-2 shadow-sm transition-all duration-150 active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>New Poll</span>
            </button>
          </div>
        </section>

        {/* Polls Listing */}
        {isLoading && polls.length === 0 ? (
          <div className="p-12 text-center text-content-muted text-sm rounded-2xl bg-surface border border-border-subtle flex flex-col items-center justify-center gap-3">
            <RefreshCw className="w-6 h-6 animate-spin text-primary-500" />
            <span>Fetching live poll metrics...</span>
          </div>
        ) : polls.length === 0 ? (
          <div className="p-16 text-center rounded-2xl bg-surface border border-border-subtle shadow-sm space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-surface-elevated text-content-muted flex items-center justify-center mx-auto">
              <Layers className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="font-bold text-base text-content">No polls created yet</h3>
              <p className="text-xs text-content-secondary max-w-sm mx-auto">
                Create your first real-time poll to begin collecting live votes with instant Server-Sent Events.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="px-5 py-2.5 rounded-xl bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover)] text-white text-xs font-semibold inline-flex items-center gap-2 shadow-sm transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Create Poll</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {polls.map((poll) => {
              const totalVotes = poll.options.reduce((sum, opt) => sum + (opt.voteCount || 0), 0);

              return (
                <div
                  key={poll.id}
                  className="p-6 rounded-2xl bg-surface border border-border-subtle shadow-sm space-y-5 flex flex-col justify-between hover:border-border-strong transition-colors"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-xs px-2.5 py-0.5 rounded-full font-medium flex items-center gap-1.5 ${
                          poll.status === 'open'
                            ? 'bg-success-50 text-success-700 dark:bg-success-950/40 dark:text-success-300'
                            : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            poll.status === 'open' ? 'bg-success-500 animate-pulse' : 'bg-neutral-400'
                          }`}
                        />
                        <span className="capitalize">{poll.status}</span>
                      </span>

                      <div className="flex items-center gap-1 text-xs text-content-secondary font-mono">
                        <BarChart3 className="w-3.5 h-3.5 text-primary-500" />
                        <span>{totalVotes} total votes</span>
                      </div>
                    </div>

                    <h3 className="font-bold text-base text-content leading-snug">{poll.question}</h3>
                    {poll.description && (
                      <p className="text-xs text-content-secondary line-clamp-2">{poll.description}</p>
                    )}

                    {/* Options Breakdown */}
                    <div className="space-y-2 pt-2">
                      {poll.options.map((opt) => {
                        const pct = totalVotes > 0 ? Math.round(((opt.voteCount || 0) / totalVotes) * 100) : 0;
                        return (
                          <div key={opt.id} className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span className="text-content font-medium truncate max-w-[70%]">{opt.text}</span>
                              <span className="text-content-secondary font-mono">
                                {pct}% ({opt.voteCount || 0})
                              </span>
                            </div>
                            <div className="w-full h-1.5 rounded-full bg-surface-elevated overflow-hidden">
                              <div
                                className="h-full bg-primary-500 rounded-full transition-all duration-500"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className="pt-4 border-t border-border-subtle flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => copyShareLink(poll.shareSlug)}
                      className="px-3 py-1.5 rounded-lg border border-border-subtle hover:bg-surface-elevated text-xs text-content-secondary hover:text-content flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      {copiedId === poll.shareSlug ? (
                        <>
                          <CheckCircle className="w-3.5 h-3.5 text-success-600 dark:text-success-400" />
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Share link</span>
                        </>
                      )}
                    </button>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(poll.id)}
                        className="px-3 py-1.5 rounded-lg border border-border-subtle hover:bg-surface-elevated text-xs text-content-secondary hover:text-content transition-colors cursor-pointer"
                        title={poll.status === 'open' ? 'Close poll' : 'Reopen poll'}
                      >
                        {poll.status === 'open' ? 'Close' : 'Reopen'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeletePoll(poll.id)}
                        className="p-1.5 rounded-lg border border-border-subtle hover:bg-error-50 dark:hover:bg-error-950/40 text-content-secondary hover:text-error-600 transition-colors cursor-pointer"
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

      {/* Create Poll Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/50 backdrop-blur-sm">
          <div className="w-full max-w-lg p-6 sm:p-8 rounded-3xl bg-surface border border-border-strong shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
              <div className="flex items-center gap-2 text-primary-500 font-bold text-base">
                <Sparkles className="w-5 h-5" />
                <span>Create New Poll</span>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-content-secondary hover:text-content text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            {createError && (
              <div className="p-3 rounded-xl bg-error-50 dark:bg-error-950/40 text-error-600 dark:text-error-400 text-xs border border-error-200 dark:border-error-800">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreatePoll} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-content-secondary">
                  Question
                </label>
                <input
                  type="text"
                  required
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="e.g. Which deployment target do you prefer?"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-border-subtle text-content text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-content-secondary">
                  Description (Optional)
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Additional context or guidelines for voters..."
                  className="w-full px-3.5 py-2 rounded-xl bg-surface border border-border-subtle text-content text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                />
              </div>

              {/* Options */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="block text-xs font-semibold text-content-secondary">
                    Options ({options.length}/10)
                  </label>
                  {options.length < 10 && (
                    <button
                      type="button"
                      onClick={handleAddOption}
                      className="text-xs text-primary-500 hover:text-primary-600 font-semibold cursor-pointer"
                    >
                      + Add Option
                    </button>
                  )}
                </div>

                <div className="space-y-2">
                  {options.map((opt, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        required
                        value={opt}
                        onChange={(e) => handleOptionChange(idx, e.target.value)}
                        placeholder={`Option ${idx + 1}`}
                        className="flex-1 px-3.5 py-2 rounded-xl bg-surface border border-border-subtle text-content text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                      {options.length > 2 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveOption(idx)}
                          className="p-2 text-content-muted hover:text-error-600 cursor-pointer"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Allow Multiple */}
              <div className="pt-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  id="allowMultiple"
                  checked={allowMultiple}
                  onChange={(e) => setAllowMultiple(e.target.checked)}
                  className="rounded border-border-subtle text-primary-600 focus:ring-primary-500"
                />
                <label htmlFor="allowMultiple" className="text-xs text-content select-none cursor-pointer">
                  Allow multiple choices per voter
                </label>
              </div>

              {/* Modal Actions */}
              <div className="pt-4 border-t border-border-subtle flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-border-subtle hover:bg-surface-elevated text-xs font-semibold text-content transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 rounded-xl bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover)] text-white text-xs font-semibold shadow-sm transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Creating Poll...' : 'Publish Poll'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
