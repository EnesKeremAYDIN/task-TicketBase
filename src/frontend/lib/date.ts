import {
  APPLICATION_TIME_ZONE,
  istanbulDateTimeToUtc,
  type LocalDateTimeParts,
} from '../../shared/time-zone';

const dateFormatter = new Intl.DateTimeFormat('tr-TR', {
  timeZone: APPLICATION_TIME_ZONE,
  dateStyle: 'short',
});

const dateTimeFormatter = new Intl.DateTimeFormat('tr-TR', {
  timeZone: APPLICATION_TIME_ZONE,
  dateStyle: 'short',
  timeStyle: 'short',
});

function asDate(value: string | Date): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Geçersiz tarih');
  }
  return date;
}

export function formatIstanbulDate(value: string | Date): string {
  return dateFormatter.format(asDate(value));
}

export function formatIstanbulDateTime(value: string | Date): string {
  return dateTimeFormatter.format(asDate(value));
}

export function parseIstanbulDateTimeInput(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) return null;

  const parts: LocalDateTimeParts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6] || 0),
  };

  try {
    return istanbulDateTimeToUtc(parts);
  } catch {
    return null;
  }
}
