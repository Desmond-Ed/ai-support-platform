import { AppError } from './AppError.js';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface ResolvedDateRange {
  from: string;
  to: string;
  fromDate: Date;
  toDateExclusive: Date;
  dayCount: number;
}

export function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

export function formatUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function parseUtcCalendarDate(value: string, field: string): Date {
  if (!DATE_PATTERN.test(value)) {
    throw new AppError(`${field} must be a valid YYYY-MM-DD date`, 400);
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || formatUtcDate(parsed) !== value) {
    throw new AppError(`${field} must be a valid YYYY-MM-DD date`, 400);
  }

  return parsed;
}

export function todayUtc(now = new Date()): Date {
  return parseUtcCalendarDate(formatUtcDate(now), 'today');
}

export function resolveDateRange(
  from: string | undefined,
  to: string | undefined,
  options: { defaultDays: number; maxDays: number },
): ResolvedDateRange {
  if ((from && !to) || (!from && to)) {
    throw new AppError('from and to must be provided together', 400);
  }

  const endDate = to ? parseUtcCalendarDate(to, 'to') : todayUtc();
  const startDate = from
    ? parseUtcCalendarDate(from, 'from')
    : addUtcDays(endDate, -(options.defaultDays - 1));

  if (startDate.getTime() > endDate.getTime()) {
    throw new AppError('from must be on or before to', 400);
  }

  const dayCount = Math.round((endDate.getTime() - startDate.getTime()) / DAY_MS) + 1;
  if (dayCount > options.maxDays) {
    throw new AppError(`date range must not exceed ${options.maxDays} days`, 400);
  }

  return {
    from: formatUtcDate(startDate),
    to: formatUtcDate(endDate),
    fromDate: startDate,
    toDateExclusive: addUtcDays(endDate, 1),
    dayCount,
  };
}

export function eachUtcDate(from: string, dayCount: number): string[] {
  const start = parseUtcCalendarDate(from, 'from');
  return Array.from({ length: dayCount }, (_, index) => formatUtcDate(addUtcDays(start, index)));
}
