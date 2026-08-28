import { useEffect, useRef, useCallback, useState } from 'react';

export interface FileChangeMessage {
  type: 'file-changed';
  path: string;
  ts: number;
}

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface UseWorkspaceRefreshOptions {
  /** Called when a file change is received */
  onFileChange: (path: string) => void;
  /** Called when connection state changes */
  onStateChange?: (state: ConnectionState) => void;
  /** Called on non-fatal errors */
  onError?: (error: Error) => void;
  /** Base delay for reconnection backoff (ms) */
  baseReconnectDelay?: number;
  /** Maximum reconnection delay (ms) */
  maxReconnectDelay?: number;
}

export interface UseWorkspaceRefreshResult {
  ws: WebSocket | null;
  connectionState: ConnectionState;
  send: (message: string | object) => boolean;
  close: () => void;
  reconnect: () => void;
}

export function useWorkspaceRefresh(
  options: UseWorkspaceRefreshOptions
): UseWorkspaceRefreshResult;
export function useWorkspaceRefresh(
  onFileChange: (path: string) => void
): UseWorkspaceRefreshResult;
export function useWorkspaceRefresh(
  optionsOrCallback: UseWorkspaceRefreshOptions | ((path: string) => void)
): UseWorkspaceRefreshResult {
  const opts: UseWorkspaceRefreshOptions =
    typeof optionsOrCallback === 'function'
      ? { onFileChange: optionsOrCallback }
      : optionsOrCallback;
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const connectingRef = useRef(false);
  const reconnectAttemptRef = useRef(0);
  const onFileChangeRef = useRef(opts.onFileChange);
  const onStateChangeRef = useRef(opts.onStateChange);
  const onErrorRef = useRef(opts.onError);
  const baseReconnectDelayRef = useRef(opts.baseReconnectDelay ?? 1000);
  const maxReconnectDelayRef = useRef(opts.maxReconnectDelay ?? 30000);
  const mountedRef = useRef(true);

  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');

  useEffect(() => {
    onFileChangeRef.current = opts.onFileChange;
  }, [opts.onFileChange]);

  useEffect(() => {
    onStateChangeRef.current = opts.onStateChange;
  }, [opts.onStateChange]);

  useEffect(() => {
    onErrorRef.current = opts.onError;
  }, [opts.onError]);

  const setState = useCallback((state: ConnectionState) => {
    setConnectionState(state);
    onStateChangeRef.current?.(state);
  }, []);

  const connect = useCallback(() => {
    if (connectingRef.current) return;
    if (!mountedRef.current) return;
    connectingRef.current = true;
    setState('connecting');

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(protocol + '//' + window.location.host + '/ws');

      ws.onopen = () => {
        if (!mountedRef.current) return;
        console.log('WebSocket connected');
        connectingRef.current = false;
        reconnectAttemptRef.current = 0;
        setState('connected');
      };

      ws.onmessage = (event) => {
        try {
          const data: FileChangeMessage = JSON.parse(event.data);
          if (data.type === 'file-changed') {
            console.log('File changed:', data.path);
            onFileChangeRef.current(data.path);
          }
        } catch (e) {
          console.error('Failed to parse WebSocket message:', e);
          onErrorRef.current?.(e instanceof Error ? e : new Error('Failed to parse WebSocket message'));
        }
      };

      ws.onclose = (event) => {
        if (!mountedRef.current) return;
        console.log('WebSocket disconnected, code:', event.code, 'reason:', event.reason);
        wsRef.current = null;
        connectingRef.current = false;
        setState('disconnected');

        if (!event.wasClean) {
          const delay = Math.min(
            baseReconnectDelayRef.current * Math.pow(2, reconnectAttemptRef.current),
            maxReconnectDelayRef.current
          );
          reconnectAttemptRef.current += 1;
          console.log(`Reconnecting in ${delay}ms...`);
          reconnectTimerRef.current = window.setTimeout(() => {
            connect();
          }, delay);
        }
      };

      ws.onerror = (err) => {
        if (!mountedRef.current) return;
        console.error('WebSocket error:', err);
        setState('error');
        onErrorRef.current?.(new Error('WebSocket connection error'));
      };

      wsRef.current = ws;
    } catch (e) {
      if (!mountedRef.current) return;
      console.error('Failed to create WebSocket:', e);
      connectingRef.current = false;
      setState('error');
      onErrorRef.current?.(e instanceof Error ? e : new Error('Failed to create WebSocket'));
    }
  }, [setState]);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmounted');
        wsRef.current = null;
      }
      connectingRef.current = false;
      setState('disconnected');
    };
  }, [connect, setState]);

  const send = useCallback((message: string | object) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(typeof message === 'string' ? message : JSON.stringify(message));
      return true;
    }
    return false;
  }, []);

  const close = useCallback(() => {
    if (reconnectTimerRef.current) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close(1000, 'Manual close');
      wsRef.current = null;
    }
    connectingRef.current = false;
    reconnectAttemptRef.current = 0;
    setState('disconnected');
  }, [setState]);

  return {
    ws: wsRef.current,
    connectionState,
    send,
    close,
    reconnect: connect
  };
}
