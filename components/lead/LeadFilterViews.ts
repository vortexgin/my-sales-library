"use client";

export type BoardFilters = {
  q: string;
  source: string;
  assigned: string;
  assignedTo: string;
  valueMin: string;
  valueMax: string;
  staleDays: string;
};

export const EMPTY_BOARD_FILTERS: BoardFilters = {
  q: "",
  source: "",
  assigned: "all",
  assignedTo: "",
  valueMin: "",
  valueMax: "",
  staleDays: "",
};

export type SavedBoardView = {
  name: string;
  filters: BoardFilters;
};

const STORAGE_KEY = "sales-board-views-v1";

function readAll(): SavedBoardView[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (entry): entry is SavedBoardView =>
        typeof entry === "object" && entry !== null && typeof (entry as SavedBoardView).name === "string",
    );
  } catch {
    return [];
  }
}

/** Saved filter views (localStorage v1, no API). Round-trips through URL + storage. */
export function loadBoardViews(): SavedBoardView[] {
  if (typeof window === "undefined") {
    return [];
  }
  return readAll();
}

export function saveBoardView(name: string, filters: BoardFilters): SavedBoardView[] {
  const views = readAll().filter((view) => view.name !== name);
  views.push({ name, filters: { ...EMPTY_BOARD_FILTERS, ...filters } });
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(views));
  } catch {
    // Storage full or unavailable: views just don't persist.
  }
  return views;
}

export function deleteBoardView(name: string): SavedBoardView[] {
  const views = readAll().filter((view) => view.name !== name);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(views));
  } catch {
    // Ignore persistence failures.
  }
  return views;
}

/** Shareable-link sync: applied filters serialize to the URL query string. */
export function filtersToSearchParams(filters: BoardFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.q.trim()) {
    params.set("q", filters.q.trim());
  }
  if (filters.source) {
    params.set("source", filters.source);
  }
  if (filters.assigned && filters.assigned !== "all") {
    params.set("assigned", filters.assigned);
  }
  if (filters.assigned === "specific" && filters.assignedTo) {
    params.set("assigned_to", filters.assignedTo);
  }
  if (filters.valueMin.trim()) {
    params.set("value_min", filters.valueMin.trim());
  }
  if (filters.valueMax.trim()) {
    params.set("value_max", filters.valueMax.trim());
  }
  if (filters.staleDays) {
    params.set("stale_days", filters.staleDays);
  }
  return params;
}

const ASSIGNED_MODES = new Set(["all", "me", "unassigned", "specific"]);

export function filtersFromSearchParams(params: URLSearchParams): BoardFilters {
  const assigned = params.get("assigned") ?? "all";
  return {
    ...EMPTY_BOARD_FILTERS,
    q: params.get("q") ?? "",
    source: params.get("source") ?? "",
    assigned: ASSIGNED_MODES.has(assigned) ? assigned : "all",
    assignedTo: params.get("assigned_to") ?? "",
    valueMin: params.get("value_min") ?? "",
    valueMax: params.get("value_max") ?? "",
    staleDays: params.get("stale_days") ?? "",
  };
}
