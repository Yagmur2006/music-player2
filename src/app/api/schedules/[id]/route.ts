import { ensureBootstrap } from "@/db/bootstrap";
import { requireAdmin } from "@/lib/auth";
import { jsonOk, withErrorHandling } from "@/lib/http";
import { deleteSchedule, getScheduleById, updateSchedule } from "@/server/schedule-service";

type RouteContext = { params: Promise<{ id: string }> };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/schedules/:id (Admin) */
export const GET = withErrorHandling(async (request: Request, context: RouteContext) => {
  await ensureBootstrap();
  await requireAdmin(request);
  const { id } = await context.params;
  return jsonOk(await getScheduleById(id));
});

async function patchSchedule(request: Request, context: RouteContext): Promise<Response> {
  await ensureBootstrap();
  await requireAdmin(request);
  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  return jsonOk(
    await updateSchedule(id, {
      time: body.time,
      categoryId: body.categoryId,
      enabled: body.enabled,
    }),
  );
}

/** PUT/PATCH /api/schedules/:id (Admin) -> edit future schedule runs. */
export const PATCH = withErrorHandling(patchSchedule);
export const PUT = withErrorHandling(patchSchedule);

/** DELETE /api/schedules/:id (Admin) -> affects future runs only. */
export const DELETE = withErrorHandling(async (request: Request, context: RouteContext) => {
  await ensureBootstrap();
  await requireAdmin(request);
  const { id } = await context.params;
  return jsonOk(await deleteSchedule(id));
});
