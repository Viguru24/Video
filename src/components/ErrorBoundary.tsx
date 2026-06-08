import React from 'react';
import type { ErrorInfo } from 'react';
import type { VideoItem } from '../types';

interface AppErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Application-level Error Boundary
 * Catches errors in the entire component tree below
 */
export class AppErrorBoundary extends React.Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  constructor(props: AppErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { 
      hasError: true, 
      error,
      errorInfo: null
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    // Log to error reporting service
    console.error('Application Error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ 
      hasError: false, 
      error: null, 
      errorInfo: null 
    });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div style={{
          background: '#000',
          color: '#fff',
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px',
          fontFamily: 'Inter, sans-serif'
        }}>
          <div style={{
            background: 'rgba(255, 0, 0, 0.1)',
            border: '2px solid var(--danger, #ff4d4d)',
            borderRadius: '12px',
            padding: '30px',
            maxWidth: '600px',
            textAlign: 'center'
          }}>
            <h1 style={{ fontSize: '24px', marginBottom: '16px', color: '#ff4d4d' }}>
              Application Error
            </h1>
            <p style={{ marginBottom: '20px', color: '#ccc' }}>
              Something went wrong. The application has encountered an unexpected error.
            </p>
            {this.state.error && (
              <pre style={{
                background: '#1a1a1a',
                padding: '15px',
                borderRadius: '8px',
                fontSize: '12px',
                overflow: 'auto',
                maxHeight: '200px',
                marginBottom: '20px',
                textAlign: 'left'
              }}>
                {this.state.error.message}
              </pre>
            )}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={this.handleReset}
                style={{
                  padding: '10px 20px',
                  background: 'var(--accent, #00f3ff)',
                  color: '#000',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '14px'
                }}
              >
                Try Again
              </button>
              <button
                onClick={() => window.location.reload()}
                style={{
                  padding: '10px 20px',
                  background: '#333',
                  color: '#fff',
                  border: '1px solid #555',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                Reload App
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Component Error Boundary (for individual components)
 */
interface ComponentErrorBoundaryProps {
  children: React.ReactNode;
  componentName?: string;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ComponentErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ComponentErrorBoundary extends React.Component<ComponentErrorBoundaryProps, ComponentErrorBoundaryState> {
  constructor(props: ComponentErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ComponentErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.props.onError?.(error, errorInfo);
    console.error(`Component Error [${this.props.componentName}]:`, error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          border: '2px solid var(--danger, #ff4d4d)',
          borderRadius: '8px',
          padding: '20px',
          background: 'rgba(255, 0, 0, 0.05)',
          textAlign: 'center'
        }}>
          <p style={{ color: 'var(--danger, #ff4d4d)', marginBottom: '12px' }}>
            {this.props.componentName || 'Component'} failed to load
          </p>
          <button
            onClick={this.handleReset}
            style={{
              padding: '8px 16px',
              background: 'var(--accent, #00f3ff)',
              color: '#000',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px'
            }}
          >
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
