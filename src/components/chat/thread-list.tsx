import Link from 'next/link';
import type { Thread } from '@/lib/qlaud';

export function ThreadList({
  threads,
  activeId,
}: {
  threads: Thread[];
  activeId: string;
}) {
  return (
    <nav className="flex-1 overflow-y-auto px-2 pb-4">
      <ul className="space-y-1">
        {threads.map((t) => {
          const active = t.id === activeId;
          const title =
            (t.metadata as { title?: string } | null)?.title ??
            `Thread · ${new Date(t.created_at).toLocaleDateString()}`;
          return (
            <li key={t.id}>
              <Link
                href={`/chat/${t.id}`}
                className={`block truncate rounded px-3 py-2 text-sm transition-colors ${
                  active
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {title}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
