import { gzip } from "node:zlib";
import { promisify } from "node:util";

const gzipAsync = promisify(gzip);

/** Responses smaller than this are sent as-is — gzip overhead plus the CPU
 *  cost isn't worth it for payloads that fit in a couple of TCP segments. */
const COMPRESS_THRESHOLD_BYTES = 1024;

function acceptsGzip(req: Request): boolean {
  const header = req.headers.get("accept-encoding");

  if (header === null) {
    return false;
  }

  return header.split(",").some((entry) => {
    const [name, ...params] = entry.trim().split(";").map((s) => s.trim());
    // `q=0` means the client explicitly refuses the encoding.
    return (
      name === "gzip" &&
      !params.some((p) => p.split("=")[0] === "q" && Number(p.split("=")[1]) <= 0)
    );
  });
}

/** Gzip a JSON API response when the client accepts gzip and the body is
 *  large enough to matter. Returns the response unchanged otherwise. */
export async function maybeCompress(req: Request, res: Response): Promise<Response> {
  if (!acceptsGzip(req)) {
    return res;
  }

  const headers = new Headers(res.headers);
  // Both compressed and plain variants of a gzip-acceptable response must
  // carry Vary so caches don't serve the wrong one.
  headers.set("Vary", "Accept-Encoding");

  const contentLength = headers.get("content-length");
  if (contentLength !== null && Number(contentLength) < COMPRESS_THRESHOLD_BYTES) {
    return new Response(res.body, { status: res.status, headers });
  }

  const body = await res.arrayBuffer();

  if (body.byteLength < COMPRESS_THRESHOLD_BYTES) {
    return new Response(body, { status: res.status, headers });
  }

  const encoded = await gzipAsync(Buffer.from(body));
  headers.set("Content-Encoding", "gzip");
  headers.set("Content-Length", String(encoded.byteLength));

  return new Response(encoded, { status: res.status, headers });
}
