import { ensureBootstrap } from "@/db/bootstrap";
import { jsonOk, withErrorHandling } from "@/lib/http";
import { libraryStats, listSongs } from "@/server/songs-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/songs?categoryId={id} -> Array<Song> ordered by `order` ASC */
export const GET = withErrorHandling(async (request: Request) => {
  await ensureBootstrap();
  const url = new URL(request.url);
  const categoryId = url.searchParams.get("categoryId") ?? undefined;
  const includeStats = url.searchParams.get("stats") === "1";

  const list = await listSongs(categoryId || undefined);
  if (!includeStats) return jsonOk(list);
  return jsonOk({ songs: list, stats: await libraryStats() });
});
