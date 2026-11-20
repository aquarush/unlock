"use client";
import type { Secret } from "@/lib/api";
import { CopyButton } from "./ui";

export function SecretView({ secret, title }: { secret: Secret; title: string }) {
  return (
    <div className="secret">
      {secret.file && (
        <a className="btn btn-primary btn-lg full" href={secret.file.url} download={secret.file.name} target="_blank" rel="noreferrer">
          ⬇️ Download {secret.file.name} <span className="muted">({Math.ceil(secret.file.size / 1024)} KB)</span>
        </a>
      )}
      {secret.url && (
        <a className="btn btn-primary btn-lg full" href={secret.url} target="_blank" rel="noreferrer noopener">
          🔗 Open your link
        </a>
      )}
      {secret.text && (
        <div className="secret-text">
          <div className="secret-text-head">
            <span className="tiny muted">{title}</span>
            <CopyButton text={secret.text} />
          </div>
          <pre>{secret.text}</pre>
        </div>
      )}
    </div>
  );
}
