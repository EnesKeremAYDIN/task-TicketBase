const WORK_START_H = 6;
const WORK_END_H = 15;
const TZ_OFFSET = 3;

function dateOnly(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function isHoliday(date: Date, holidays: Date[]): boolean {
  const d = dateOnly(date);
  return holidays.some((h) => dateOnly(h) === d);
}

function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

function isBusinessDay(date: Date, holidays: Date[]): boolean {
  return !isWeekend(date) && !isHoliday(date, holidays);
}

function istHour(date: Date): number {
  return date.getUTCHours() + TZ_OFFSET;
}

function isWithinHours(date: Date): boolean {
  const h = istHour(date);
  return h >= 9 && h < 18;
}

export function nextBusinessMinute(date: Date, holidays: Date[]): Date {
  let current = new Date(date);

  while (true) {
    if (!isBusinessDay(current, holidays)) {
      current = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate() + 1, WORK_START_H, 0, 0, 0));
      continue;
    }

    if (!isWithinHours(current)) {
      if (istHour(current) >= 18) {
        current = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate() + 1, WORK_START_H, 0, 0, 0));
        continue;
      }
      if (istHour(current) < 9) {
        current = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate(), WORK_START_H, 0, 0, 0));
        continue;
      }
    }

    return current;
  }
}

export function addBusinessMinutes(start: Date, minutes: number, holidays: Date[]): Date {
  let remaining = minutes;
  let current = nextBusinessMinute(start, holidays);

  while (remaining > 0) {
    const dayEnd = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate(), WORK_END_H, 0, 0, 0));
    const available = Math.floor((dayEnd.getTime() - current.getTime()) / 60000);

    if (available >= remaining) {
      return new Date(current.getTime() + remaining * 60000);
    }

    remaining -= available;
    current = nextBusinessMinute(
      new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate() + 1, WORK_START_H, 0, 0, 0)),
      holidays,
    );
  }

  return current;
}

export function getBusinessHoursBetween(start: Date, end: Date, holidays: Date[]): number {
  let totalMinutes = 0;
  let current = nextBusinessMinute(start, holidays);

  while (current < end) {
    const dayEnd = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate(), WORK_END_H, 0, 0, 0));
    const segmentEnd = dayEnd < end ? dayEnd : end;
    totalMinutes += (segmentEnd.getTime() - current.getTime()) / 60000;

    if (dayEnd >= end) break;

    current = nextBusinessMinute(
      new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate() + 1, WORK_START_H, 0, 0, 0)),
      holidays,
    );
  }

  return totalMinutes;
}
