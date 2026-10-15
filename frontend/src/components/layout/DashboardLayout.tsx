import type { ReactNode } from 'react';

interface DashboardLayoutProps {
  header: ReactNode;
  form: ReactNode;
  routes: ReactNode;
  map: ReactNode;
  checkpoints: ReactNode;
}

// Desktop: everything on one screen (sidebar with form and routes, map with the checkpoint
// panel under it). Smaller screens stack the sections in reading order.
export function DashboardLayout({ header, form, routes, map, checkpoints }: DashboardLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col bg-app lg:h-screen lg:overflow-hidden">
      {header}
      <main className="dashboard-grid mx-auto w-full max-w-[1920px] flex-1 gap-3 p-3 md:gap-4 md:p-4 lg:min-h-0">
        <div className="[grid-area:form]">{form}</div>
        <aside aria-label="Route options" className="min-h-0 [grid-area:routes] lg:overflow-y-auto lg:pr-1">
          {routes}
        </aside>
        <div className="min-h-0 min-w-0 [grid-area:map]">{map}</div>
        {checkpoints && <div className="min-w-0 [grid-area:panel]">{checkpoints}</div>}
      </main>
    </div>
  );
}
