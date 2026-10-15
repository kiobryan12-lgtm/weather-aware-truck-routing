import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from './Button';

interface ErrorStateProps {
  title: string;
  message: string;
  onRetry?: () => void;
}

export function ErrorState({ title, message, onRetry }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 rounded-card border border-line bg-surface p-4 shadow-card sm:flex-row sm:items-center"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-control bg-risk-severe-bg text-risk-severe-fg">
        <AlertTriangle className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-card text-ink">{title}</p>
        <p className="text-body text-ink-secondary">{message}</p>
      </div>
      {onRetry && (
        <Button variant="secondary" icon={<RotateCcw />} onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}
