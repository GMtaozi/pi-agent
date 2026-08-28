import { useEffect } from 'react';

type ShortcutHandler = () => void;

export function useKeyboardShortcuts(shortcuts: Record<string, ShortcutHandler>) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // 忽略在输入框内的按键
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      const parts: string[] = [];
      if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
      if (e.shiftKey) parts.push('Shift');
      if (e.altKey) parts.push('Alt');
      parts.push(e.key);

      const key = parts.join('+');
      const handler = shortcuts[key];
      if (handler) {
        e.preventDefault();
        handler();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts]);
}
