import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider, useToast } from '../components/Toast';

function Trigger({ kind }) {
  const toast = useToast();
  return (
    <button type="button" onClick={() => toast('Gig created.', kind)}>
      fire
    </button>
  );
}

describe('Toast', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it('shows a confirmation and removes it on its own', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <ToastProvider durationMs={3000}>
        <Trigger />
      </ToastProvider>
    );
    await user.click(screen.getByRole('button', { name: 'fire' }));
    expect(screen.getByRole('status')).toHaveTextContent('Gig created.');
    act(() => vi.advanceTimersByTime(3100));
    expect(screen.queryByText('Gig created.')).not.toBeInTheDocument();
  });

  it('announces errors as alerts', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <ToastProvider>
        <Trigger kind="error" />
      </ToastProvider>
    );
    await user.click(screen.getByRole('button', { name: 'fire' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Gig created.');
  });

  it('can be dismissed by hand', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>
    );
    await user.click(screen.getByRole('button', { name: 'fire' }));
    await user.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    expect(screen.queryByText('Gig created.')).not.toBeInTheDocument();
  });

  it('keeps at most four on screen', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>
    );
    for (let i = 0; i < 6; i += 1) await user.click(screen.getByRole('button', { name: 'fire' }));
    expect(screen.getAllByText('Gig created.')).toHaveLength(4);
  });

  it('does nothing (and does not crash) without a provider', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Trigger />);
    await user.click(screen.getByRole('button', { name: 'fire' }));
    expect(screen.queryByText('Gig created.')).not.toBeInTheDocument();
  });
});
