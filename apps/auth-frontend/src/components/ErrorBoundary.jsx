import React from 'react';

const isDev = import.meta.env.DEV;

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    if (this.isDevMode()) {
      console.error('[ErrorBoundary] Caught render error:', error, errorInfo);
    } else {
      console.error('[ErrorBoundary] A render error occurred.');
    }
  }

  isDevMode = () => {
    if (typeof this.props.isDevOverride === 'boolean') {
      return this.props.isDevOverride;
    }
    return isDev;
  };

  handleGoHome = () => {
    window.location.assign('/');
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="error-boundary" role="alert" aria-live="assertive">
        <div className="error-boundary__card">
          <h1 className="error-boundary__title">Something went wrong.</h1>
          <p className="error-boundary__subtitle">Please refresh the page or return home.</p>
          <button type="button" className="btn-primary error-boundary__home-btn" onClick={this.handleGoHome}>
            Go Home
          </button>

          {this.isDevMode() && this.state.error && (
            <details className="error-boundary__details">
              <summary>Error details (development only)</summary>
              <pre>{this.state.error?.stack || this.state.error?.message}</pre>
              {this.state.errorInfo?.componentStack && <pre>{this.state.errorInfo.componentStack}</pre>}
            </details>
          )}
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;