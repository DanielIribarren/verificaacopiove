import { initialState } from "./seed";
import type { AppState } from "./types";

const KEY = "verifica-acopio-ve:v1";

export function loadState(): AppState {
  const raw = localStorage.getItem(KEY);
  if (!raw) return initialState;

  try {
    return JSON.parse(raw) as AppState;
  } catch {
    return initialState;
  }
}

export function saveState(state: AppState): void {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function resetState(): AppState {
  localStorage.removeItem(KEY);
  return initialState;
}
