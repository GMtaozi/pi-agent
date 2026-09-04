import { useState, useEffect, useRef, useCallback } from 'react';
import { useChatStream } from './useChatStream';
import { getFriendlyMessage } from '../lib/errors';

type EventHandler = (event: MessageEvent) => void;

interface UseSSEOptions {
  onConnected?: (event: MessageEvent, source: EventSource) => void;
  onAgentEvent?: EventHandler;
  onDone?: EventHandler;
  onError?: EventHandler;
}

export function useSSE(sessionId: string | null, options: UseSSEOptions = {}) {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chatStream = useChatStream();
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const connect = useCallback((sid: string) => {
    setIsConnecting(true);
    setError(null);
    return chatStream.connect(sid, {
      onConnected: (_event, source) => {
        setIsConnected(true);
        setIsConnecting(false);
        optionsRef.current.onConnected?.(new MessageEvent('connected'), source);
      },
      onAgentEvent: optionsRef.current.onAgentEvent,
      onDone: optionsRef.current.onDone,
      onError: (event) => {
        const message = getFriendlyMessage(event.data);
        setError(message);
        optionsRef.current.onError?.(event);
      },
    });
  }, [chatStream]);

  useEffect(() => {
    if (!sessionId) return;
    const _eventSource = connect(sessionId);
    return () => {
      chatStream.close();
      setIsConnected(false);
    };
  }, [sessionId, chatStream, connect]);

  const reconnect = useCallback(() => {
    if (!sessionId) return;
    connect(sessionId);
  }, [sessionId, connect]);

  return { isConnected, isConnecting, error, reconnect };
}
