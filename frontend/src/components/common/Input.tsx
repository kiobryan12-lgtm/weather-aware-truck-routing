import type { InputHTMLAttributes, ReactNode, Ref } from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from '../../lib/cn';

interface FieldProps {
  id: string;
  label: string;
  error?: string | null;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Field({ id, label, error, hint, children, className }: FieldProps) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-label text-ink-secondary">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="flex items-center gap-1 text-label text-danger">
          <AlertCircle className="size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-meta text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function fieldDescribedBy(id: string, error?: string | null, hasHint?: boolean): string | undefined {
  if (error) return `${id}-error`;
  return hasHint ? `${id}-hint` : undefined;
}

interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: ReactNode;
  suffix?: ReactNode;
  invalid?: boolean;
  ref?: Ref<HTMLInputElement>;
}

export function TextInput({ icon, suffix, invalid, className, ref, ...rest }: TextInputProps) {
  return (
    <div className="relative">
      {icon && (
        <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-muted [&_svg]:size-4">
          {icon}
        </span>
      )}
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          'h-11 w-full rounded-control border bg-surface text-[16px] leading-5 text-ink md:h-[42px] md:text-body',
          'placeholder:text-ink-disabled transition-[border-color,box-shadow] duration-150 ease-out',
          'focus:ring-2 focus-visible:outline-none',
          invalid
            ? 'border-danger focus:ring-danger/20'
            : 'border-line-strong hover:border-ink-disabled focus:border-focus focus:ring-primary/20',
          icon ? 'pl-9' : 'pl-3',
          suffix ? 'pr-10' : 'pr-3',
          className,
        )}
        {...rest}
      />
      {suffix && (
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-label text-ink-muted">
          {suffix}
        </span>
      )}
    </div>
  );
}
