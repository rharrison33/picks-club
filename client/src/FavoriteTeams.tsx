import { useEffect, useRef, useState } from "react";
import { api, messageOf } from "./api";
export default function FavoriteTeams({ initial = [], onSelectionChange, invalid = false }: { initial?: string[]; onSelectionChange?: (teams: string[]) => void; invalid?: boolean }) {
  const [selected, setSelected] = useState(initial);
  const [teams, setTeams] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);
  function updateSelection(next: string[]) {
    setSelected(next);
    onSelectionChange?.(next);
  }
  useEffect(() => {
    searchInput.current?.setCustomValidity(selected.length === 0 ? "Choose at least one favorite team from the results." : "");
  }, [selected]);
  const matches = teams.filter((team) => team.toLowerCase().includes(search.trim().toLowerCase()));
  useEffect(() => {
    const controller = new AbortController();
    api<{teams:string[]}>("/teams", {signal:controller.signal}).then((data) => setTeams(data.teams))
      .catch((e:unknown) => {if (!controller.signal.aborted) setError(messageOf(e));});
    return () => controller.abort();
  }, []);
  return <fieldset className="favorite-teams"><legend>Favorite teams · {selected.length}/5</legend>
    <p className="muted">Choose 1–5 teams. Your pool's suggestions will favor games your members care about.</p>
    <label>Find a team<input ref={searchInput} type="search" aria-invalid={invalid} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Start typing a team name" autoComplete="off"/></label>
    {search.trim() && !error && <>
      <p className="muted" role="status">{teams.length === 0 ? "Loading teams…" : matches.length === 0 ? "No teams found. Try another name." : `${matches.length} matching teams. Select up to five favorites.`}</p>
      {matches.length > 0 && <div className="favorite-results" role="group" aria-label="Matching teams">
        {matches.map((team) => {
          const checked = selected.includes(team);
          return <label key={team} className={`favorite-result${checked ? " is-selected" : ""}`}>
            <input type="checkbox" checked={checked} disabled={!checked && selected.length >= 5}
              onChange={() => updateSelection(checked ? selected.filter((t) => t !== team) : selected.length < 5 ? [...selected, team] : selected)}/>
            <span>{team}</span>
            {checked && <small>Selected</small>}
          </label>;
        })}
      </div>}
    </>}
    {selected.length === 5 && <p className="muted" role="status">Five favorites selected. Remove one to choose another.</p>}
    <div className="favorite-chips">{selected.map((team) => <span key={team}><input type="hidden" name="favoriteTeams" value={team}/>{team}<button type="button" aria-label={"Remove " + team} onClick={() => updateSelection(selected.filter((t) => t !== team))}>×</button></span>)}</div>
    {error && <p role="alert">{error} Refresh the page to retry.</p>}
  </fieldset>;
}
