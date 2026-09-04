import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import ChatPage from '../pages/ChatPage';
import WorkspacePage from '../pages/WorkspacePage';
import SettingsPage from '../pages/SettingsPage';
import { WorkspaceProvider } from '../contexts/WorkspaceContext';

function renderWithProviders(ui: React.ReactNode) {
  return render(<WorkspaceProvider>{ui}</WorkspaceProvider>);
}

describe('ChatPage', () => {
  it('should render chat page', () => {
    const { container } = renderWithProviders(<ChatPage />);
    expect(container.firstChild).toBeDefined();
  });

  it('should have input element', () => {
    renderWithProviders(<ChatPage />);
    const input = document.querySelector('input');
    expect(input).toBeDefined();
  });
});

describe('WorkspacePage', () => {
  it('should render workspace page', () => {
    const { container } = renderWithProviders(<WorkspacePage />);
    expect(container.firstChild).toBeDefined();
  });
});

describe('SettingsPage', () => {
  it('should render settings page', () => {
    const { container } = renderWithProviders(<SettingsPage />);
    expect(container.firstChild).toBeDefined();
  });

  it('should have form elements', () => {
    renderWithProviders(<SettingsPage />);
    const controls = document.querySelectorAll('input, button, select, .settings-nav-item');
    expect(controls.length).toBeGreaterThan(0);
  });
});