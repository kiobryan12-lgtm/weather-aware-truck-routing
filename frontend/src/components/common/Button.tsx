import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/cn';

type Variant = 'primary' | 'secondary';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
  icon?: ReactNode;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: 'h-11 bg-primary text-white enabled:hover:bg-primary-hover enabled:active:bg-primary-pressed',
  secondary:
    'h-11 md:h-[38px] border border-line-strong bg-surface text-ink enabled:hover:bg-surface-hover enabled:active:bg-line',
};

export function Button({
  variant = 'primary',
  loading = false,
  icon,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-control px-4 text-button',
        'transition-colors duration-150 ease-out [&_svg]:size-4 [&_svg]:shrink-0',
        VARIANT_CLASSES[variant],
        disabled && !loading && 'opacity-50',
        loading && 'cursor-progress',
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
}

export function IconButton({ label, className, children, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex size-8 shrink-0 items-center justify-center rounded-badge text-ink-muted',
        'transition-colors duration-150 ease-out enabled:hover:bg-surface-hover enabled:hover:text-ink',
        'enabled:active:bg-line disabled:opacity-50 [&_svg]:size-4',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
