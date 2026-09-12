import { useState } from "react";
import { loadPools, storageKey } from "./pool-storage";
export default function PoolSettings({ states, onApply }: { states: string[]; onApply: (states: string[]) => void }) {
  const [pools, setPools] = useState(loadPools);
  const [activeId, setActiveId] = useState(pools[0].id);
  const [newName, setNewName] = useState("");
  const [state, setState] = useState("CO");
  const [message, setMessage] = useState("");
  const active = pools.find((pool) => pool.id === activeId)!;
  function update(players: string[]) {
    setPools((current) => current.map((pool) => pool.id === activeId ? { ...pool, playerStates: players } : pool));
    setMessage("Preferences changed. Apply to update suggestions.");
  }
  function apply(nextPools = pools, pool = active) {
    try {
      // Store the active pool first so it is restored on reload.
      localStorage.setItem(storageKey, JSON.stringify([pool, ...nextPools.filter((p) => p.id !== pool.id)]));
      setMessage("Pool preferences saved on this device.");
    } catch { setMessage("Applied for this session; browser storage is unavailable."); }
    onApply([...pool.playerStates]);
  }
  return <details className="pool-settings">
    <summary>Pool preferences · {active.name}</summary>
    <p>Enter one state per player. States with more players get more weight. These pool profiles are saved on this device; player accounts come later.</p>
    <div className="pool-controls">
      <label>Current pool<select value={activeId} onChange={(e) => {
        const pool = pools.find((p) => p.id === e.target.value)!;
        setActiveId(pool.id); apply(pools, pool);
      }}>{pools.map((pool) => <option key={pool.id} value={pool.id}>{pool.name}</option>)}</select></label>
      <label>New pool name<input value={newName} maxLength={60} onChange={(e) => setNewName(e.target.value)} /></label>
      <button type="button" disabled={!newName.trim()} onClick={() => {
        const pool = { id: crypto.randomUUID(), name: newName.trim(), playerStates: [] };
        const next = [...pools, pool]; setPools(next); setActiveId(pool.id); setNewName(""); apply(next, pool);
      }}>Create pool</button>
    </div>
    <div className="pool-controls">
      <label>Player state<select value={state} onChange={(e) => setState(e.target.value)}>{states.map((s) => <option key={s}>{s}</option>)}</select></label>
      <button type="button" disabled={!states.length || active.playerStates.length >= 500} onClick={() => update([...active.playerStates, state])}>Add player</button>
      <button type="button" onClick={() => apply()}>Apply & regenerate eight</button>
    </div>
    <div className="player-states">{active.playerStates.map((s, index) => <button type="button" key={index} aria-label={`Remove player ${index + 1} from ${s}`} onClick={() => update(active.playerStates.filter((_, i) => i !== index))}>{s} ×</button>)}</div>
    <p>{active.playerStates.length} players · Applying replaces your current game selection.</p>
    <p role="status">{message}</p>
  </details>;
}

