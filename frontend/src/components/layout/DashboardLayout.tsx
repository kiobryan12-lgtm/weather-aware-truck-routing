import type { ReactNode } from 'react';

interface DashboardLayoutProps {
  header: ReactNode;
  sidebar: ReactNode;
  map: ReactNode;
  routes: ReactNode;
  checkpoints: ReactNode;
}

export function DashboardLayout({ header, sidebar, map, routes, checkpoints }: DashboardLayoutProps) {
  return (
    <div className="min-h-screen bg-app">
      {header}
      <main className="mx-auto flex max-w-[1920px] flex-col gap-4 p-3 md:p-4 desk:p-5">
        <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)] desk:grid-cols-[320px_minmax(0,1fr)]">
          <aside aria-label="Trip details" className="min-w-0">
            {sidebar}
          </aside>
          <div className="min-w-0">{map}</div>
        </div>
        {routes}
        {checkpoints}
      </main>
    </div>
  );
}
