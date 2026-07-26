import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ErrorBanner from './ErrorBanner';

describe('ErrorBanner', () => {
  it('hata mesajını erişilebilir alert olarak göstermeli', () => {
    render(<ErrorBanner message="Ticketlar yüklenemedi" />);

    expect(screen.getByRole('alert')).toHaveTextContent('Ticketlar yüklenemedi');
    expect(screen.queryByRole('button', { name: 'Tekrar Dene' })).not.toBeInTheDocument();
  });

  it('tekrar dene aksiyonunu çalıştırmalı', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<ErrorBanner message="Bağlantı hatası" onRetry={onRetry} />);

    await user.click(screen.getByRole('button', { name: 'Tekrar Dene' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
