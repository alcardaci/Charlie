import type { ReactNode } from 'react';

// Model output and saved citations can only open absolute web links in the desktop app.
export function CompanionLink({ href, children, className, title }: {
  href?: string;
  children?: ReactNode;
  className?: string;
  title?: string;
}) {
  let url: URL;
  try { url = new URL(href ?? ''); } catch { return <>{children}</>; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return <>{children}</>;
  return <a href={url.href} target="_blank" rel="noopener noreferrer" title={title}
    className={className ?? 'text-terminal-accent underline underline-offset-2 hover:text-terminal-text'}>{children}</a>;
}
