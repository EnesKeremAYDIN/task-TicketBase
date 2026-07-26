import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyTheme,
  getStoredTheme,
  storeTheme,
  THEME_STORAGE_KEY,
} from '../../lib/theme';
import ThemeToggle from './ThemeToggle';

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it('sistem, açık ve koyu tema seçeneklerini erişilebilir biçimde göstermeli', () => {
    render(<ThemeToggle value="system" onChange={() => undefined} />);

    const select = screen.getByRole('combobox', { name: 'Renk teması' });
    expect(select).toHaveValue('system');
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Sistem',
      'Açık',
      'Koyu',
    ]);
  });

  it('kullanıcı seçimini üst bileşene bildirmeli', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ThemeToggle value="system" onChange={onChange} />);

    await user.selectOptions(screen.getByRole('combobox', { name: 'Renk teması' }), 'dark');

    expect(onChange).toHaveBeenCalledWith('dark');
  });

  it('geçerli kayıtlı tercihi okumalı, geçersiz değerde sisteme dönmeli', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    expect(getStoredTheme()).toBe('dark');

    localStorage.setItem(THEME_STORAGE_KEY, 'beklenmeyen');
    expect(getStoredTheme()).toBe('system');
  });

  it('tema tercihini tarayıcıda saklamalı', () => {
    storeTheme('light');

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });

  it('açık ve koyu temayı HTML üzerinde uygulayıp sistem seçiminde kaldırmalı', () => {
    applyTheme('dark');
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');

    applyTheme('light');
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');

    applyTheme('system');
    expect(document.documentElement).not.toHaveAttribute('data-theme');
  });
});
