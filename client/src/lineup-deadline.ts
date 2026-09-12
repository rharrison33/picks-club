// Thursday night ends at 00:00 Friday in the pool's time zone.
export function lineupOpen(
  saturday: string,
  timezone: string,
  now = Date.now(),
) {
  const friday = new Date(saturday + "T12:00:00Z");
  friday.setUTCDate(friday.getUTCDate() - 1);
  const monday = new Date(saturday + "T12:00:00Z");
  monday.setUTCDate(monday.getUTCDate() - 5);
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
    local >= monday.toISOString().slice(0, 10) + "T11:00" &&
    local < friday.toISOString().slice(0, 10) + "T00:00"
  );
}
