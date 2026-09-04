import '@testing-library/jest-dom';
import { vi } from 'vitest';
import React from 'react';

// Typed view of the globals this setup file patches.
const g = globalThis as typeof globalThis & Record<string, unknown>;

// Ensure a working localStorage (jsdom global may be missing it).
const existingLs = g.localStorage as Partial<Storage> | undefined;
if (!existingLs || typeof existingLs.getItem !== 'function') {
  const store = new Map<string, string>();
  g.localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size; }
  };
}


// lucide-react's icon components rely on a React context that does not play
// well with the jsdom test environment (dual React instance resolves
// `React.useContext` to null). Mock icons to lightweight SVG placeholders so
// component/page tests can render without pulling in the real icon tree.
vi.mock('lucide-react', () => {
  const make = () =>
    React.forwardRef<SVGSVGElement, React.SVGProps<SVGSVGElement>>((props, ref) =>
      React.createElement('svg', { width: 16, height: 16, ...props, ref })
    );
  const target: Record<string, unknown> = { default: make(), Icon: make() };
  return new Proxy(target, {
    get: (_t, prop: string) => {
      if (prop === '__esModule') return true;
      return make();
    },
    has: () => true,
    getOwnPropertyDescriptor: () => ({
      enumerable: true,
      configurable: true,
      value: make()
    }),
    ownKeys: () => []
  });
});


// Mock scrollIntoView
Element.prototype.scrollIntoView = () => {};

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  
  readyState = MockWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((err: Event) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  
  constructor(public url: string) {
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.();
    }, 0);
  }
  
  send(_data: string) {}
  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }
}
(g as { WebSocket: unknown }).WebSocket = MockWebSocket;

// Mock fetch
(g as { fetch: unknown }).fetch = async (_url: string, _options?: unknown) => {
  return {
    ok: true,
    status: 200,
    json: async () => ({}),
    text: async () => '',
    headers: new Headers(),
  } as Response;
};

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});
