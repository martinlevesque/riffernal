import {
  getAllSongs,
  getSongById,
  insertSong,
  updateSongCategory,
  updateSongTitle,
  deleteSong,
  touchLastPlayed,
  getAllBestScores,
  getUserSongBestScore,
  upsertBestScore,
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
  bestScore: number | null;
}

interface SongFull extends SongSummary {
  notes: unknown[];
  tracks: unknown[];
  selectedTrackIndices: number[];
  trackHands: Record<number, string>;
  backgroundTracks: number[];
}

function rowToSummary(row: SongRow, bestScore: number | null = null): SongSummary {
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
    bestScore,
  };
}

function rowToFull(row: SongRow, bestScore: number | null = null): SongFull {
  return {
    ...rowToSummary(row, bestScore),
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
    handler: (() => {
      const bestScores = getAllBestScores();
      return json(getAllSongs().map((row) => rowToSummary(row, bestScores.get(row.id) ?? null)));
    }) as Handler,
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
        return json(rowToFull(row, null), 201);
      } catch (err) {
        return json({ error: errMsg(err) }, /UNIQUE|empty/i.test(errMsg(err)) ? 400 : 500);
      }
    }) as Handler,
  },
  {
    method: "GET",
    path: "/api/songs/:id",
    handler: ((_req: Request, { id }: Record<string, string>) =>
      withSong(id, (row) => {
        const bestScore = getUserSongBestScore(row.id);
        return json(rowToFull(row, bestScore));
      })) as Handler,
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
      parseJson<{ categoryId?: number | null; title?: string; artist?: string }>(req)
        .then(({ categoryId, title, artist }) => {
          const songId = Number(id);
          if (!getSongById(songId)) {
            return json({ error: "Not found" }, 404);
          }

          if (title !== undefined) {
            if (!title.trim()) {
              return json({ error: "Title cannot be empty" }, 400);
            }
            updateSongTitle(songId, title, artist ?? "");
          }

          if (categoryId !== undefined) {
            updateSongCategory(songId, categoryId ?? null);
          }

          const updated = getSongById(songId)!;
          const bestScore = getUserSongBestScore(songId);
          return json(rowToFull(updated, bestScore));
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
  {
    method: "PUT",
    path: "/api/songs/:id/best-score",
    handler: ((req: Request, { id }: Record<string, string>) =>
      parseJson<{ score: number }>(req)
        .then(({ score }) => {
          if (typeof score !== "number" || !isFinite(score) || score < 0) {
            return json({ error: "Invalid score" }, 400);
          }

          const songId = Number(id);

          if (!getSongById(songId)) {
            return json({ error: "Not found" }, 404);
          }

          const { bestScore, isNew } = upsertBestScore(songId, score);
          return json({ isNew, bestScore });
        })
        .catch(() => json({ error: "Invalid request" }, 400))) as Handler,
  },
];
