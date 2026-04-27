'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { SearchHit } from '@/lib/qlaud';

// Sidebar search box. Hits /api/search (qlaud /v1/search semantic over
// the user's own thread history).
export function SearchBar() {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [busy, setBusy] = useState(false);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) {
      setHits([]);
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (!r.ok) {
        setHits([]);
        return;
      }
      const j = (await r.json()) as { data: SearchHit[] };
      setHits(j.data ?? []);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <form onSubmit={run}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search conversations…"
          className="w-full rounded border border-border bg-muted px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </form>
      {busy && <p className="px-1 text-xs text-muted-foreground">Searching…</p>}
      {hits.length > 0 && (
        <ul className="space-y-1 rounded border border-border bg-background/50 p-1">
          {hits.map((h) => (
            <li key={`${h.thread_id}-${h.seq}`}>
              <Link
                href={`/chat/${h.thread_id}`}
                onClick={() => {
                  setQ('');
                  setHits([]);
                }}
                className="block rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <span className="line-clamp-2">{h.snippet}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
