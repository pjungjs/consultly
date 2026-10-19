// "America/New_York" → "New York"
export const cityFromZone = (timezone: string) => timezone.split("/").pop()!.replace(/_/g, " ");

export const timeIn = (iso: string | Date, timezone?: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", timeZone: timezone });
