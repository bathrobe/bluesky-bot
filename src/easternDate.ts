// Today's date in Eastern time as "YYYY-MM-DD" (the en-CA locale formats dates that way).
// Used for "one per day" limits such as state.lastAlertDate. Intl handles DST.
import { config } from "./config.ts";

export function easternDateKey(date: Date = new Date(), timeZone = config.schedule.timeZone): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
