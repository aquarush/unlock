import { blobEnabled, feeAddress, minter, tokenCategory } from "@/server/config";
import { ok, route } from "@/server/http";

export const GET = route(async () =>
  ok({
    minting: Boolean(minter() && tokenCategory()),
    category: tokenCategory(),
    feeAddress: feeAddress(),
    uploads: blobEnabled(),
  }),
);
