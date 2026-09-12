export type Pool = { id: string; name: string; playerStates: string[] };
export const storageKey = "picks-club-pool-preferences-v1";
export function loadPools(): Pool[] {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "null");
    if (Array.isArray(data) && data.length && data.every((p) => typeof p.id === "string"
      && typeof p.name === "string" && Array.isArray(p.playerStates)
      && p.playerStates.length <= 500 && p.playerStates.every((s: unknown) => typeof s === "string" && /^[A-Z]{2}$/.test(s)))) return data;
  } catch { /* Browser storage may be unavailable. */ }
  return [{ id: "default", name: "My pool", playerStates: [] }];
}


