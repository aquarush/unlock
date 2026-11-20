import { put } from "@vercel/blob";
import { blobEnabled } from "@/server/config";
import { HttpError, ok, route } from "@/server/http";
import { randomId, sign } from "@/server/tokens";

export const maxDuration = 60;
const MAX = 4 * 1024 * 1024;

export const POST = route(async (req: Request) => {
  if (!blobEnabled()) throw new HttpError(503, "File uploads are not enabled on this server");
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "No file received");
  if (file.size > MAX) throw new HttpError(413, "Files up to 4 MB are supported");
  const safeName = file.name.replace(/[^\w.\- ]+/g, "_").slice(-80) || "file";
  const blob = await put(`unlock/${randomId(16)}/${safeName}`, file, {
    access: "public",
    addRandomSuffix: true,
    contentType: file.type || "application/octet-stream",
  });
  return ok({
    token: sign("upload", { url: blob.url, name: safeName, size: file.size, type: file.type || "application/octet-stream" }),
    name: safeName,
    size: file.size,
  });
});
