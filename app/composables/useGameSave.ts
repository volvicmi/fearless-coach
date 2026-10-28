import type { Game, SeriesDetail } from '#shared/types'

/**
 * Sauvegarde des games d'une série. L'écran réagit tout de suite (mise à jour optimiste) ; les envois au serveur
 * partent l'un après l'autre pour que clics rapides et annulations arrivent dans le bon ordre.
 */
export function useGameSave(data: Ref<SeriesDetail | null | undefined>, refresh: () => Promise<void>) {
  let queue: Promise<unknown> = Promise.resolve()

  /** `body` part au serveur ; `local` ne change que l'affichage (ce que le serveur recalcule lui-même). */
  function patchGame(g: Game, body: Partial<Pick<Game, 'actions' | 'winner' | 'ourSide' | 'enemyRoles'>>, local: Partial<Game> = {}) {
    // useFetch renvoie un shallowRef : on remplace l'objet au lieu de le modifier.
    const next = { ...g, ...body, ...local }
    data.value = { ...data.value!, games: data.value!.games.map(x => (x.id === g.id ? next : x)) }
    queue = queue
      .then(() => $fetch(`/api/games/${g.id}`, { method: 'PUT', body, headers: duelHeaders(g.seriesId) }))
      .catch(() => refresh()) // le serveur a refusé : on reprend ce qui est réellement enregistré
  }

  /** Attend que tout ce qui a été saisi soit enregistré. */
  const saved = () => queue

  return { patchGame, saved }
}
