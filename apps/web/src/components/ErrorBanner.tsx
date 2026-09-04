import { AlertCircle, X } from 'lucide-react';
import { getFriendlyMessage } from '../lib/errors';

interface ErrorBannerProps {
  error: unknown;
  onClose?: () => void;
  style?: React.CSSProperties;
}

export default function ErrorBanner({ error, onClose, style }: ErrorBannerProps) {
  const message = getFriendlyMessage(error);

  return (
    <div
      className="alert alert-error"
      style={{
        position: 'fixed',
        top: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        border: '1px solid #ff4444',
        backgroundColor: '#2a1a1a',
        padding: '12px 20px',
        borderRadius: 8,
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        maxWidth: '90vw',
        ...style
      }}
      role="alert"
    >
      <span style={{ flex: 1, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <AlertCircle size={18} />
        {message}
      </span>
      {onClose && (
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#ff8888',
            cursor: 'pointer',
            fontSize: 16,
            padding: 0,
            lineHeight: 1
          }}
          aria-label="关闭错误提示"
        >
          <X size={18} />
        </button>
      )}
    </div>
  );
}
