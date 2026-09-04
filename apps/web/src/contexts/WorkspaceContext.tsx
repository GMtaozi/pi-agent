import { createContext, useContext, useState, ReactNode } from 'react';

interface WorkspaceContextValue {
  workspaceId: string;
  setWorkspaceId: (id: string) => void;
  sessionId: string | null;
  setSessionId: (id: string | null) => void;
  isConnected: boolean;
  setIsConnected: (connected: boolean) => void;
  isConnecting: boolean;
  setIsConnecting: (connecting: boolean) => void;
  connectionError: string | null;
  setConnectionError: (error: string | null) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspaceId, setWorkspaceId] = useState(() => {
    const saved = localStorage.getItem('last-workspace');
    return saved || 'default';
  });
  
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  
  return (
    <WorkspaceContext.Provider value={{ 
      workspaceId, 
      setWorkspaceId, 
      sessionId, 
      setSessionId,
      isConnected,
      setIsConnected,
      isConnecting,
      setIsConnecting,
      connectionError,
      setConnectionError
    }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return context;
}
