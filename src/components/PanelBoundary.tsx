import { Component, type ReactNode } from 'react';

export class PanelBoundary extends Component<{ children: ReactNode }, { failed: boolean; chunkFailure: boolean }> {
  state = { failed: false, chunkFailure: false };

  static getDerivedStateFromError(error: unknown) {
    return { failed: true, chunkFailure: /dynamically imported|module script|loading chunk|importing a module/i.test(String(error)) };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="m-4 rounded border border-terminal-border bg-terminal-panel p-4 text-sm">
        <p className="text-terminal-negative">This workspace could not be displayed.</p>
        <p className="mt-2 text-terminal-muted">Your saved data is unchanged. Retry this workspace or switch to another panel.</p>
        <button className="mt-3 rounded border border-terminal-border px-3 py-1 text-terminal-accent" onClick={() => this.state.chunkFailure ? window.location.reload() : this.setState({ failed: false })}>
          {this.state.chunkFailure ? 'Reload app' : 'Retry workspace'}
        </button>
      </div>
    );
  }
}
