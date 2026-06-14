import type { VerifyResult } from "./types";

export interface HistoryEntry {
  id: string;
  ts: number;
  task: string;
  diff: string;
  model: string;
  orModel: string;
  result: VerifyResult;
}

const KEY = "mc:history";
const CAP = 10;

export function loadHistory(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function pushHistory(entry: HistoryEntry): HistoryEntry[] {
  const list = [entry, ...loadHistory().filter((e) => e.id !== entry.id)].slice(0, CAP);
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // quota exceeded — drop the heaviest tail and retry once
    try {
      localStorage.setItem(KEY, JSON.stringify(list.slice(0, 5)));
    } catch {
      /* give up silently */
    }
  }
  return loadHistory();
}

export function clearHistory(): HistoryEntry[] {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  return [];
}
