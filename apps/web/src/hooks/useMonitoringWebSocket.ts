import { useEffect, useRef, useCallback, useState } from 'react';

export interface MonitoringWsConnectedMessage {
  type: 'connected';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  data: any;
}

export interface MonitoringWsAlertsMessage {
  type: 'alerts';
  data: Array<{
    timestamp: string;
    service: string;
    message: string;
    stack?: string;
  }>;
}

export type MonitoringWsMessage = MonitoringWsConnectedMessage | MonitoringWsAlertsMessage;

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface UseMonitoringWebSocketOptions {
  /** Called when new alerts arrive */
  onAlerts?: (alerts: MonitoringWsAlertsMessage['data']) => void;
  /** Called when initial dashboard data is received */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  onConnected?: (data: any) => void;
  /** Called when connection state changes */
  onStateChange?: (state: ConnectionState) => void;
  /** Called on non-fatal errors */
  onError?: (error: Error) => void;
  /** Base delay for reconnection backoff (ms) */
  baseReconnectDelay?: number;
  /** Maximum reconnection delay (ms) */
  maxReconnectDelay?: number;
}

export function useMonitoringWebSocket({
  onAlerts,
  onConnected,
  onStateChange,
  onError,
  baseReconnectDelay = 1000,
  maxReconnectDelay = 30000
}: UseMonitoringWebSocketOptions = {}) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const connectingRef = useRef(false);
  const reconnectAttemptRef = useRef(0);
  const onAlertsRef = useRef(onAlerts);
  const onConnectedRef = useRef(onConnected);
  const onStateChangeRef = useRef(onStateChange);
  const onErrorRef = useRef(onError);
  const baseReconnectDelayRef = useRef(baseReconnectDelay);
  const maxReconnectDelayRef = useRef(maxReconnectDelay);
  const mountedRef = useRef(true);

  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');

  useEffect(() => {
    onAlertsRef.current = onAlerts;
  }, [onAlerts]);

  useEffect(() => {
    onConnectedRef.current = onConnected;
  }, [onConnected]);

  useEffect(() => {
    onStateChangeRef.current = onStateChange;
  }, [onStateChange]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

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
      const token = (() => { try { return localStorage.getItem('pi_agent_token'); } catch { return null; } })();
      const wsUrl = protocol + '//' + window.location.host + '/api/monitoring/ws' + (token ? `?token=${encodeURIComponent(token)}` : '');
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        if (!mountedRef.current) return;
        console.log('Monitoring WebSocket connected');
        connectingRef.current = false;
        reconnectAttemptRef.current = 0;
        setState('connected');
      };

      ws.onmessage = (event) => {
        try {
          const data: MonitoringWsMessage = JSON.parse(event.data);
          if (data.type === 'connected') {
            onConnectedRef.current?.(data.data);
          } else if (data.type === 'alerts') {
            onAlertsRef.current?.(data.data);
          }
        } catch (e) {
          console.error('Failed to parse monitoring WebSocket message:', e);
          onErrorRef.current?.(e instanceof Error ? e : new Error('Failed to parse monitoring message'));
        }
      };

      ws.onclose = (event) => {
        if (!mountedRef.current) return;
        console.log('Monitoring WebSocket disconnected, code:', event.code, 'reason:', event.reason);
        wsRef.current = null;
        connectingRef.current = false;
        setState('disconnected');

        if (!event.wasClean) {
          const delay = Math.min(
            baseReconnectDelayRef.current * Math.pow(2, reconnectAttemptRef.current),
            maxReconnectDelayRef.current
          );
          reconnectAttemptRef.current += 1;
          console.log(`Reconnecting monitoring in ${delay}ms...`);
          reconnectTimerRef.current = window.setTimeout(() => {
            connect();
          }, delay);
        }
      };

      ws.onerror = (err) => {
        if (!mountedRef.current) return;
        console.error('Monitoring WebSocket error:', err);
        setState('error');
        onErrorRef.current?.(new Error('Monitoring WebSocket connection error'));
      };

      wsRef.current = ws;
    } catch (e) {
      if (!mountedRef.current) return;
      console.error('Failed to create monitoring WebSocket:', e);
      connectingRef.current = false;
      setState('error');
      onErrorRef.current?.(e instanceof Error ? e : new Error('Failed to create monitoring WebSocket'));
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
    connectionState,
    close
  };
}
