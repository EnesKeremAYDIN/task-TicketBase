export const APPLICATION_TIME_ZONE = 'Europe/Istanbul';

export interface LocalDateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const istanbulPartsFormatter = new Intl.DateTimeFormat('en-CA-u-ca-gregory-nu-latn', {
  timeZone: APPLICATION_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function numberPart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): number {
  const value = parts.find((part) => part.type === type)?.value;
  if (!value) {
    throw new Error(`Saat dilimi parçası bulunamadı: ${type}`);
  }
  return Number(value);
}

function partsAsUtcMilliseconds(parts: LocalDateTimeParts): number {
  return Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
}

function hasValidCalendarValues(parts: LocalDateTimeParts): boolean {
  const normalized = new Date(partsAsUtcMilliseconds(parts));
  return normalized.getUTCFullYear() === parts.year
    && normalized.getUTCMonth() + 1 === parts.month
    && normalized.getUTCDate() === parts.day
    && normalized.getUTCHours() === parts.hour
    && normalized.getUTCMinutes() === parts.minute
    && normalized.getUTCSeconds() === parts.second;
}

export function getIstanbulDateTimeParts(date: Date): LocalDateTimeParts {
  if (Number.isNaN(date.getTime())) {
    throw new Error('Geçersiz tarih');
  }

  const parts = istanbulPartsFormatter.formatToParts(date);
  return {
    year: numberPart(parts, 'year'),
    month: numberPart(parts, 'month'),
    day: numberPart(parts, 'day'),
    hour: numberPart(parts, 'hour'),
    minute: numberPart(parts, 'minute'),
    second: numberPart(parts, 'second'),
  };
}

export function istanbulDateTimeToUtc(parts: LocalDateTimeParts): Date {
  if (!hasValidCalendarValues(parts)) {
    throw new Error('Geçersiz İstanbul tarih ve saat değeri');
  }

  const targetMilliseconds = partsAsUtcMilliseconds(parts);
  let candidateMilliseconds = targetMilliseconds;

  for (let attempt = 0; attempt < 4; attempt++) {
    const actualParts = getIstanbulDateTimeParts(new Date(candidateMilliseconds));
    const difference = targetMilliseconds - partsAsUtcMilliseconds(actualParts);
    candidateMilliseconds += difference;
    if (difference === 0) break;
  }

  const candidate = new Date(candidateMilliseconds);
  const resolvedParts = getIstanbulDateTimeParts(candidate);
  if (partsAsUtcMilliseconds(resolvedParts) !== targetMilliseconds) {
    throw new Error('Bu yerel saat Europe/Istanbul saat diliminde bulunmuyor');
  }

  return candidate;
}

export function addLocalCalendarDays(
  parts: Pick<LocalDateTimeParts, 'year' | 'month' | 'day'>,
  days: number,
): Pick<LocalDateTimeParts, 'year' | 'month' | 'day'> {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

export function localDateKey(
  parts: Pick<LocalDateTimeParts, 'year' | 'month' | 'day'>,
): string {
  const month = String(parts.month).padStart(2, '0');
  const day = String(parts.day).padStart(2, '0');
  return `${parts.year}-${month}-${day}`;
}
