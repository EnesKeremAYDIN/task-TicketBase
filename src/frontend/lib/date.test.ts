import { describe, expect, it } from 'vitest';
import {
  formatIstanbulDate,
  formatIstanbulDateTime,
  parseIstanbulDateTimeInput,
} from './date';

describe('İstanbul tarih yardımcıları', () => {
  it('UTC zamanı açıkça İstanbul saatinde göstermeli', () => {
    const value = new Date('2026-07-27T09:15:00.000Z');
    expect(formatIstanbulDate(value)).toBe('27.07.2026');
    expect(formatIstanbulDateTime(value)).toBe('27.07.2026 12:15');
  });

  it('datetime-local değerini İstanbul saati kabul ederek UTCye çevirmeli', () => {
    expect(parseIstanbulDateTimeInput('2026-07-27T12:15')?.toISOString())
      .toBe('2026-07-27T09:15:00.000Z');
  });

  it('boş veya geçersiz tarih değerlerini reddetmeli', () => {
    expect(parseIstanbulDateTimeInput('')).toBeNull();
    expect(parseIstanbulDateTimeInput('2026-02-30T12:00')).toBeNull();
    expect(parseIstanbulDateTimeInput('2026-07-27T25:00')).toBeNull();
  });

  it('tarihsel yaz saati başlangıcında bulunmayan yerel saati reddetmeli', () => {
    expect(parseIstanbulDateTimeInput('2015-03-29T03:30')).toBeNull();
  });
});
