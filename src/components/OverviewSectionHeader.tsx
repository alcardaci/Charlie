import type { ReactNode } from 'react';

export function OverviewSectionHeader({ title, id, children }: { title: string; id?: string; children?: ReactNode }) {
  return (
    <header className="mb-2 flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
      <h2 id={id} className="overview-section-title instrument-heading text-xs font-bold leading-6">{title}</h2>
      {children}
    </header>
  );
}
