import { HttpError, ok, route } from "@/server/http";
import { getListing } from "@/server/listings";
import { makeQuote } from "@/server/quote";

export const GET = route(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const listing = await getListing(id);
  if (!listing) throw new HttpError(404, "This item does not exist");
  return ok(await makeQuote(listing));
});
