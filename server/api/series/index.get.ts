import type { GameResult } from '#shared/types'

export default defineEventHandler(() => {
  const db = useDb()
  const rows = db.prepare(`
    SELECT s.*, COUNT(g.id) AS game_count
    FROM series s LEFT JOIN games g ON g.series_id = s.id
    GROUP BY s.id ORDER BY s.id DESC
  `).all()

  // Résultat de chaque game vu du joueur A, pour les cartes de l'accueil (une seule requête pour toutes les séries).
  const games = db.prepare('SELECT series_id, our_side, winner FROM games ORDER BY series_id, n').all() as
    { series_id: number, our_side: string, winner: string | null }[]
  const results = new Map<number, GameResult[]>()
  for (const g of games) {
    const list = results.get(g.series_id) ?? []
    list.push(g.winner ? (g.winner === g.our_side ? 'a' : 'b') : null)
    results.set(g.series_id, list)
  }

  return rows.map(row => ({ ...toSeries(row), results: results.get((row as any).id) ?? [] }))
})
