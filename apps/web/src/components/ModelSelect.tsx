import { useState, useEffect, useRef, useCallback } from 'react';
import type { Model } from '../lib/api';

interface ModelSelectProps {
  models: Model[];
  value: string;
  onChange: (modelId: string) => void;
  disabled?: boolean;
}

export default function ModelSelect({ models, value, onChange, disabled }: ModelSelectProps) {
  const [open, setOpen] = useState(false);
  const [pane, setPane] = useState<'root' | 'models'>('root');
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const displayModels = models;
  const grouped = displayModels.reduce<Record<string, Model[]>>((acc, m) => {
    if (!acc[m.provider]) acc[m.provider] = [];
    acc[m.provider].push(m);
    return acc;
  }, {});

  const currentModel = displayModels.find(m => m.id === value);
  const currentLabel = currentModel?.name || '选择模型';

  const close = useCallback(() => {
    setOpen(false);
    setPane('root');
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        close();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open, close]);

  const handleSelect = (modelId: string) => {
    onChange(modelId);
    close();
  };

  return (
    <div className="model-select" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={'model-select-trigger' + (open ? ' open' : '')}
        onClick={() => setOpen(!open)}
        disabled={disabled}
      >
        <span className="model-select-label">{currentLabel}</span>
        <svg className="model-select-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="model-select-menu">
          {pane === 'root' && (
            <>
              <button type="button" className="model-select-cell" onClick={() => setPane('models')}>
                <span className="model-select-cell-label">模型</span>
                <span className="model-select-cell-value">{currentLabel}</span>
                <svg className="model-select-cell-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </>
          )}

          {pane === 'models' && (
            <div className="model-select-groups">
              {Object.entries(grouped).map(([provider, providerModels]) => (
                <div key={provider} className="model-select-group">
                  <div className="model-select-group-title">{provider}</div>
                  {providerModels.map(model => (
                    <button
                      key={model.id}
                      type="button"
                      className={'model-select-option' + (model.id === value ? ' selected' : '')}
                      onClick={() => handleSelect(model.id)}
                    >
                      <span className="model-select-option-copy">
                        <span className="model-select-option-name">{model.name}</span>
                        <span className="model-select-option-meta">
                          {model.provider === 'custom' && <span className="badge" style={{ marginRight: 4 }}>自定义</span>}
                          {model.contextLength ? `${(model.contextLength / 1024).toFixed(0)}K` : ''}
                          {model.supportsReasoning ? ' · Reasoning' : ''}
                          {model.supportsVision ? ' · Vision' : ''}
                        </span>
                      </span>
                      {model.id === value && (
                        <svg className="model-select-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}