export default defineEventHandler(() => {
  const rows = useDb().prepare(`
    SELECT s.*, COUNT(g.id) AS game_count
    FROM series s LEFT JOIN games g ON g.series_id = s.id
    GROUP BY s.id ORDER BY s.id DESC
  `).all()
  return rows.map(toSeries)
})
