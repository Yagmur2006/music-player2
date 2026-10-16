import { ensureBootstrap } from "@/db/bootstrap";
import { requireAdmin } from "@/lib/auth";
import { jsonOk, withErrorHandling } from "@/lib/http";
import { createSchedule, listSchedules } from "@/server/schedule-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/schedules (Admin) -> schedules ordered by HH:mm. */
export const GET = withErrorHandling(async (request: Request) => {
  await ensureBootstrap();
  await requireAdmin(request);
  return jsonOk(await listSchedules());
});

/** POST /api/schedules (Admin) -> create a daily HH:mm schedule. */
export const POST = withErrorHandling(async (request: Request) => {
  await ensureBootstrap();
  await requireAdmin(request);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const schedule = await createSchedule({
    time: body.time,
    categoryId: body.categoryId,
    enabled: body.enabled,
  });
  return jsonOk(schedule, 201);
});
