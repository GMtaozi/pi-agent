import { useCallback, useMemo, useRef } from 'react';
import { API_PREFIX } from '../lib/api';
import { ensureToken } from '../lib/auth';

type EventHandler = (event: MessageEvent) => void;

interface ConnectOptions {
  onConnected?: (event: MessageEvent, source: EventSource) => void;
  onAgentEvent?: EventHandler;
  onDone?: EventHandler;
  onError?: EventHandler;
  onStreamError?: () => void;
}

export function useChatStream() {
  const esRef = useRef<EventSource | null>(null);
  const retryCountRef = useRef(0);
  const maxRetries = 5;
  const baseRetryDelay = 1000;
  const maxRetryDelay = 30000;
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentSessionIdRef = useRef<string | null>(null);
  const currentOptionsRef = useRef<ConnectOptions | null>(null);
  const manuallyClosedRef = useRef(false);

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const attemptReconnect = useCallback(() => {
    const sessionId = currentSessionIdRef.current;
    const options = currentOptionsRef.current;
    if (!sessionId || !options || manuallyClosedRef.current) return;

    if (retryCountRef.current >= maxRetries) {
      options.onError?.(new MessageEvent('error', { data: JSON.stringify({ message: '重连失败，请刷新页面重试' }) }));
      return;
    }

    const delay = Math.min(baseRetryDelay * Math.pow(2, retryCountRef.current), maxRetryDelay);
    retryCountRef.current += 1;

    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      if (manuallyClosedRef.current) return;
      connect(sessionId, options);
    }, delay);
  }, []);

  const connect = useCallback(async (sessionId: string, options: ConnectOptions = {}) => {
    clearRetryTimer();
    
    if (esRef.current) {
      esRef.current.close();
    }

    const token = await ensureToken();
    const params = new URLSearchParams();
    if (token) params.set('token', token);
    const url = `${API_PREFIX}/sessions/${sessionId}/stream${params.toString() ? '?' + params.toString() : ''}`;
    const eventSource = new EventSource(url);
    esRef.current = eventSource;
    currentSessionIdRef.current = sessionId;
    currentOptionsRef.current = options;
    manuallyClosedRef.current = false;

    const { onConnected, onAgentEvent, onDone, onError, onStreamError } = options;

    if (onConnected) {
      eventSource.addEventListener('connected', () => {
        retryCountRef.current = 0;
        onConnected(new MessageEvent('connected'), eventSource);
      });
    }
    if (onAgentEvent) {
      eventSource.addEventListener('agent_event', onAgentEvent);
    }
    if (onDone) {
      eventSource.addEventListener('done', onDone);
    }
    if (onError) {
      eventSource.addEventListener('error', onError);
    }

    eventSource.onerror = () => {
      if (manuallyClosedRef.current) return;
      onStreamError?.();
      attemptReconnect();
    };

    return eventSource;
  }, [clearRetryTimer, attemptReconnect]);

  const close = useCallback(() => {
    manuallyClosedRef.current = true;
    clearRetryTimer();
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    retryCountRef.current = 0;
    currentSessionIdRef.current = null;
    currentOptionsRef.current = null;
  }, [clearRetryTimer]);

  // useMemo 保证返回稳定引用，避免每次渲染产生新对象导致 useSSE 的 effect 无限重跑
  return useMemo(() => ({ connect, close }), [connect, close]);
}
