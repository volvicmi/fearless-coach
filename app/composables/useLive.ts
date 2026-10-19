/**
 * Calls `onChange` each time the server says `topic` changed (see server/utils/live.ts).
 * Closes the connection when the page is left.
 */
export function useLive(topic: string, onChange: () => void) {
  if (!import.meta.client) return
  const source = new EventSource('/api/events')
  source.addEventListener(topic, onChange)
  onScopeDispose(() => source.close())
}
