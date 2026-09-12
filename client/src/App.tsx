import { useEffect, useState } from "react";
import "./App.css";

type Game = {
  id: number;
  homeTeam: string;
  awayTeam: string;
  startDate: string;
};

export default function App() {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  function toggleGame(id: number) {
    setSelectedIds((current) => {
      if (current.includes(id)) {
        return current.filter((selectedId) => selectedId !== id);
      }

      if (current.length >= 8) return current;

      return [...current, id];
    });
  }

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/games", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Could not load games");
        return response.json() as Promise<Game[]>;
      })
      .then((data) => {
        if (!controller.signal.aborted) {
          setGames(data);
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;

        setError(
          error instanceof Error ? error.message : "Something went wrong",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, []);

  return (
    <main>
      <h1>Picks Club</h1>

      {loading && <p role="status">Loading games...</p>}
      {error && <p role="alert">{error}</p>}

      <p>{selectedIds.length} of 8 games selected</p>

      {!loading && !error && (
        <ul className="game-list">
          {games.map((game) => (
            <li key={game.id} className="game-item">
              <label className="game-option">
                <input
                  className="game-checkbox"
                  type="checkbox"
                  checked={selectedIds.includes(game.id)}
                  disabled={
                    selectedIds.length >= 8 && !selectedIds.includes(game.id)
                  }
                  onChange={() => toggleGame(game.id)}
                />

                <span className="game-card">
                  <span className="game-matchup">
                    {game.awayTeam} at {game.homeTeam}
                  </span>

                  <span className="game-time">
                    {new Date(game.startDate).toLocaleString()}
                  </span>

                  <span className="game-check" aria-hidden="true">
                    ✓
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
