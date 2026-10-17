import type { ChampionsResponse } from '#shared/types'

export async function useChampions() {
  const { data } = await useFetch<ChampionsResponse>('/api/champions', { key: 'champions' })

  const champions = computed(() => data.value?.champions ?? [])
  const byId = computed(() => new Map(champions.value.map(c => [c.id, c])))
  const iconUrl = (id: string) =>
    data.value ? `https://ddragon.leagueoflegends.com/cdn/${data.value.version}/img/champion/${id}.png` : ''

  return { champions, byId, iconUrl, version: computed(() => data.value?.version) }
}
