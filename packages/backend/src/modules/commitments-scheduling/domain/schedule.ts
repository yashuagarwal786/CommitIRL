import { Decimal } from "@prisma/client/runtime/library";
import type { ScheduleCadence, TargetOperator, TargetUnit } from "@prisma/client";
import type { Clock } from "../../../platform/clock.js";

const WEEKDAY_INDEX: Record<string, number> = {
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
};

export function zonedParts(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: parts.weekday ?? "",
  };
}

export function localDateString(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function instantFromLocal(localDate: string, timeHHmm: string, timeZone: string): Date {
  const [year, month, day] = localDate.split("-").map(Number);
  const [hour, minute] = timeHHmm.split(":").map(Number);
  let guess = Date.UTC(year!, month! - 1, day!, hour, minute, 0);
  for (let i = 0; i < 3; i += 1) {
    const p = zonedParts(new Date(guess), timeZone);
    const actual = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, 0);
    const intended = Date.UTC(year!, month! - 1, day!, hour, minute, 0);
    guess += intended - actual;
  }
  return new Date(guess);
}

export function addDays(localDate: string, days: number): string {
  const [y, m, d] = localDate.split("-").map(Number);
  const utc = new Date(Date.UTC(y!, m! - 1, d! + days));
  return utc.toISOString().slice(0, 10);
}

export function weekdayName(localDate: string): string {
  const [y, m, d] = localDate.split("-").map(Number);
  const utc = new Date(Date.UTC(y!, m! - 1, d!));
  return ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"][utc.getUTCDay()]!;
}

export interface HorizonInput {
  cadence: ScheduleCadence;
  weekdays: string[];
  localStartDate: string;
  localEndDate: string | null;
  localWindowStartTime: string | null;
  localDeadlineTime: string | null;
  timezone: string;
}

export interface PeriodWindow {
  localDate: string;
  periodStartAt: Date;
  deadlineAt: Date;
  graceEndsAt: Date;
}

export function generateHorizon(input: HorizonInput, clock: Clock, days = 7): PeriodWindow[] {
  const today = localDateString(clock.now(), input.timezone);
  const start = input.localStartDate > today ? input.localStartDate : today;
  const windows: PeriodWindow[] = [];
  for (let i = 0; i < days; i += 1) {
    const localDate = addDays(start, i);
    if (input.localEndDate && localDate > input.localEndDate) break;
    if (localDate < input.localStartDate) continue;
    if (input.cadence === "ONE_TIME") {
      if (localDate !== input.localStartDate && i > 0) break;
      if (localDate !== input.localStartDate) continue;
    }
    if (input.cadence === "WEEKLY") {
      const day = weekdayName(localDate);
      if (!input.weekdays.includes(day)) continue;
    }
    const startTime = input.localWindowStartTime ?? "00:00";
    const endTime = input.localDeadlineTime ?? "23:59";
    const periodStartAt = instantFromLocal(localDate, startTime, input.timezone);
    let deadlineAt = instantFromLocal(localDate, endTime, input.timezone);
    if (deadlineAt <= periodStartAt) {
      deadlineAt = instantFromLocal(addDays(localDate, 1), endTime, input.timezone);
    }
    windows.push({
      localDate,
      periodStartAt,
      deadlineAt,
      graceEndsAt: new Date(deadlineAt.getTime() + 24 * 60 * 60 * 1000),
    });
    if (input.cadence === "ONE_TIME") break;
  }
  return windows;
}

export function progressMeetsTarget(progress: Decimal, operator: TargetOperator, target: Decimal): boolean {
  if (operator === "GTE") return progress.greaterThanOrEqualTo(target);
  if (operator === "LTE") return progress.lessThanOrEqualTo(target);
  return progress.equals(target);
}

export function unitCompatible(eventUnit: TargetUnit, targetUnit: TargetUnit): boolean {
  return eventUnit === targetUnit;
}
