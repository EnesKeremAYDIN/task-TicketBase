import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import Modal from './Modal';

describe('Modal', () => {
  it('kapalıyken dialog oluşturmamalı', () => {
    render(<Modal open={false} onClose={() => undefined} title="Test Modalı">İçerik</Modal>);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('açıldığında ilk kontrole odaklanmalı ve Escape ile kapanmalı', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Test Modalı">
        <button>İlk Aksiyon</button>
        <button>Son Aksiyon</button>
      </Modal>,
    );

    expect(screen.getByRole('dialog', { name: 'Test Modalı' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kapat' })).toHaveFocus();

    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Tab odağını dialog içinde tutmalı', async () => {
    const user = userEvent.setup();
    render(
      <Modal open onClose={() => undefined} title="Odak Testi">
        <button>İlk Aksiyon</button>
        <button>Son Aksiyon</button>
      </Modal>,
    );

    const closeButton = screen.getByRole('button', { name: 'Kapat' });
    const lastButton = screen.getByRole('button', { name: 'Son Aksiyon' });

    closeButton.focus();
    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(lastButton).toHaveFocus();

    lastButton.focus();
    await user.keyboard('{Tab}');
    expect(closeButton).toHaveFocus();
  });

  it('kapanınca önceki odağı ve body scroll durumunu geri getirmeli', async () => {
    const user = userEvent.setup();

    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>Modalı Aç</button>
          <Modal open={open} onClose={() => setOpen(false)} title="Geri Dönüş">
            <button>İç Aksiyon</button>
          </Modal>
        </>
      );
    }

    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Modalı Aç' });
    await user.click(trigger);
    expect(document.body.style.overflow).toBe('hidden');

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(document.body.style.overflow).toBe('');
  });
});
