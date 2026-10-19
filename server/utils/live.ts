import type { EventStream } from 'h3'

/**
 * Open live connections, one per browser tab. The app runs as a single server process,
 * so keeping them in memory is enough (no Redis needed).
 */
export const liveStreams = new Set<EventStream>()

/** Tells every open page that `topic` changed, so it reloads the data it shows. */
export function publishChange(topic: string) {
  for (const stream of liveStreams) {
    stream.push({ event: topic, data: 'changed' }).catch(() => liveStreams.delete(stream))
  }
}
