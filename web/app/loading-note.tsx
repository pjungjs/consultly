/**
 * A loading line that explains itself when it takes a while: the free API server sleeps when idle and needs up
 * to a minute to wake, which otherwise looks like a stuck page. The second line appears after 5 seconds through a
 * CSS animation, not a timer: placeholders shown while the server streams a page don't run browser code.
 */
export default function LoadingNote({ label = "Loading…" }: { label?: string }) {
  return (
    <div role="status" className="loading-note space-y-1">
      <p className="text-muted">{label}</p>
      <p className="loading-note-slow text-sm text-muted">
        The server is in sleep mode and starting up now. This can take up to a minute.
      </p>
    </div>
  );
}
