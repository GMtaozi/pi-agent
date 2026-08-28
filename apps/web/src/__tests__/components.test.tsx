import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import LoadingSkeleton from '../components/LoadingSkeleton';
import ErrorBoundary from '../components/ErrorBoundary';

describe('LoadingSkeleton', () => {
  it('should render with default props', () => {
    const { container } = render(<LoadingSkeleton />);
    const skeleton = container.firstChild as HTMLElement;
    expect(skeleton).toBeDefined();
    expect(skeleton.tagName).toBe('DIV');
  });

  it('should apply custom width and height', () => {
    const { container } = render(<LoadingSkeleton width={200} height={50} />);
    const skeleton = container.firstChild as HTMLElement;
    expect(skeleton.style.width).toBe('200px');
    expect(skeleton.style.height).toBe('50px');
  });
});

describe('ErrorBoundary', () => {
  it('should render children when there is no error', () => {
    render(
      <ErrorBoundary>
        <div>Child content</div>
      </ErrorBoundary>
    );
    expect(screen.getByText('Child content')).toBeDefined();
  });

  it('should render fallback when there is an error', () => {
    const ThrowingComponent = () => {
      throw new Error('Test error');
    };

    render(
      <ErrorBoundary fallback={<div>Error occurred</div>}>
        <ThrowingComponent />
      </ErrorBoundary>
    );
    
    expect(screen.getByText('Error occurred')).toBeDefined();
  });
});
