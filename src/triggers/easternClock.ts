// Eastern wall-clock helpers for the scheduler. Trimmed port of Signal Homer's runner/time.ts:
// Intl does the time-zone work, so DST days need no special cases here.
// Elapsed time ("5 hours since") is always real milliseconds, never wall-clock subtraction.

// Minutes since local midnight, 0..1439. "06:30" → 390.
export function localMinuteOfDay(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(now);
  const readPart = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const hour = readPart("hour") % 24; // some engines print midnight as "24"
  return hour * 60 + readPart("minute");
}

// "06:30" → 390, "24:00" → 1440.
export function clockTextToMinute(clockText: string): number {
  const [hours, minutes] = clockText.split(":").map(Number);
  return hours * 60 + minutes;
}

// 462 → "07:42".
export function minuteToClockText(minuteOfDay: number): string {
  const hours = String(Math.floor(minuteOfDay / 60)).padStart(2, "0");
  const minutes = String(minuteOfDay % 60).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function hoursBetween(earlierIso: string | null, now: Date): number {
  if (!earlierIso) return Infinity;
  return (now.getTime() - new Date(earlierIso).getTime()) / 3_600_000;
}
