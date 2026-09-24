import {
  listSongs,
  listLibrary,
  listLibraryCategorySongs,
  getSong,
  createSong,
  updateSong,
  removeSong,
  recordPlay,
  recordBestScore,
  saveTrackPreferences,
  type InsertSongInput,
  type SongUpdate,
} from "../models/index.ts";
import { json, parseJson, errMsg, handleErr, numOrNull, notFound, type Handler } from "./router.ts";
import { parsePagination } from "./helpers/pagination.ts";
import { requireAuth } from "./middleware/index.ts";
import { ValidationError } from "../models/validation.ts";

// Bun's formData() re-derives part types from the filename, so this is
// effectively a .mid/.midi filename check, not a client-declared type check.
const MIDI_MIME_TYPES = new Set(["audio/midi", "audio/x-midi"]);

// Largest real import is ~107 KB.
const MAX_MIDI_FILE_BYTES = 500 * 1024;

async function parseCreateSongForm(req: Request, userId: number): Promise<InsertSongInput> {
  const form = await req.formData();
  const midiFile = form.get("midi") as File | null;

  if (midiFile && !MIDI_MIME_TYPES.has(midiFile.type)) {
    throw new ValidationError("midi file must be audio/midi");
  }

  if (midiFile && midiFile.size > MAX_MIDI_FILE_BYTES) {
    throw new ValidationError("midi file too large (max 500 KB)");
  }

  return {
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
    imported_by_user_id: userId,
  };
}

export const songRoutes = [
  {
    method: "GET",
    path: "/api/library",
    handler: ((req: Request) => {
      const auth = requireAuth(req);
      if (auth instanceof Response) return auth;
      return json(listLibrary(auth.id));
    }) as Handler,
  },
  {
    method: "GET",
    path: "/api/library/categories/:categoryId/songs",
    handler: ((req: Request, { categoryId }: Record<string, string>) => {
      const auth = requireAuth(req);
      if (auth instanceof Response) return auth;

      let parsedCategoryId: number | null;
      if (categoryId === "uncategorized") {
        parsedCategoryId = null;
      } else {
        const n = Number(categoryId);
        if (!Number.isFinite(n) || n <= 0) return json({ error: "Invalid categoryId" }, 400);
        parsedCategoryId = n;
      }

      const { limit, offset } = parsePagination(new URL(req.url));
      return json(listLibraryCategorySongs(auth.id, parsedCategoryId, limit, offset));
    }) as Handler,
  },
  {
    method: "GET",
    path: "/api/songs",
    handler: ((req: Request) => {
      const auth = requireAuth(req);
      if (auth instanceof Response) return auth;
      return json(listSongs(auth.id));
    }) as Handler,
  },
  {
    method: "POST",
    path: "/api/songs",
    handler: (async (req: Request) => {
      const auth = requireAuth(req);
      if (auth instanceof Response) return auth;
      try {
        const input = await parseCreateSongForm(req, auth.id);
        return json(createSong(input), 201);
      } catch (err) {
        return handleErr(err, /UNIQUE|empty/i.test(errMsg(err)) ? 400 : 500);
      }
    }) as Handler,
  },
  {
    method: "GET",
    path: "/api/songs/:id",
    handler: ((req: Request, { id }: Record<string, string>) => {
      const auth = requireAuth(req);
      if (auth instanceof Response) return auth;
      const song = getSong(Number(id), auth.id);
      return song ? json(song) : notFound();
    }) as Handler,
  },
  {
    method: "DELETE",
    path: "/api/songs/:id",
    handler: ((req: Request, { id }: Record<string, string>) => {
      const auth = requireAuth(req);
      if (auth instanceof Response) return auth;
      try {
        return json(removeSong(Number(id), auth.id));
      } catch (err) {
        return handleErr(err);
      }
    }) as Handler,
  },
  {
    method: "PUT",
    path: "/api/songs/:id",
    handler: (async (req: Request, { id }: Record<string, string>) => {
      const auth = requireAuth(req);
      if (auth instanceof Response) return auth;
      const body = await parseJson<SongUpdate>(req);
      const updated = updateSong(Number(id), auth.id, body);
      return updated ? json(updated) : notFound();
    }) as Handler,
  },
  {
    method: "PUT",
    path: "/api/songs/:id/play",
    handler: ((req: Request, { id }: Record<string, string>) => {
      const auth = requireAuth(req);
      if (auth instanceof Response) return auth;
      const touched = recordPlay(Number(id), auth.id);
      return touched ? json({ ok: true }) : notFound();
    }) as Handler,
  },
  {
    method: "PUT",
    path: "/api/songs/:id/best-score",
    handler: (async (req: Request, { id }: Record<string, string>) => {
      const auth = requireAuth(req);
      if (auth instanceof Response) return auth;
      const { score } = await parseJson<{ score: number }>(req);
      const result = recordBestScore(Number(id), auth.id, score);
      return result
        ? json({ isNew: result.isNew, bestScore: result.bestScore, lastScore: result.lastScore })
        : notFound();
    }) as Handler,
  },
  {
    method: "PUT",
    path: "/api/songs/:id/track-preferences",
    handler: (async (req: Request, { id }: Record<string, string>) => {
      const auth = requireAuth(req);
      if (auth instanceof Response) return auth;
      const body = await parseJson<{ backgroundTracks?: number[]; mainTrackMuted?: boolean }>(req);
      const saved = saveTrackPreferences(Number(id), auth.id, body);
      return saved ? json(saved) : notFound();
    }) as Handler,
  },
];
