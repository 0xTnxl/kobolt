import { NextRequest } from "next/server";
import { getPortfolio } from "@/lib/portfolio";
import { AppError, ok, route } from "@/lib/errors";

export const dynamic = "force-dynamic";

export const GET = route(async (_req: NextRequest, ctx: { params: Promise<{ handle: string }> }) => {
  const { handle } = await ctx.params;
  const p = await getPortfolio(handle);
  if (!p) throw new AppError("NOT_FOUND", "Creator not found", "check_handle", 404);
  return ok(p);
});
