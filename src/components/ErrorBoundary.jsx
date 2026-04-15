import React from 'react';

export class ErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('App error:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          fontFamily: 'system-ui, sans-serif',
          background: '#f7f7f9',
        }}>
          <div style={{
            maxWidth: 480,
            padding: 24,
            background: '#fff',
            borderRadius: 12,
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          }}>
            <h1 style={{ margin: '0 0 12px', color: '#E12627' }}>Something went wrong</h1>
            <pre style={{
              margin: 0,
              padding: 12,
              background: '#f0f0f0',
              borderRadius: 6,
              fontSize: 12,
              overflow: 'auto',
              maxHeight: 200,
            }}>
              {this.state.error?.message || String(this.state.error)}
            </pre>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                marginTop: 16,
                padding: '10px 20px',
                background: '#0083CB',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
