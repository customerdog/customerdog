'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Live preview iframe for the embed widget. Listens for the
 * `customerdog:close` postMessage that the in-iframe close button
 * fires — without this, the close button appears broken in the admin
 * preview because the parent page (admin/embed) has no widget.js
 * bootstrap listening for the message.
 *
 * On close: hide the iframe and show a small "Preview closed" panel
 * with a "Reopen" button that re-mounts the iframe (resetting it so
 * the operator can preview the open-state UX again).
 */
export function PreviewIframe({ src, title }: { src: string; title: string }) {
  const [open, setOpen] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      // Only listen to messages from our own origin (the iframe's src)
      try {
        if (new URL(src).origin !== ev.origin) return;
      } catch {
        return;
      }
      const data = ev.data as { type?: string } | null;
      if (data && data.type === 'customerdog:close') {
        setOpen(false);
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [src]);

  if (!open) {
    return (
      <div className="flex h-[600px] w-full max-w-[400px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-background text-center">
        <p className="text-sm text-muted-foreground">
          Preview closed — that&apos;s what visitors see when they click ×.
        </p>
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setReloadKey((k) => k + 1);
          }}
          className="mt-3 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Reopen preview
        </button>
      </div>
    );
  }

  return (
    <iframe
      key={reloadKey}
      ref={iframeRef}
      src={src}
      title={title}
      className="block h-[600px] w-full max-w-[400px] rounded-xl border border-border bg-background shadow-md"
    />
  );
}
