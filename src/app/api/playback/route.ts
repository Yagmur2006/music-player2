import { ensureBootstrap } from "@/db/bootstrap";
import { badRequest, jsonOk, requireString, withErrorHandling } from "@/lib/http";
import { getPlaybackState, reportPlaybackProgress } from "@/server/playback-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET /api/playback -> the immutable scheduled playlist and current server state. */
export const GET = withErrorHandling(async () => {
  await ensureBootstrap();
  return jsonOk(await getPlaybackState());
});

/**
 * PATCH /api/playback -> position report from the existing public player.
 * It can move within the current snapshot but cannot replace it or start a schedule.
 */
export const PATCH = withErrorHandling(async (request: Request) => {
  await ensureBootstrap();
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const executionId = requireString(body.executionId, "executionId", 36);
  if (!UUID_PATTERN.test(executionId)) throw badRequest("executionId must be a valid UUID");
  if (typeof body.currentIndex !== "number") {
    throw badRequest("currentIndex must be a non-negative integer");
  }

  return jsonOk(
    await reportPlaybackProgress({
      executionId,
      currentIndex: body.currentIndex,
    }),
  );
});
