import React, { useState, useEffect, useRef } from 'react';
import { api, type Poll } from '../lib/api';
import { useOriginTransition, type OriginRect } from '../motion/useOriginTransition';
import {
  Sparkles,
  X,
  ArrowRight,
  ArrowLeft,
  Plus,
  Trash2,
  CheckCircle2,
  Sliders,
  ListPlus,
  HelpCircle,
  Loader2,
  AlertCircle,
} from 'lucide-react';

interface CreatePollModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPollCreated: (poll: Poll) => void;
  originRect?: OriginRect | null;
}

export const CreatePollModal: React.FC<CreatePollModalProps> = ({
  isOpen,
  onClose,
  onPollCreated,
  originRect,
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Form State
  const [question, setQuestion] = useState('');
  const [description, setDescription] = useState('');
  const [options, setOptions] = useState<string[]>(['Option 1', 'Option 2']);
  const [allowMultiple, setAllowMultiple] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const modalRef = useRef<HTMLDivElement>(null);
  const { animateIn, animateOut } = useOriginTransition({
    durationIn: 0.38,
    durationOut: 0.26,
  });

  // Handle opening animation
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setErrorMessage(null);
      requestAnimationFrame(() => {
        if (modalRef.current) {
          animateIn(modalRef.current, originRect);
        }
      });
    }
  }, [isOpen, originRect, animateIn]);

  // Keyboard Escape listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleClose = () => {
    if (modalRef.current) {
      animateOut(modalRef.current, originRect, () => {
        onClose();
      });
    } else {
      onClose();
    }
  };

  // Step 2 option helpers
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

  // Step validations
  const isStep1Valid = question.trim().length >= 3;

  const validOptions = options.map((o) => o.trim()).filter(Boolean);
  const uniqueOptions = new Set(validOptions.map((o) => o.toLowerCase()));
  const isStep2Valid = validOptions.length >= 2 && uniqueOptions.size === validOptions.length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!isStep1Valid || !isStep2Valid) {
      setErrorMessage('Please ensure the question and at least 2 distinct options are filled.');
      return;
    }

    setIsLoading(true);
    try {
      const newPoll = await api.createPoll({
        question: question.trim(),
        description: description.trim(),
        options: validOptions.map((text) => ({ text })),
        allowMultiple,
      });

      // Animate out and notify parent
      if (modalRef.current) {
        animateOut(modalRef.current, originRect, () => {
          onPollCreated(newPoll);
          onClose();
        });
      } else {
        onPollCreated(newPoll);
        onClose();
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to publish poll');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/60 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl rounded-3xl bg-surface border border-border-strong shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* Header */}
        <div className="px-6 sm:px-8 pt-6 pb-4 border-b border-border-subtle flex items-center justify-between bg-surface-elevated/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary-50 dark:bg-primary-950/50 text-primary-600 dark:text-primary-400 flex items-center justify-center shadow-xs">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-content leading-tight">Create Live Poll</h2>
              <p className="text-xs text-content-secondary">Step {step} of 3</p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-lg text-content-secondary hover:text-content hover:bg-surface-elevated transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Indicator Progress Bar */}
        <div className="w-full bg-surface-elevated h-1">
          <div
            className="h-full bg-primary-600 transition-all duration-300 ease-out"
            style={{ width: `${(step / 3) * 100}%` }}
          />
        </div>

        {/* Multi-Step Steps Navigator */}
        <div className="px-6 sm:px-8 pt-4 pb-2 flex items-center justify-between text-xs font-medium text-content-secondary border-b border-border-subtle">
          <button
            type="button"
            onClick={() => setStep(1)}
            className={`flex items-center gap-1.5 pb-2 border-b-2 transition-all cursor-pointer ${
              step === 1
                ? 'border-primary-600 text-primary-600 dark:text-primary-400 font-bold'
                : 'border-transparent hover:text-content'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>1. Basics</span>
          </button>

          <button
            type="button"
            onClick={() => isStep1Valid && setStep(2)}
            disabled={!isStep1Valid}
            className={`flex items-center gap-1.5 pb-2 border-b-2 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              step === 2
                ? 'border-primary-600 text-primary-600 dark:text-primary-400 font-bold'
                : 'border-transparent hover:text-content'
            }`}
          >
            <ListPlus className="w-3.5 h-3.5" />
            <span>2. Options</span>
          </button>

          <button
            type="button"
            onClick={() => isStep1Valid && isStep2Valid && setStep(3)}
            disabled={!isStep1Valid || !isStep2Valid}
            className={`flex items-center gap-1.5 pb-2 border-b-2 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              step === 3
                ? 'border-primary-600 text-primary-600 dark:text-primary-400 font-bold'
                : 'border-transparent hover:text-content'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>3. Settings & Launch</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 sm:p-8 flex-1 overflow-y-auto space-y-5">
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-error-50 dark:bg-error-950/40 border border-error-200 dark:border-error-800 flex items-start gap-2.5 text-xs text-error-600 dark:text-error-400 animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* STEP 1: Question & Description */}
          {step === 1 && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-content">
                  Poll Question <span className="text-error-600">*</span>
                </label>
                <input
                  type="text"
                  autoFocus
                  required
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="e.g. Which technology stack is optimal for real-time live voting?"
                  className="w-full px-4 py-2.5 rounded-xl bg-surface border border-border-subtle text-content text-sm placeholder:text-content-muted focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                />
                <p className="text-[11px] text-content-muted">
                  Minimum 3 characters. Keep it clear, concise, and focused.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-content">
                  Description / Context <span className="text-content-muted font-normal">(Optional)</span>
                </label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Provide background information, criteria, or constraints for participants..."
                  className="w-full px-4 py-2.5 rounded-xl bg-surface border border-border-subtle text-content text-sm placeholder:text-content-muted focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all resize-none"
                />
              </div>
            </div>
          )}

          {/* STEP 2: Answer Options */}
          {step === 2 && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-content">Poll Choices</h3>
                  <p className="text-[11px] text-content-secondary">
                    Add between 2 and 10 choices for voters.
                  </p>
                </div>
                {options.length < 10 && (
                  <button
                    type="button"
                    onClick={handleAddOption}
                    className="px-3 py-1.5 rounded-lg border border-border-subtle hover:bg-surface-elevated text-xs font-semibold text-primary-600 dark:text-primary-400 flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Choice</span>
                  </button>
                )}
              </div>

              <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                {options.map((opt, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="w-6 text-center font-mono text-xs text-content-muted select-none">
                      {idx + 1}.
                    </span>
                    <input
                      type="text"
                      required
                      value={opt}
                      onChange={(e) => handleOptionChange(idx, e.target.value)}
                      placeholder={`Choice ${idx + 1}`}
                      className="flex-1 px-3.5 py-2 rounded-xl bg-surface border border-border-subtle text-content text-sm placeholder:text-content-muted focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                    />
                    {options.length > 2 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveOption(idx)}
                        className="p-2 rounded-lg text-content-muted hover:text-error-600 hover:bg-error-50 dark:hover:bg-error-950/40 transition-colors cursor-pointer"
                        title="Remove choice"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STEP 3: Settings & Launch */}
          {step === 3 && (
            <div className="space-y-5 animate-in fade-in duration-200">
              {/* Poll Summary Card */}
              <div className="p-4 rounded-2xl bg-surface-elevated border border-border-subtle space-y-2">
                <span className="text-[11px] uppercase tracking-wider font-semibold text-primary-500">
                  Review Details
                </span>
                <h4 className="font-bold text-sm text-content">{question}</h4>
                {description && <p className="text-xs text-content-secondary line-clamp-2">{description}</p>}
                <div className="pt-2 flex flex-wrap gap-2 text-xs text-content-secondary">
                  <span className="px-2 py-0.5 rounded-full bg-surface border border-border-subtle">
                    {validOptions.length} choices configured
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-surface border border-border-subtle">
                    {allowMultiple ? 'Multiple selections allowed' : 'Single selection only'}
                  </span>
                </div>
              </div>

              {/* Settings Toggle */}
              <div className="p-4 rounded-2xl bg-surface border border-border-subtle flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <label htmlFor="modalAllowMultiple" className="text-xs font-bold text-content cursor-pointer">
                    Allow Multiple Selections
                  </label>
                  <p className="text-[11px] text-content-secondary">
                    Voters can choose more than one option per vote submission.
                  </p>
                </div>
                <input
                  type="checkbox"
                  id="modalAllowMultiple"
                  checked={allowMultiple}
                  onChange={(e) => setAllowMultiple(e.target.checked)}
                  className="w-4 h-4 rounded text-primary-600 focus:ring-primary-500 border-border-strong cursor-pointer"
                />
              </div>

              {/* Ready Notice */}
              <div className="flex items-center gap-2 text-xs text-success-700 dark:text-success-400">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Ready to stream live metrics via Redis Pub/Sub & SSE.</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 sm:px-8 py-4 border-t border-border-subtle bg-surface-elevated/40 flex items-center justify-between">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep((s) => (s - 1) as 1 | 2)}
              className="px-4 py-2 rounded-xl border border-border-subtle hover:bg-surface text-xs font-semibold text-content flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 rounded-xl border border-border-subtle hover:bg-surface text-xs font-semibold text-content-secondary hover:text-content transition-colors cursor-pointer"
            >
              Cancel
            </button>
          )}

          {step < 3 ? (
            <button
              type="button"
              disabled={step === 1 ? !isStep1Valid : !isStep2Valid}
              onClick={() => setStep((s) => (s + 1) as 2 | 3)}
              className="px-5 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all duration-150 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <span>Next</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              type="button"
              disabled={isLoading}
              onClick={handleSubmit}
              className="px-6 py-2 rounded-xl bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover)] text-white text-xs font-semibold flex items-center gap-2 shadow-sm transition-all duration-150 active:scale-95 disabled:opacity-60 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                  <span>Launching Poll...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Launch Live Poll</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
