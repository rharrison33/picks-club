// Thursday night ends at 00:00 Friday in the pool's time zone.
export function lineupOpen(
  saturday: string,
  timezone: string,
  now = Date.now(),
) {
  const friday = new Date(saturday + "T12:00:00Z");
  friday.setUTCDate(friday.getUTCDate() - 1);
  const sunday = new Date(saturday + "T12:00:00Z");
  sunday.setUTCDate(sunday.getUTCDate() - 6);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const part = (name: string) => parts.find((p) => p.type === name)!.value;
  const local = `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
  return (
    local >= sunday.toISOString().slice(0, 10) + "T12:00" &&
    local < friday.toISOString().slice(0, 10) + "T00:00"
  );
}
