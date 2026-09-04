import { useState } from 'react';

interface ApprovalRequest {
  id: string;
  action: string;
  details: Record<string, unknown>;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

interface ApprovalModalProps {
  approval: ApprovalRequest;
  onApprove: (id: string) => void;
  onReject: (id: string, reason: string) => void;
  onClose: () => void;
}

export default function ApprovalModal({ approval, onApprove, onReject, onClose }: ApprovalModalProps) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [reasonError, setReasonError] = useState(false);

  const handleApprove = async () => {
    setLoading(true);
    try {
      await onApprove(approval.id);
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    setReasonError(false);
    if (!reason.trim()) {
      setReasonError(true);
      return;
    }
    
    setLoading(true);
    try {
      await onReject(approval.id, reason);
    } finally {
      setLoading(false);
    }
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case 'delete': return '#dc2626';
      case 'bash': return '#f59e0b';
      case 'paid-api': return '#2563eb';
      case 'generate_image':
      case 'generate_video':
      case 'generate_audio': return '#9333ea';
      default: return '#666';
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'white',
          padding: 24,
          borderRadius: 8,
          maxWidth: 500,
          width: '90%',
          maxHeight: '80vh',
          overflow: 'auto'
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>Approval Required</h2>
          <button onClick={onClose} style={{ padding: '4px 12px' }}>Close</button>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{
              padding: '4px 12px',
              borderRadius: 4,
              fontSize: 12,
              background: getActionColor(approval.action),
              color: 'white'
            }}>
              {approval.action}
            </span>
            <span style={{ fontSize: 12, color: '#666' }}>
              {new Date(approval.createdAt).toLocaleString()}
            </span>
          </div>

          <div style={{ marginBottom: 16 }}>
            <h4 style={{ margin: '0 0 8px' }}>Details</h4>
            <pre style={{
              padding: 12,
              background: '#f5f5f5',
              borderRadius: 4,
              fontSize: 12,
              overflow: 'auto',
              whiteSpace: 'pre-wrap'
            }}>
              {JSON.stringify(approval.details, null, 2)}
            </pre>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 14 }}>
              Reason (required for rejection)
            </label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: reasonError ? '1px solid #dc2626' : '1px solid #ddd',
                borderRadius: 4,
                minHeight: 80,
                fontSize: 14
              }}
              placeholder="Enter reason..."
              aria-invalid={reasonError}
            />
            {reasonError && (
              <div style={{ color: '#dc2626', fontSize: 12, marginTop: 4 }}>Please provide a reason for rejection</div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              onClick={handleReject}
              disabled={loading}
              style={{
                padding: '8px 16px',
                background: '#dc2626',
                color: 'white',
                border: 'none',
                borderRadius: 4,
                cursor: loading ? 'not-allowed' : 'pointer'
              }}
            >
              Reject
            </button>
            <button
              onClick={handleApprove}
              disabled={loading}
              style={{
                padding: '8px 16px',
                background: '#16a34a',
                color: 'white',
                border: 'none',
                borderRadius: 4,
                cursor: loading ? 'not-allowed' : 'pointer'
              }}
            >
              Approve
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
