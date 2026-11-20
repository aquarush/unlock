import { ok, route } from "@/server/http";
import { getListing, listedIds, publicListing, recentSales, stats } from "@/server/listings";

export const GET = route(async () => {
  const [sales, totals, ids] = await Promise.all([recentSales(12), stats(), listedIds(24)]);
  const listings = (await Promise.all([...new Set(ids)].map(getListing)))
    .filter((l): l is NonNullable<typeof l> => Boolean(l))
    .sort((a, b) => b.sales - a.sales || b.createdAt - a.createdAt)
    .slice(0, 9)
    .map(publicListing);
  return ok({ sales, totals, listings });
});
