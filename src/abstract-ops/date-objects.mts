// This file covers abstract operations defined in
/** https://tc39.es/ecma262/#sec-date-objects */

import { X } from '../completion.mts';
import {
  ToIntegerOrInfinity,
  F, R,
  Assert,
} from './all.mts';
import { floorDiv, modulo } from './math.mts';
import { mark_OtherCalendarNotImplemented } from './temporal/not-implemented.mts';
import { NumberValue } from '#self';

export const HoursPerDay = 24n;
export const MinutesPerHour = 60n;
export const SecondsPerMinute = 60n;
export const msPerSecond = 1000n;
export const msPerMinute = msPerSecond * SecondsPerMinute;
export const msPerHour = msPerMinute * MinutesPerHour;
export const msPerDay = msPerHour * HoursPerDay;

/** https://tc39.es/ecma262/#sec-day-number-and-time-within-day */
export function Day(t: bigint): bigint {
  // 𝔽(floor(ℝ(t / msPerDay)))
  return floorDiv(t, msPerDay);
}

export function TimeWithinDay(t: bigint): bigint {
  // 𝔽(ℝ(t) modulo ℝ(msPerDay))
  return modulo(t, msPerDay);
}

/** https://tc39.es/ecma262/#sec-year-number */
export function DaysInYear(y: bigint): bigint {
  const ry = y;
  if (modulo(ry, 400n) === 0n) return 366n;
  if (modulo(ry, 100n) === 0n) return 365n;
  if (modulo(ry, 4n) === 0n) return 366n;
  return 365n;
}

export function DayFromYear(y: bigint): bigint {
  const ry = y;
  const numYears1 = ry - 1970n;
  const numYears4 = floorDiv(ry - 1969n, 4n);
  const numYears100 = floorDiv(ry - 1901n, 100n);
  const numYears400 = floorDiv(ry - 1601n, 400n);
  return numYears1 * 365n + numYears4 - numYears100 + numYears400;
}

export function TimeFromYear(y: bigint): bigint {
  return msPerDay * DayFromYear(y);
}

export const msPerAverageYear = 12 * 30.436875 * Number(msPerDay);

export function YearFromTime(t: bigint): bigint {
  // 1. Return the largest integral Number y (closest to +∞) such that TimeFromYear(y) ≤ t.
  let year = BigInt(Math.floor((Number(t) + msPerAverageYear / 2) / msPerAverageYear) + 1970);
  if (TimeFromYear(year) > t) {
    year -= 1n;
  }
  return year;
}

export function InLeapYear(t: bigint): bigint {
  // 1. If DaysInYear(YearFromTime(t)) is 366𝔽, return 1𝔽; else return +0𝔽.
  if (DaysInYear(YearFromTime(t)) === 366n) {
    return 1n;
  }
  return 0n;
}

/** https://tc39.es/ecma262/#sec-month-number */
export function MonthFromTime(t: bigint): bigint {
  const inLeapYear = InLeapYear(t);
  const dayWithinYear = DayWithinYear(t);
  if (dayWithinYear < 31n) return 0n;
  if (dayWithinYear < 59n + inLeapYear) return 1n;
  if (dayWithinYear < 90n + inLeapYear) return 2n;
  if (dayWithinYear < 120n + inLeapYear) return 3n;
  if (dayWithinYear < 151n + inLeapYear) return 4n;
  if (dayWithinYear < 181n + inLeapYear) return 5n;
  if (dayWithinYear < 212n + inLeapYear) return 6n;
  if (dayWithinYear < 243n + inLeapYear) return 7n;
  if (dayWithinYear < 273n + inLeapYear) return 8n;
  if (dayWithinYear < 304n + inLeapYear) return 9n;
  if (dayWithinYear < 334n + inLeapYear) return 10n;
  Assert(dayWithinYear < 365n + inLeapYear);
  return 11n;
}

export function DayWithinYear(t: bigint): bigint {
  return Day(t) - DayFromYear(YearFromTime(t));
}

/** https://tc39.es/ecma262/#sec-date-number */
export function DateFromTime(t: bigint): bigint {
  const inLeapYear = InLeapYear(t);
  const dayWithinYear = DayWithinYear(t);
  const month = MonthFromTime(t);
  switch (month) {
    case 0n: return dayWithinYear + 1n;
    case 1n: return dayWithinYear - 30n;
    case 2n: return dayWithinYear - 58n - inLeapYear;
    case 3n: return dayWithinYear - 89n - inLeapYear;
    case 4n: return dayWithinYear - 119n - inLeapYear;
    case 5n: return dayWithinYear - 150n - inLeapYear;
    case 6n: return dayWithinYear - 180n - inLeapYear;
    case 7n: return dayWithinYear - 211n - inLeapYear;
    case 8n: return dayWithinYear - 242n - inLeapYear;
    case 9n: return dayWithinYear - 272n - inLeapYear;
    case 10n: return dayWithinYear - 303n - inLeapYear;
    default:
  }
  Assert(month === 11n);
  return dayWithinYear - 333n - inLeapYear;
}

