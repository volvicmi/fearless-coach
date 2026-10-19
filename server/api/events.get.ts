import { createEventStream } from 'h3'
import { liveStreams } from '../utils/live'

/**
 * Live channel (Server-Sent Events): the page keeps this connection open and gets a message
 * each time the server publishes a change (see `publishChange`).
 */
export default defineEventHandler(async (event) => {
  const stream = createEventStream(event)
  liveStreams.add(stream)

  // A message every 25 s keeps the connection alive through the reverse proxy (pages ignore it).
  const keepAlive = setInterval(() => stream.push({ event: 'ping', data: 'ok' }).catch(() => {}), 25_000)
  stream.onClosed(() => {
    clearInterval(keepAlive)
    liveStreams.delete(stream)
  })

  return stream.send()
})
