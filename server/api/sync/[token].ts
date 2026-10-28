import { DRAFT_ORDER, MAX_GAMES, NO_BAN } from '#shared/draft'
import type { SeriesFormat, Side } from '#shared/draft'
import { getChampions } from '../../utils/ddragon'
import { publishChange } from '../../utils/live'

/**
 * Synchro en direct depuis drafter.lol : le favori « Sync Coach », lancé dans l'onglet drafter.lol,
 * lit les 20 cases de la draft et les envoie ici à chaque changement. Pas de cookie depuis drafter.lol :
 * c'est le jeton secret de la série qui autorise l'écriture (route publique, voir server/middleware/auth.ts).
 * Corps (texte JSON, pour éviter une requête préalable) :
 * `{ game, blue: { bans, picks }, red: { bans, picks } }`. Une case = clé numérique Riot (icône de ban), nom du champion
 * (splash de pick, ex. « viktor »), `'none'` (étape passée) ou null (vide).
 */
interface SideSlots { bans: (string | null)[], picks: (string | null)[] }

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, {
    'Access-Control-Allow-Origin': 'https://drafter.lol',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    // Chrome demande cette autorisation quand un site public appelle localhost (tests en local).
    'Access-Control-Allow-Private-Network': 'true',
  })
  if (event.method === 'OPTIONS') return sendNoContent(event)
  if (event.method !== 'POST') throw createError({ statusCode: 405, statusMessage: 'Méthode non autorisée' })

  const token = String(getRouterParam(event, 'token') ?? '')
  const db = useDb()
  const series = db.prepare('SELECT id, format FROM series WHERE sync_token = ? AND sync_token != \'\'').get(token) as { id: number, format: SeriesFormat } | undefined
  if (!series) throw createError({ statusCode: 404, statusMessage: 'Lien de synchro inconnu : régénère le favori' })

  const raw = await readRawBody(event)
  let body: { game?: number, blue?: SideSlots, red?: SideSlots }
  try { body = JSON.parse(raw ?? '{}') }
  catch { throw createError({ statusCode: 400, statusMessage: 'Données illisibles' }) }
  const n = Number(body.game) || 1
  if (n < 1 || n > MAX_GAMES[series.format]) throw createError({ statusCode: 400, statusMessage: 'Numéro de game hors série' })

  // Clé numérique Riot ou nom simplifié (« kaisa », « monkeyking » ou « wukong ») -> id Data Dragon.
  const { champions } = await getChampions()
  const simple = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const byRef = new Map<string, string>()
  for (const c of champions) {
    byRef.set(String(c.key), c.id)
    byRef.set(simple(c.id), c.id)
    byRef.set(simple(c.name), c.id)
  }
  const cell = (side: Side, type: 'ban' | 'pick', slot: number) => {
    const ref = body[side]?.[type === 'ban' ? 'bans' : 'picks']?.[slot]
    if (!ref) return null
    if (ref === 'none') return NO_BAN
    return byRef.get(simple(String(ref))) ?? byRef.get(String(ref)) ?? null
  }

  // Cases dans l'ordre de la draft. Une case vide suivie d'étapes remplies = étape passée (« None »).
  const steps = DRAFT_ORDER.map(s => cell(s.side, s.type, s.slot))
  const lastFilled = steps.findLastIndex(c => c !== null)
  const actions: string[] = []
  for (let i = 0; i <= lastFilled; i++) {
    const champ = steps[i] ?? NO_BAN
    if (champ !== NO_BAN && actions.includes(champ)) break
    actions.push(champ)
  }

  // La game N de drafter.lol = notre game N ; si elle n'existe pas encore, on la crée avec le côté de la précédente.
  let game = db.prepare('SELECT id, actions FROM games WHERE series_id = ? AND n = ?').get(series.id, n) as { id: number, actions: string } | undefined
  if (!game) {
    const prev = db.prepare('SELECT our_side FROM games WHERE series_id = ? ORDER BY n DESC LIMIT 1').get(series.id) as { our_side: Side } | undefined
    const { lastInsertRowid } = db.prepare('INSERT INTO games (series_id, n, our_side) VALUES (?, ?, ?)').run(series.id, n, prev?.our_side ?? 'blue')
    game = { id: Number(lastInsertRowid), actions: '[]' }
  }
  const next = JSON.stringify(actions)
  if (next !== game.actions) {
    db.prepare('UPDATE games SET actions = ? WHERE id = ?').run(next, game.id)
    publishChange('series')
  }
  return { ok: true, game: n, steps: actions.length }
})