/** https://tc39.es/ecma262/#sec-week-day */
export function WeekDay(t: bigint): bigint {
  return modulo(Day(t) + 4n, 7n);
}

/** https://tc39.es/ecma262/#sec-local-time-zone-adjustment */
// remove after Temporal merged
export function LocalTZA(_t: NumberValue, _isUTC: boolean) {
  mark_OtherCalendarNotImplemented();
  return 0;
}

/** https://tc39.es/ecma262/#sec-localtime */
export function LocalTime(t: NumberValue) {
  return F(R(t) + LocalTZA(t, true));
}

/** https://tc39.es/ecma262/#sec-utc-t */
export function UTC(t: NumberValue) {
  return F(R(t) - LocalTZA(t, false));
}

/** https://tc39.es/ecma262/#sec-hours-minutes-second-and-milliseconds */
export function HourFromTime(t: bigint) {
  return modulo(floorDiv(t, msPerHour), HoursPerDay);
}

export function MinFromTime(t: bigint): bigint {
  return modulo(floorDiv(t, msPerMinute), MinutesPerHour);
}

export function SecFromTime(t: bigint): bigint {
  return modulo(floorDiv(t, msPerSecond), SecondsPerMinute);
}

export function msFromTime(t: bigint): bigint {
  return modulo(t, msPerSecond);
}

/** https://tc39.es/ecma262/#sec-maketime */
export function MakeTime(hour: NumberValue | bigint, min: NumberValue | bigint, sec: NumberValue | bigint, ms: NumberValue | bigint) {
  if (
    !(typeof hour === 'bigint' ? true : hour.isFinite())
    || !(typeof min === 'bigint' ? true : min.isFinite())
    || !(typeof sec === 'bigint' ? true : sec.isFinite())
    || !(typeof ms === 'bigint' ? true : ms.isFinite())
  ) {
    return F(NaN);
  }
  const h = typeof hour === 'bigint' ? Number(hour) : X(ToIntegerOrInfinity(hour));
  const m = typeof min === 'bigint' ? Number(min) : X(ToIntegerOrInfinity(min));
  const s = typeof sec === 'bigint' ? Number(sec) : X(ToIntegerOrInfinity(sec));
  const milli = typeof ms === 'bigint' ? Number(ms) : X(ToIntegerOrInfinity(ms));
  const t = h * Number(msPerHour) + m * Number(msPerMinute) + s * Number(msPerSecond) + milli;
  return F(t);
}

const daysWithinYearToEndOfMonth = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365];

/** https://tc39.es/ecma262/#sec-makeday */
export function MakeDay(year: NumberValue | bigint, month: NumberValue | bigint, date: NumberValue | bigint) {
  if (
    !(typeof year === 'bigint' ? true : year.isFinite())
    || !(typeof month === 'bigint' ? true : month.isFinite())
    || !(typeof date === 'bigint' ? true : date.isFinite())
  ) {
    return F(NaN);
  }
  const y = typeof year === 'bigint' ? Number(year) : X(ToIntegerOrInfinity(year));
  const m = typeof month === 'bigint' ? Number(month) : X(ToIntegerOrInfinity(month));
  const dt = typeof date === 'bigint' ? Number(date) : X(ToIntegerOrInfinity(date));
  const ym = y + Math.floor(m / 12);
  if (!Number.isFinite(ym)) return F(NaN);
  const mn = modulo(m, 12);
  // Find a finite time value t such that YearFromTime(t) is ym, MonthFromTime(t) is mn, and DateFromTime(t) is 1𝔽; but if this is not possible (because some argument is out of range), return NaN.
  const ymday = Number(DayFromYear(BigInt(ym + (mn > 1 ? 1 : 0)))) - 365 * (mn > 1 ? 1 : 0) + daysWithinYearToEndOfMonth[mn];
  const t = BigInt(Math.floor(ymday * Number(msPerDay)));
  return F(Number(Day(t)) + dt - 1);
}

/** https://tc39.es/ecma262/#sec-makedate */
export function MakeDate(day: NumberValue | bigint, time: NumberValue | bigint) {
  if (
    !(typeof day === 'bigint' ? true : day.isFinite())
    || !(typeof time === 'bigint' ? true : time.isFinite())
  ) {
    return F(NaN);
  }
  const d = typeof day === 'bigint' ? Number(day) : R(day);
  const t = typeof time === 'bigint' ? Number(time) : R(time);
  return F(d * Number(msPerDay) + t);
}

/** https://tc39.es/ecma262/#sec-timeclip */
export function TimeClip(time: NumberValue) {
  // 1. If time is not finite, return NaN.
  if (!time.isFinite()) {
    return F(NaN);
  }
  // 2. If abs(ℝ(time)) > 8.64 × 1015, return NaN.
  if (Math.abs(R(time)) > 8.64e15) {
    return F(NaN);
  }
  // 3. Return 𝔽(! ToIntegerOrInfinity(time)).
  return F(X(ToIntegerOrInfinity(time)));
}
