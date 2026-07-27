import {
  addLocalCalendarDays,
  getIstanbulDateTimeParts,
  istanbulDateTimeToUtc,
  localDateKey,
  type LocalDateTimeParts,
} from '../../shared/time-zone';

const WORK_START_HOUR = 9;
const WORK_END_HOUR = 18;

function holidayKeys(holidays: Date[]): Set<string> {
  return new Set(holidays.map((holiday) => localDateKey({
    year: holiday.getUTCFullYear(),
    month: holiday.getUTCMonth() + 1,
    day: holiday.getUTCDate(),
  })));
}

function isWeekend(parts: Pick<LocalDateTimeParts, 'year' | 'month' | 'day'>): boolean {
  const day = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
  return day === 0 || day === 6;
}

function isBusinessDay(
  parts: Pick<LocalDateTimeParts, 'year' | 'month' | 'day'>,
  holidays: Set<string>,
): boolean {
  return !isWeekend(parts) && !holidays.has(localDateKey(parts));
}

function atLocalTime(
  parts: Pick<LocalDateTimeParts, 'year' | 'month' | 'day'>,
  hour: number,
): Date {
  return istanbulDateTimeToUtc({
    ...parts,
    hour,
    minute: 0,
    second: 0,
  });
}

function nextBusinessDayStart(
  parts: Pick<LocalDateTimeParts, 'year' | 'month' | 'day'>,
  holidays: Set<string>,
): Date {
  let nextDate = addLocalCalendarDays(parts, 1);
  while (!isBusinessDay(nextDate, holidays)) {
    nextDate = addLocalCalendarDays(nextDate, 1);
  }
  return atLocalTime(nextDate, WORK_START_HOUR);
}

export function nextBusinessMinute(date: Date, holidays: Date[]): Date {
  let current = new Date(date);
  const holidaysByDate = holidayKeys(holidays);
  let iterations = 0;
  const MAX_ITERATIONS = 1000;

  while (iterations < MAX_ITERATIONS) {
    iterations++;
    const local = getIstanbulDateTimeParts(current);
    if (!isBusinessDay(local, holidaysByDate)) {
      let businessDate = { year: local.year, month: local.month, day: local.day };
      while (!isBusinessDay(businessDate, holidaysByDate)) {
        businessDate = addLocalCalendarDays(businessDate, 1);
      }
      current = atLocalTime(businessDate, WORK_START_HOUR);
      continue;
    }

    if (local.hour < WORK_START_HOUR) {
      return atLocalTime(local, WORK_START_HOUR);
    }
    if (local.hour >= WORK_END_HOUR) {
      return nextBusinessDayStart(local, holidaysByDate);
    }

    return current;
  }

  throw new Error('nextBusinessMinute: maximum iterations exceeded');
}

export function addBusinessMinutes(start: Date, minutes: number, holidays: Date[]): Date {
  if (minutes < 0) throw new Error('Minutes cannot be negative');
  let remaining = minutes;
  let current = nextBusinessMinute(start, holidays);
  const holidaysByDate = holidayKeys(holidays);

  while (remaining > 0) {
    const local = getIstanbulDateTimeParts(current);
    const dayEnd = atLocalTime(local, WORK_END_HOUR);
    const available = Math.floor((dayEnd.getTime() - current.getTime()) / 60000);

    if (available >= remaining) {
      return new Date(current.getTime() + remaining * 60000);
    }

    remaining -= available;
    current = nextBusinessDayStart(local, holidaysByDate);
  }

  return current;
}

export function getBusinessHoursBetween(start: Date, end: Date, holidays: Date[]): number {
  if (end <= start) return 0;

  let totalMinutes = 0;
  let current = nextBusinessMinute(start, holidays);

  while (current < end) {
    const local = getIstanbulDateTimeParts(current);
    const dayEnd = atLocalTime(local, WORK_END_HOUR);
    const segmentEnd = dayEnd < end ? dayEnd : end;
    totalMinutes += (segmentEnd.getTime() - current.getTime()) / 60000;

    if (dayEnd >= end) break;

    current = nextBusinessMinute(dayEnd, holidays);
  }

  return totalMinutes;
}
