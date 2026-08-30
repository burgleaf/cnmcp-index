"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";

import {
  MAX_STATS_IDS_PER_REQUEST,
  StatsClient,
  type ResourceStatsState,
} from "@/lib/stats-client";

type StatsStateMap = Readonly<Record<string, ResourceStatsState>>;

const StatsContext = createContext<StatsStateMap>(Object.freeze({}));
const UNAVAILABLE_STATE: ResourceStatsState = Object.freeze({ status: "unavailable" });

function loadingStates(resourceIds: ReadonlyArray<string>): StatsStateMap {
  return Object.freeze(Object.fromEntries(resourceIds.map((resourceId) => [
    resourceId,
    Object.freeze({ status: "loading" as const }),
  ])));
}

function chunks<T>(values: ReadonlyArray<T>, size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

export function StatsProvider({
  resourceIds,
  children,
}: Readonly<{
  resourceIds: ReadonlyArray<string>;
  children: React.ReactNode;
}>) {
  const ids = [...new Set(resourceIds)].sort();
  const idsKey = ids.join(",");
  const clientRef = useRef<StatsClient | null>(null);
  if (!clientRef.current) clientRef.current = new StatsClient();
  const [states, setStates] = useState<StatsStateMap>(() => loadingStates(ids));

  useEffect(() => {
    let active = true;
    setStates(loadingStates(ids));
    if (ids.length === 0) return () => { active = false; };

    void Promise.all(chunks(ids, MAX_STATS_IDS_PER_REQUEST).map(async (batch) => {
      try {
        return await clientRef.current!.load(batch);
      } catch {
        return Object.freeze(Object.fromEntries(batch.map((resourceId) => [
          resourceId,
          UNAVAILABLE_STATE,
        ])));
      }
    })).then((batchStates) => {
      if (active) setStates(Object.freeze(Object.assign({}, ...batchStates)));
    });

    return () => { active = false; };
    // idsKey is a stable, canonical representation of the requested list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  return <StatsContext.Provider value={states}>{children}</StatsContext.Provider>;
}

export function useResourceStats(resourceId: string): ResourceStatsState {
  return useContext(StatsContext)[resourceId] ?? UNAVAILABLE_STATE;
}
