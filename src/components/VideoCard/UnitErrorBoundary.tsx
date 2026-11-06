import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

export class UnitErrorBoundary extends React.Component<
  { children: React.ReactNode; id: string },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode; id: string }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="video-card ui-visible" style={{ border: '2px solid var(--danger)', padding: 10, background: '#000000' }}>
          <div className="unit-error-overlay" style={{ position: 'relative', height: '100%' }}>
            <AlertCircle size={24} color="var(--danger)" />
            <p style={{ margin: '10px 0', fontSize: 12, wordBreak: 'break-all' }}>UNIT CRASH: {this.state.error?.message}</p>
            <button className="retry-btn" onClick={() => this.setState({ hasError: false, error: null })}>
              <RefreshCw size={14} /> RECOVER
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
