import {
  listSongs,
  getSong,
  createSong,
  updateSong,
  removeSong,
  recordPlay,
  recordBestScore,
  saveTrackPreferences,
  type InsertSongInput,
  type SongUpdate,
  type TrackPreferences,
} from "../models/index.ts";
import { json, parseJson, errMsg, numOrNull, type Handler } from "./router.ts";

/** Parse the multipart form for POST /api/songs into an InsertSongInput. */
async function parseCreateSongForm(req: Request): Promise<InsertSongInput> {
  const form = await req.formData();
  const midiFile = form.get("midi") as File | null;
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
  };
}

export const songRoutes = [
  {
    method: "GET",
    path: "/api/songs",
    handler: (() => json(listSongs())) as Handler,
  },
  {
    method: "POST",
    path: "/api/songs",
    handler: (async (req: Request) => {
      try {
        const input = await parseCreateSongForm(req);
        return json(createSong(input), 201);
      } catch (err) {
        return json({ error: errMsg(err) }, /UNIQUE|empty/i.test(errMsg(err)) ? 400 : 500);
      }
    }) as Handler,
  },
  {
    method: "GET",
    path: "/api/songs/:id",
    handler: ((_req: Request, { id }: Record<string, string>) => {
      const song = getSong(Number(id));
      return song ? json(song) : json({ error: "Not found" }, 404);
    }) as Handler,
  },
  {
    method: "DELETE",
    path: "/api/songs/:id",
    handler: ((_req: Request, { id }: Record<string, string>) => {
      const removed = removeSong(Number(id));
      return removed ? json({ ok: true }) : json({ error: "Not found" }, 404);
    }) as Handler,
  },
  {
    method: "PUT",
    path: "/api/songs/:id",
    handler: ((req: Request, { id }: Record<string, string>) =>
      parseJson<SongUpdate>(req)
        .then((body) => {
          try {
            const updated = updateSong(Number(id), body);
            return updated ? json(updated) : json({ error: "Not found" }, 404);
          } catch (err) {
            return json({ error: errMsg(err) }, 400);
          }
        })
        .catch(() => json({ error: "Invalid request" }, 400))) as Handler,
  },
  {
    method: "PUT",
    path: "/api/songs/:id/play",
    handler: ((_req: Request, { id }: Record<string, string>) => {
      const touched = recordPlay(Number(id));
      return touched ? json({ ok: true }) : json({ error: "Not found" }, 404);
    }) as Handler,
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

          const result = recordBestScore(Number(id), score);
          return result
            ? json({ isNew: result.isNew, bestScore: result.bestScore, lastScore: result.lastScore })
            : json({ error: "Not found" }, 404);
        })
        .catch(() => json({ error: "Invalid request" }, 400))) as Handler,
  },
  {
    method: "PUT",
    path: "/api/songs/:id/track-preferences",
    handler: ((req: Request, { id }: Record<string, string>) =>
      parseJson<{ backgroundTracks?: number[]; mainTrackMuted?: boolean }>(req)
        .then((body) => {
          if (!Array.isArray(body.backgroundTracks) || body.backgroundTracks.some((n) => typeof n !== "number")) {
            return json({ error: "Invalid backgroundTracks" }, 400);
          }
          if (typeof body.mainTrackMuted !== "boolean") {
            return json({ error: "Invalid mainTrackMuted" }, 400);
          }

          const prefs: TrackPreferences = {
            backgroundTracks: body.backgroundTracks,
            mainTrackMuted: body.mainTrackMuted,
          };
          const saved = saveTrackPreferences(Number(id), prefs);
          return saved ? json(saved) : json({ error: "Not found" }, 404);
        })
        .catch(() => json({ error: "Invalid request" }, 400))) as Handler,
  },
];