import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPostsDateBounds } from "@/lib/social.functions";

function fmt(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Returns the first/last day of the month of the latest available data.
 * Falls back to current month while loading.
 * Both dates re-track whenever new data lands (no hardcode of "current month").
 */
export function useDefaultMonthFromMaxDate() {
  const fetchBounds = useServerFn(getPostsDateBounds);
  const bounds = useQuery({
    queryKey: ["posts-date-bounds"],
    queryFn: () => fetchBounds({ data: undefined as never }),
    staleTime: 60 * 60 * 1000,
  });

  const range = (() => {
    const iso = bounds.data?.maxDate;
    const base = iso ? new Date(`${iso}T00:00:00`) : new Date();
    const start = new Date(base.getFullYear(), base.getMonth(), 1);
    const end = new Date(base.getFullYear(), base.getMonth() + 1, 0);
    return { startDate: fmt(start), endDate: fmt(end) };
  })();

  return { ...range, maxDate: bounds.data?.maxDate ?? null, isLoading: bounds.isLoading };
}

/**
 * Convenience hook: local state seeded with the max-date month; updates once when bounds resolve.
 */
export function useDateRangeFromMaxDate() {
  const { startDate, endDate, maxDate, isLoading } = useDefaultMonthFromMaxDate();
  const [range, setRange] = useState<{ startDate: string; endDate: string }>({ startDate, endDate });
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (initialized || isLoading || !maxDate) return;
    setRange({ startDate, endDate });
    setInitialized(true);
  }, [initialized, isLoading, maxDate, startDate, endDate]);

  const reset = () => setRange({ startDate, endDate });

  return { range, setRange, reset, maxDate, isLoading };
}
