import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createApp } from "./app.js";
import { openDatabase } from "./database.js";
import { enrichGames } from "./team-details.js";
import { suggestGames } from "./selection.js";
test("accounts, private pools, role boundaries and immutable weekly publication", async () => {
  const db = await openDatabase(":memory:");
  const date = "2099-01-03";
  const games = enrichGames(
    Array.from({ length: 12 }, (_, i) => ({
      id: i + 1,
      homeTeam: "Home " + i,
      awayTeam: "Away " + i,
      startDate: date + "T18:00:00Z",
      startTimeTBD: false,
    })),
    [],
    [],
    [],
  ).map((g) => ({ ...g, odds: null }));
  let observedStates: string[][] = [];
  const server = createApp(
    db,
    async (saturday, states = [], timezone = "America/Denver") => {
      observedStates = states;
      const suggestions = suggestGames(games, states);
      return {
        ...suggestions,
        games: games.map((g) => ({
          ...g,
          recommendation: suggestions.priorities.find((p) => p.id === g.id)!,
        })),
        saturday,
        timezone,
        season: 2099,
        week: 1,
        validStates: [],
        rankingWeek: null,
        rankingsAvailable: false,
        recordsAvailable: false,
        oddsAvailable: false,
      };
    },
    async () => ["CO", "FL", "CA", "NY"],
    () => Date.parse("2098-12-30T18:00:00Z"),
  ).listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address !== "string");
  const base = "http://127.0.0.1:" + address.port + "/api";
  async function request(
    path: string,
    cookie = "",
    method = "GET",
    body?: unknown,
    expected = 200,
  ) {
    const response = await fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "PicksClub",
        Cookie: cookie,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json();
    assert.equal(response.status, expected, JSON.stringify(data));
    return {
      data,
      cookie: response.headers.get("set-cookie")?.split(";")[0] ?? cookie,
      headers: response.headers,
    };
  }
  try {
    await request("/auth/me", "", "GET", undefined, 401);
    await request(
      "/auth/register",
      "",
      "POST",
      { email: "bad", password: "short", name: "A", state: "ZZ" },
      400,
    );
    const register = (name: string, state: string) =>
      request(
        "/auth/register",
        "",
        "POST",
        {
          email: name + "@example.test",
          password: "test-only-password-123",
          name,
          favoriteTeams: [state],
          ageConfirmed: true,
        },
        201,
      );
    const a = await register("Alice", "CO"),
      b = await register("Bobby", "FL"),
      c = await register("Casey", "CA"),
      outsider = await register("Other", "NY");
    const boundaryAccount = {
      email: "boundary@example.test",
      password: "12345678",
      name: "Amy",
      favoriteTeams: ["CO"],
      ageConfirmed: true,
    };
    for (const email of [
      "missing-at.example.com",
      "person@",
      "person@example",
      "person name@example.com",
    ]) {
      await request(
        "/auth/register",
        "",
        "POST",
        { ...boundaryAccount, email },
        400,
      );
    }
    await request(
      "/auth/register",
      "",
      "POST",
      { ...boundaryAccount, favoriteTeams: [] },
      400,
    );
    await request(
      "/auth/register",
      "",
      "POST",
      { ...boundaryAccount, ageConfirmed: false },
      400,
    );
    await request(
      "/auth/register",
      "",
      "POST",
      { ...boundaryAccount, password: "1234567" },
      400,
    );
    await request(
      "/auth/register",
      "",
      "POST",
      { ...boundaryAccount, name: " Ab " },
      400,
    );
    await request("/auth/register", "", "POST", boundaryAccount, 201);
    await request(
      "/auth/profile",
      a.cookie,
      "PATCH",
      { name: " Ab ", favoriteTeams: ["CO"] },
      400,
    );
    assert.match(a.headers.get("set-cookie")!, /HttpOnly/);
    assert.match(a.headers.get("set-cookie")!, /SameSite=Strict/);
    const stored = (await db
      .prepare("SELECT password_hash FROM users WHERE id=?")
      .get(a.data.user.id))!;
    assert.notEqual(stored.password_hash, "test-only-password-123");
    await request(
      "/auth/login",
      "",
      "POST",
      { email: "Alice@example.test", password: "wrong" },
      401,
    );
    const login = await request("/auth/login", "", "POST", {
      email: "ALICE@example.test",
      password: "test-only-password-123",
    });
    await request("/auth/logout", login.cookie, "POST");
    await request("/auth/me", login.cookie, "GET", undefined, 401);
    await request(
      "/auth/register",
      "",
      "POST",
      {
        email: "alice@example.test",
        password: "test-only-password-123",
        name: "Alice",
        favoriteTeams: ["CO"],
        ageConfirmed: true,
      },
      409,
    );
    const created = await request(
      "/pools",
      a.cookie,
      "POST",
      {
        name: "Mountain crew",
        timezone: "America/Denver",
        defaultFeeCents: 2500,
      },
      201,
    );
    await request(
      "/pools",
      a.cookie,
      "POST",
      {
        name: "Over limit",
        timezone: "America/Denver",
        defaultFeeCents: 250001,
      },
      400,
    );
    await request(
      "/pools",
      a.cookie,
      "POST",
      {
        name: "Invalid prizes",
        timezone: "America/Denver",
        defaultFeeCents: 1000,
        prizePercentages: [80, 40],
      },
      400,
    );
    const pool = created.data.pool,
      path = "/pools/" + pool.id;
    await request(
      "/pools",
      a.cookie,
      "POST",
      { name: "Too low", timezone: "America/Denver", defaultFeeCents: 999 },
      400,
    );
    await request(
      "/auth/profile",
      a.cookie,
      "PATCH",
      { name: "Alice", favoriteTeams: [] },
      400,
    );
    await request(
      "/auth/profile",
      a.cookie,
      "PATCH",
      { name: "Alice", favoriteTeams: ["CO", "CO"] },
      400,
    );
    await request(
      "/auth/profile",
      a.cookie,
      "PATCH",
      { name: "Alice", favoriteTeams: ["Invented team"] },
      400,
    );
    await request(
      "/auth/profile",
      a.cookie,
      "PATCH",
      {
        name: "Alice",
        favoriteTeams: ["CO"],
        photoUrl: "data:image/svg+xml,<svg/>",
      },
      400,
    );
    await request(
      "/auth/profile",
      a.cookie,
      "PATCH",
      {
        name: "Alice",
        favoriteTeams: ["CO"],
        venmoUrl: "https://evil.example/venmo",
      },
      400,
    );
    const profile = await request("/auth/profile", a.cookie, "PATCH", {
      name: "Alice",
      favoriteTeams: ["CO"],
      venmoUrl: "https://venmo.com/alice",
      photoUrl: "",
    });
    assert.equal(profile.data.user.venmoUrl, "https://venmo.com/alice");
    assert.equal(
      (await request("/auth/me", a.cookie)).data.user.venmoUrl,
      "https://venmo.com/alice",
    );
    assert.equal(
      (await request(path, a.cookie)).data.pool.members.find(
        (m: { id: string }) => m.id === a.data.user.id,
      ).venmoUrl,
      "https://venmo.com/alice",
    );
    await request(
      path,
      a.cookie,
      "PATCH",
      {
        name: "Mountain crew",
        defaultFeeCents: 1000,
        venmoUrl: "https://venmo.com.evil.example/name",
      },
      400,
    );
    const linked = await request(path, a.cookie, "PATCH", {
      name: "Mountain crew",
      defaultFeeCents: 1000,
      venmoUrl: "https://venmo.com/test-profile",
    });
    assert.equal(linked.data.pool.venmoUrl, "https://venmo.com/test-profile");
    await request(path, a.cookie, "PATCH", {
      name: "Mountain crew",
      defaultFeeCents: 250000,
      prizePercentages: [70, 20, 10],
    });
    await request(
      "/pools",
      outsider.cookie,
      "POST",
      {
        name: "Other pool",
        timezone: "America/New_York",
        defaultFeeCents: 1000,
      },
      201,
    );
    assert.equal((await request("/pools", a.cookie)).data.pools.length, 1);
    await request(path, outsider.cookie, "GET", undefined, 404);
    const joined = await request("/pools/join", b.cookie, "POST", {
      code: pool.inviteCode,
    });
    assert.equal(
      joined.data.pool.members.find(
        (m: { id: string }) => m.id === a.data.user.id,
      ).venmoUrl,
      "",
    );
    assert.equal(joined.data.pool.role, "player");
    assert.equal(joined.data.pool.inviteCode, undefined);
    await request("/pools/join", c.cookie, "POST", { code: pool.inviteCode });
    await request("/pools/join", a.cookie, "POST", { code: pool.inviteCode });
    assert.equal((await request(path, a.cookie)).data.pool.role, "organizer");
    await request(
      path,
      b.cookie,
      "PATCH",
      { name: "Hijack", defaultFeeCents: 1 },
      403,
    );
    await request(
      path + "/games?date=" + date,
      b.cookie,
      "GET",
      undefined,
      403,
    );
    await request(
      path + "/members/" + a.data.user.id,
      a.cookie,
      "PATCH",
      { role: "player" },
      409,
    );
    await request(path + "/members/" + b.data.user.id, a.cookie, "PATCH", {
      role: "organizer",
    });
    await request(
      path + "/members/" + c.data.user.id,
      a.cookie,
      "PATCH",
      { role: "organizer" },
      409,
    );
    await request(
      path + "/members/" + c.data.user.id,
      c.cookie,
      "PATCH",
      { role: "organizer" },
      403,
    );
    await request(path + "/members/" + b.data.user.id, b.cookie, "PATCH", {
      role: "player",
    });
    await request(
      path,
      a.cookie,
      "PATCH",
      { name: "Mountain crew", defaultFeeCents: 1.5 },
      400,
    );
    await request(path + "/games?date=" + date, a.cookie);
    assert.deepEqual(observedStates.sort(), [["CA"], ["CO"], ["FL"]]);
    const weekPath = path + "/weeks/" + date;
    const draft = { feeCents: 3000, gameIds: [1, 2], publish: false };
    await request(weekPath, c.cookie, "PUT", draft, 403);
    await request(weekPath, a.cookie, "PUT", draft);
    assert.equal((await request(weekPath, c.cookie)).data.week.games.length, 0);
    await request(weekPath, a.cookie, "PUT", { ...draft, publish: true }, 400);
    await request(weekPath, a.cookie, "PUT", { ...draft, gameIds: [999] }, 400);
    for (const gameCount of [5, 13, 6.5]) {
      await request(weekPath, a.cookie, "PUT", { ...draft, gameCount }, 400);
    }
    for (const gameCount of [6, 12]) {
      const saved = await request(weekPath, a.cookie, "PUT", {
        ...draft,
        gameCount,
        gameIds: games.slice(0, gameCount).map((g) => g.id),
        tiebreakerGameId: 1,
      });
      assert.equal(saved.data.week.gameCount, gameCount);
      assert.equal(saved.data.week.games.length, gameCount);
      assert.equal(saved.data.week.tiebreakerGameId, 1);
    }
    await request(
      weekPath,
      a.cookie,
      "PUT",
      { ...draft, tiebreakerGameId: 12 },
      400,
    );
    await request(
      weekPath,
      a.cookie,
      "PUT",
      { ...draft, gameIds: games.slice(0, 8).map((g) => g.id), publish: true },
      400,
    );
    await request(
      weekPath,
      a.cookie,
      "PUT",
      { ...draft, gameIds: [1, 1] },
      400,
    );
    await request(weekPath, a.cookie, "PUT", {
      ...draft,
      gameIds: games.slice(0, 8).map((g) => g.id),
      tiebreakerGameId: 1,
      publish: true,
    });
    const published = (await request(weekPath, c.cookie)).data.week;
    assert.equal(published.games.length, 8);
    assert.equal(published.feeCents, 3000);
    assert.equal(published.paymentsEnabled, false);
    assert.deepEqual(published.prizePercentages, [70, 20, 10]);
    await request(weekPath, a.cookie, "PUT", draft, 409);
    await request(path + "/weeks/2099-01-04", a.cookie, "GET", undefined, 400);
    await request(path + "/invite", a.cookie, "POST");
    await request(
      "/pools/join",
      outsider.cookie,
      "POST",
      { code: pool.inviteCode },
      404,
    );
    const csrf = await fetch(base + path, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: a.cookie },
      body: "{}",
    });
    assert.equal(csrf.status, 403);
    const foreignOrigin = await fetch(base + "/auth/logout", {
      method: "POST",
      headers: {
        "X-Requested-With": "PicksClub",
        Origin: "https://untrusted.example",
        Cookie: a.cookie,
      },
    });
    assert.equal(foreignOrigin.status, 403);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await db.close();
  }
});
