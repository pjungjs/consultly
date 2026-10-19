"use client";

import { useEffect, useState } from "react";
import { cityFromZone, timeIn } from "@/lib/zone";

// "Based in London · 3:12 PM there now", ticking each minute.
export default function LocalClock({ timezone }: { timezone: string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <p className="local-clock text-sm text-muted">
      Based in {cityFromZone(timezone)} · {timeIn(now, timezone)} there now
    </p>
  );
}
