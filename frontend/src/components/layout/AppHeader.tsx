import { useState } from 'react';
import { Truck, User } from 'lucide-react';
import { cn } from '../../lib/cn';
import { AboutContent, HelpContent, InfoDialog } from './InfoDialog';

interface AppHeaderProps {
  sampleMode: boolean;
}

type InfoPanel = 'about' | 'help' | null;

export function AppHeader({ sampleMode }: AppHeaderProps) {
  const [panel, setPanel] = useState<InfoPanel>(null);

  const renderNavItem = (label: string, active: boolean, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative flex h-full items-center px-1 text-body font-medium transition-colors duration-150 ease-out',
        active ? 'text-primary' : 'text-ink-secondary hover:text-ink',
      )}
    >
      {label}
      {active && <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-primary" aria-hidden />}
    </button>
  );

  return (
    <header className="h-14 border-b border-line bg-surface md:h-16">
      <div className="mx-auto flex h-full max-w-[1920px] items-center justify-between gap-3 px-3 md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Truck className="size-8 shrink-0 text-primary md:size-9" strokeWidth={2.25} aria-hidden />
          <div className="min-w-0">
            <h1 className="truncate text-card md:text-title">Truck Route Planner</h1>
            <p className="hidden truncate text-label text-ink-muted sm:block">Safer routes. Smarter decisions.</p>
          </div>
        </div>

        <div className="flex h-full shrink-0 items-center gap-3 md:gap-6">
          {sampleMode && (
            <span className="hidden h-7 items-center rounded-full border border-primary-border bg-primary-light px-2.5 text-label text-primary-pressed lg:inline-flex">
              Sample data
            </span>
          )}
          <nav aria-label="Main" className="flex h-full items-center gap-4 md:gap-6">
            <span className="hidden h-full sm:flex">
              {renderNavItem('Plan Route', true, () => window.scrollTo({ top: 0, behavior: 'smooth' }))}
            </span>
            {renderNavItem('About', false, () => setPanel('about'))}
            {renderNavItem('Help', false, () => setPanel('help'))}
          </nav>
          <span
            className="hidden size-9 items-center justify-center rounded-full bg-surface-hover text-ink-muted md:flex"
            title="Driver"
            aria-hidden
          >
            <User className="size-5" />
          </span>
        </div>
      </div>

      <InfoDialog open={panel === 'about'} title="About Truck Route Planner" onClose={() => setPanel(null)}>
        <AboutContent />
      </InfoDialog>
      <InfoDialog open={panel === 'help'} title="How to use" onClose={() => setPanel(null)}>
        <HelpContent />
      </InfoDialog>
    </header>
  );
}
