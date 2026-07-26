import { Component, type ErrorInfo, type ReactNode } from 'react';
import i18n from '../i18n';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  /** Bumped on languageChanged so render() re-evaluates i18n.t(). */
  langTick: number;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null, langTick: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error, errorInfo: null };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    console.error('ErrorBoundary caught an error', error, errorInfo);
  }

  handleLanguageChanged = () => {
    this.setState((prev) => ({ langTick: prev.langTick + 1 }));
  };

  componentDidMount() {
    i18n.on('languageChanged', this.handleLanguageChanged);
  }

  componentWillUnmount() {
    i18n.off('languageChanged', this.handleLanguageChanged);
  }

  handleRestart = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      // Pull recent backup so they don't lose work
      const rawText = localStorage.getItem('graham-braille-editor-text-backup') || '';

      const componentStack = this.state.errorInfo?.componentStack || i18n.t('errorBoundary.unknownStack');
      const errorMessage = this.state.error?.message || i18n.t('errorBoundary.unknownError');

      const emailBody = i18n.t('errorBoundary.mailto.bodyTemplate', { error: errorMessage, stack: componentStack });
      const emailSubject = i18n.t('errorBoundary.mailto.subject');
      const mailtoLink = `mailto:grahamthetvi@icloud.com?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;

      return (
        <div className="error-boundary-overlay" style={{ padding: '2rem', background: '#2c0b0e', color: '#ffb3b3', minHeight: '100vh', fontFamily: 'system-ui, sans-serif' }}>
          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            <h1 style={{ color: '#ff4d4d' }}>{i18n.t('errorBoundary.heading')}</h1>
            <p>{i18n.t('errorBoundary.message')}</p>
            
            <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem' }}>
              <button 
                onClick={this.handleRestart}
                style={{ padding: '0.8rem 1.5rem', background: '#ff4d4d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                {i18n.t('errorBoundary.reload')}
              </button>
              <a 
                href={mailtoLink}
                style={{ padding: '0.8rem 1.5rem', background: 'transparent', color: '#ffb3b3', border: '1px solid #ff4d4d', borderRadius: '4px', textDecoration: 'none', fontWeight: 'bold' }}
              >
                {i18n.t('errorBoundary.reportButton')}
              </a>
            </div>

            {rawText.trim() && (
               <div style={{ marginTop: '2.5rem' }}>
                 <h2 style={{ fontSize: '1.2rem' }}>{i18n.t('errorBoundary.rescueHeading')}</h2>
                 <p style={{ fontSize: '0.9rem', opacity: 0.8 }}>{i18n.t('errorBoundary.rescueHint')}</p>
                 <textarea 
                   readOnly 
                   value={rawText} 
                   style={{ 
                     width: '100%', 
                     height: '250px', 
                     padding: '1rem', 
                     background: '#1a0505', 
                     color: '#ffb3b3', 
                     border: '1px solid #801a1a', 
                     borderRadius: '4px',
                     fontFamily: 'monospace'
                   }}
                 />
               </div>
            )}

            <div style={{ marginTop: '2rem', padding: '1rem', background: '#1a0505', borderRadius: '4px', border: '1px solid #801a1a', overflowX: 'auto' }}>
              <h3 style={{ fontSize: '1rem', marginTop: 0 }}>{i18n.t('errorBoundary.errorDetailsHeading')}</h3>
              <pre style={{ margin: 0, fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>
                {this.state.error?.toString()}
                {'\n'}
                {this.state.errorInfo?.componentStack}
              </pre>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
