import {
  getAllSongs,
  getSongById,
  insertSong,
  updateSongCategory,
  deleteSong,
  touchLastPlayed,
  type SongRow,
} from "../db.ts";
import { json, parseJson, errMsg, numOrNull, type Handler } from "./router.ts";

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

function withSong(id: string, fn: (row: SongRow) => Response): Response {
  const row = getSongById(Number(id));

  if (!row) {
    return json({ error: "Not found" }, 404);
  }

  return fn(row);
}

export const songRoutes = [
  {
    method: "GET",
    path: "/api/songs",
    handler: (() => json(getAllSongs().map(rowToSummary))) as Handler,
  },
  {
    method: "POST",
    path: "/api/songs",
    handler: (async (req: Request) => {
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
    }) as Handler,
  },
  {
    method: "GET",
    path: "/api/songs/:id",
    handler: ((_req: Request, { id }: Record<string, string>) => withSong(id, (row) => json(rowToFull(row)))) as Handler,
  },
  {
    method: "DELETE",
    path: "/api/songs/:id",
    handler: ((_req: Request, { id }: Record<string, string>) => {
      if (!getSongById(Number(id))) {
        return json({ error: "Not found" }, 404);
      }

      deleteSong(Number(id));
      return json({ ok: true });
    }) as Handler,
  },
  {
    method: "PUT",
    path: "/api/songs/:id",
    handler: ((req: Request, { id }: Record<string, string>) =>
      parseJson<{ categoryId?: number | null }>(req)
        .then(({ categoryId }) => {
          if (!getSongById(Number(id))) {
            return json({ error: "Not found" }, 404);
          }

          updateSongCategory(Number(id), categoryId ?? null);
          return json({ ok: true });
        })
        .catch(() => json({ error: "Invalid request" }, 400))) as Handler,
  },
  {
    method: "PUT",
    path: "/api/songs/:id/play",
    handler: ((_req: Request, { id }: Record<string, string>) =>
      withSong(id, () => {
        touchLastPlayed(Number(id));
        return json({ ok: true });
      })) as Handler,
  },
];
