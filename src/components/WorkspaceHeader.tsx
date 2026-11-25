import type { ReactNode } from 'react';

export function WorkspaceHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="workspace-header">
      <h1 className="workspace-title">{title}</h1>
      {children && <div className="workspace-header-actions">{children}</div>}
    </header>
  );
}
