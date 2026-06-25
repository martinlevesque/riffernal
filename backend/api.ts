import {
  getAllCategories,
  createCategory,
  getAllSongs,
  getSongById,
  insertSong,
  updateSongCategory,
  deleteSong,
  touchLastPlayed,
  type SongRow,
} from "./db.ts";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

async function parseJson<T = unknown>(req: Request): Promise<T> {
  return (await req.json()) as T;
}

type Handler = (req: Request, params: Record<string, string>) => Promise<Response> | Response;

interface Route {
  method: string;
  pattern: RegExp;
  keys: string[];
  handler: Handler;
}

function compile(path: string): { pattern: RegExp; keys: string[] } {
  const keys: string[] = [];
  const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = escaped.replace(/\/:([^/]+)/g, (_, key) => {
    keys.push(key);
    return "/([^/]+)";
  });
  return { pattern: new RegExp(`^${regex}$`), keys };
}

function defineRoutes(routes: Array<{ method: string; path: string; handler: Handler }>): Route[] {
  return routes.map((r) => {
    const { pattern, keys } = compile(r.path);
    return { method: r.method.toUpperCase(), pattern, keys, handler: r.handler };
  });
}

const routes = defineRoutes([
  {
    method: "GET",
    path: "/api/categories",
    handler: () => json(getAllCategories()),
  },
  {
    method: "POST",
    path: "/api/categories",
    handler: (req) =>
      parseJson<{ name?: string }>(req)
        .then(({ name }) => json(createCategory(name ?? ""), 201))
        .catch((err) => json({ error: errMsg(err) }, 400)),
  },
  {
    method: "GET",
    path: "/api/songs",
    handler: () => json(getAllSongs().map(rowToSummary)),
  },
  {
    method: "POST",
    path: "/api/songs",
    handler: async (req) => {
      try {
        const form = await req.formData();
        const midiFile = form.get("midi") as File | null;
        const row = insertSong({
          title: String(form.get("title") ?? ""),
          artist: String(form.get("artist") ?? ""),
          bpm: Number(form.get("bpm") ?? 120),
          difficulty: String(form.get("difficulty") ?? "medium"),
          notes: String(form.get("notes") ?? "[]"),
          midi_data: midiFile ? new Uint8Array(await midiFile.arrayBuffer()) : null,
          category_id: numOrNull(form.get("category_id")),
          tracks: (form.get("tracks") as string | null) ?? null,
          selected_track_indices: (form.get("selected_track_indices") as string | null) ?? null,
          track_hands: (form.get("track_hands") as string | null) ?? null,
          background_tracks: (form.get("background_tracks") as string | null) ?? null,
        });
        return json(rowToFull(row), 201);
      } catch (err) {
        return json({ error: errMsg(err) }, /UNIQUE|empty/i.test(errMsg(err)) ? 400 : 500);
      }
    },
  },
  {
    method: "GET",
    path: "/api/songs/:id",
    handler: (_req, { id }) => withSong(id, (row) => json(rowToFull(row))),
  },
  {
    method: "DELETE",
    path: "/api/songs/:id",
    handler: (_req, { id }) => {
      if (!getSongById(Number(id))) return json({ error: "Not found" }, 404);
      deleteSong(Number(id));
      return json({ ok: true });
    },
  },
  {
    method: "PUT",
    path: "/api/songs/:id",
    handler: (req, { id }) =>
      parseJson<{ categoryId?: number | null }>(req)
        .then(({ categoryId }) => {
          if (!getSongById(Number(id))) return json({ error: "Not found" }, 404);
          updateSongCategory(Number(id), categoryId ?? null);
          return json({ ok: true });
        })
        .catch(() => json({ error: "Invalid request" }, 400)),
  },
  {
    method: "PUT",
    path: "/api/songs/:id/play",
    handler: (_req, { id }) => withSong(id, () => {
      touchLastPlayed(Number(id));
      return json({ ok: true });
    }),
  },
]);

function numOrNull(val: FormDataEntryValue | null): number | null {
  if (!val || String(val) === "") return null;
  return Number(val);
}

function withSong(id: string, fn: (row: SongRow) => Response): Response {
  const row = getSongById(Number(id));
  if (!row) return json({ error: "Not found" }, 404);
  return fn(row);
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : "Invalid request";
}

interface SongSummary {
  id: number;
  title: string;
  artist: string;
  bpm: number;
  difficulty: string;
  categoryId: number | null;
  imported: boolean;
  createdAt: string;
  lastPlayedAt: string | null;
}

interface SongFull extends SongSummary {
  notes: unknown[];
  tracks: unknown[];
  selectedTrackIndices: number[];
  trackHands: Record<number, string>;
  backgroundTracks: number[];
}

function rowToSummary(row: SongRow): SongSummary {
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    bpm: row.bpm,
    difficulty: row.difficulty,
    categoryId: row.category_id,
    imported: row.imported === 1,
    createdAt: row.created_at,
    lastPlayedAt: row.last_played_at,
  };
}

function rowToFull(row: SongRow): SongFull {
  return {
    ...rowToSummary(row),
    notes: JSON.parse(row.notes ?? "[]"),
    tracks: row.tracks ? JSON.parse(row.tracks) : [],
    selectedTrackIndices: row.selected_track_indices ? JSON.parse(row.selected_track_indices) : [],
    trackHands: row.track_hands ? JSON.parse(row.track_hands) : {},
    backgroundTracks: row.background_tracks ? JSON.parse(row.background_tracks) : [],
  };
}

/** Handle an API request. Returns a Response, or null if no route matched. */
export async function handleApi(req: Request, pathname: string): Promise<Response | null> {
  for (const route of routes) {
    if (route.method !== req.method) continue;
    const match = route.pattern.exec(pathname);
    if (!match) continue;
    const params: Record<string, string> = {};
    route.keys.forEach((key, i) => {
      params[key] = match[i + 1];
    });
    return route.handler(req, params);
  }
  return null;
}