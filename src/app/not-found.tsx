import Link from "next/link";

export default function NotFound() {
  return (
    <div className="center-page">
      <h1>🔒 Nothing here</h1>
      <p className="muted">This item doesn&apos;t exist or was removed.</p>
      <Link className="btn btn-primary" href="/">Sell something →</Link>
    </div>
  );
}
