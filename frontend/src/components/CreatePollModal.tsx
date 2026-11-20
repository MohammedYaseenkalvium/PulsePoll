import React, { useState, useEffect, useRef } from 'react';
import { api, type Poll } from '../lib/api';
import { useOriginTransition, type OriginRect } from '../motion/useOriginTransition';
import {
  X,
  ArrowRight,
  ArrowLeft,
  Plus,
  Trash2,
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
    durationIn: 0.25,
    durationOut: 0.18,
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
      setErrorMessage('Enter a question and at least 2 distinct options');
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
      setErrorMessage(err instanceof Error ? err.message : 'Failed to create poll');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/60 backdrop-blur-xs"
      onClick={handleClose}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-poll-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl rounded-2xl bg-surface border border-border-strong shadow-xl overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-border-subtle flex items-center justify-between">
          <div>
            <h2 id="create-poll-title" className="text-base font-semibold text-content leading-tight">
              New live poll
            </h2>
            <p className="text-xs text-content-secondary font-mono">Step {step} of 3</p>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-lg text-content-secondary hover:text-content hover:bg-surface-elevated transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Step Indicator Progress Bar */}
        <div className="w-full bg-surface-elevated h-1">
          <div
            className="h-full bg-primary-600 transition-[width] duration-200 ease-out"
            style={{ width: `${(step / 3) * 100}%` }}
          />
        </div>

        {/* Multi-Step Steps Navigator */}
        <div className="px-6 pt-3 pb-2 flex items-center gap-6 text-xs font-medium text-content-secondary border-b border-border-subtle">
          <button
            type="button"
            onClick={() => setStep(1)}
            className={`pb-2 border-b-2 transition-colors cursor-pointer ${
              step === 1
                ? 'border-primary-600 text-primary-600 dark:text-primary-400 font-semibold'
                : 'border-transparent hover:text-content'
            }`}
          >
            1. Question
          </button>

          <button
            type="button"
            onClick={() => isStep1Valid && setStep(2)}
            disabled={!isStep1Valid}
            className={`pb-2 border-b-2 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              step === 2
                ? 'border-primary-600 text-primary-600 dark:text-primary-400 font-semibold'
                : 'border-transparent hover:text-content'
            }`}
          >
            2. Options
          </button>

          <button
            type="button"
            onClick={() => isStep1Valid && isStep2Valid && setStep(3)}
            disabled={!isStep1Valid || !isStep2Valid}
            className={`pb-2 border-b-2 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              step === 3
                ? 'border-primary-600 text-primary-600 dark:text-primary-400 font-semibold'
                : 'border-transparent hover:text-content'
            }`}
          >
            3. Settings
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 flex-1 overflow-y-auto space-y-5">
          {errorMessage && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-error-50 dark:bg-error-950/40 border border-error-200 dark:border-error-800 flex items-start gap-2.5 text-xs text-error-600 dark:text-error-400"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* STEP 1: Question & Description */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-content">
                  Question <span className="text-error-600">*</span>
                </label>
                <input
                  type="text"
                  autoFocus
                  required
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="Which release cadence works best for the team?"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-border-subtle text-content text-sm placeholder:text-content-muted focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors"
                />
                <p className="text-xs text-content-muted">At least 3 characters</p>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-content">
                  Context <span className="text-content-muted font-normal">(optional)</span>
                </label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Add notes or voting constraints for participants"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-border-subtle text-content text-sm placeholder:text-content-muted focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors resize-none"
                />
              </div>
            </div>
          )}

          {/* STEP 2: Answer Options */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-semibold text-content">Answer options</h3>
                  <p className="text-xs text-content-secondary">2 to 10 distinct choices</p>
                </div>
                {options.length < 10 && (
                  <button
                    type="button"
                    onClick={handleAddOption}
                    className="px-3 py-1.5 rounded-lg border border-border-subtle hover:bg-surface-elevated text-xs font-medium text-primary-600 dark:text-primary-400 flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Add option</span>
                  </button>
                )}
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {options.map((opt, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="w-6 text-center font-mono tabular-nums text-xs text-content-muted select-none">
                      {idx + 1}.
                    </span>
                    <input
                      type="text"
                      required
                      value={opt}
                      onChange={(e) => handleOptionChange(idx, e.target.value)}
                      placeholder={`Option ${idx + 1}`}
                      className="flex-1 px-3.5 py-2 rounded-xl bg-surface border border-border-subtle text-content text-sm placeholder:text-content-muted focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors"
                    />
                    {options.length > 2 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveOption(idx)}
                        aria-label={`Remove option ${idx + 1}`}
                        className="p-2 rounded-lg text-content-muted hover:text-error-600 hover:bg-error-50 dark:hover:bg-error-950/40 transition-colors cursor-pointer"
                        title="Remove option"
                      >
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STEP 3: Settings & Launch */}
          {step === 3 && (
            <div className="space-y-4">
              {/* Poll Summary Card */}
              <div className="p-4 rounded-xl bg-surface-elevated border border-border-subtle space-y-2">
                <span className="text-xs font-medium text-content-secondary">Summary</span>
                <h4 className="font-semibold text-sm text-content">{question}</h4>
                {description && (
                  <p className="text-xs text-content-secondary line-clamp-2">{description}</p>
                )}
                <div className="pt-1 flex flex-wrap gap-2 text-xs text-content-secondary font-mono">
                  <span className="px-2.5 py-0.5 rounded-md bg-surface border border-border-subtle">
                    {validOptions.length} options
                  </span>
                  <span className="px-2.5 py-0.5 rounded-md bg-surface border border-border-subtle">
                    {allowMultiple ? 'Multiple choice' : 'Single choice'}
                  </span>
                </div>
              </div>

              {/* Settings Toggle */}
              <div className="p-4 rounded-xl bg-surface border border-border-subtle flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <label
                    htmlFor="modalAllowMultiple"
                    className="text-xs font-semibold text-content cursor-pointer"
                  >
                    Allow multiple selections
                  </label>
                  <p className="text-xs text-content-secondary">
                    Participants can select more than one option before submitting
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
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-border-subtle bg-surface-elevated/40 flex items-center justify-between">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep((s) => (s - 1) as 1 | 2)}
              className="px-4 py-2 rounded-xl border border-border-subtle hover:bg-surface text-xs font-medium text-content flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Back</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 rounded-xl border border-border-subtle hover:bg-surface text-xs font-medium text-content-secondary hover:text-content transition-colors cursor-pointer"
            >
              Cancel
            </button>
          )}

          {step < 3 ? (
            <button
              type="button"
              disabled={step === 1 ? !isStep1Valid : !isStep2Valid}
              onClick={() => setStep((s) => (s + 1) as 2 | 3)}
              className="px-5 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-xs font-medium flex items-center gap-1.5 transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <span>Next</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              disabled={isLoading}
              onClick={handleSubmit}
              className="px-5 py-2 rounded-xl bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover)] text-white text-xs font-medium flex items-center gap-2 transition-colors duration-150 disabled:opacity-60 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-white" aria-hidden="true" />
                  <span>Creating...</span>
                </>
              ) : (
                <>
                  <span>Launch live poll</span>
                  <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
