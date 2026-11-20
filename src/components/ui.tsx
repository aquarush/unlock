"use client";
import qrcode from "qrcode-generator";
import { useMemo, useState, type ReactNode } from "react";

export function Qr({ value, size = 200 }: { value: string; size?: number }) {
  const svg = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(value);
    qr.make();
    return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  }, [value]);
  return <div className="qr" style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: svg }} />;
}

export function CopyButton({ text, label = "Copy", className = "btn btn-ghost btn-sm" }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          const t = document.createElement("textarea");
          t.value = text;
          document.body.appendChild(t);
          t.select();
          document.execCommand("copy");
          t.remove();
        }
        setDone(true);
        setTimeout(() => setDone(false), 1400);
      }}
    >
      {done ? "Copied ✓" : label}
    </button>
  );
}

export function Spinner() {
  return <span className="spinner" aria-hidden />;
}

export function Notice({ tone = "info", children }: { tone?: "info" | "error" | "ok"; children: ReactNode }) {
  return <div className={`notice notice-${tone}`}>{children}</div>;
}

export const shortAddr = (a: string) => {
  const s = a.replace(/^[a-z]+:/, "");
  return `${s.slice(0, 6)}…${s.slice(-5)}`;
};

export function Cover({ emoji, hue, size = "lg" }: { emoji: string; hue: number; size?: "sm" | "lg" }) {
  return (
    <div
      className={`cover cover-${size}`}
      style={{ background: `radial-gradient(120% 120% at 20% 10%, hsl(${hue} 90% 62%), hsl(${(hue + 40) % 360} 80% 38%) 60%, hsl(${(hue + 80) % 360} 70% 18%))` }}
    >
      <span>{emoji}</span>
    </div>
  );
}

export function timeAgo(ts: number) {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
