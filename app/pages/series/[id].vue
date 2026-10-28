<script setup lang="ts">
import { MAX_GAMES, otherSide } from '#shared/draft'
import type { Side } from '#shared/draft'
import type { CoachContext } from '#shared/coach'
import type { Combo, Player, ProMeta, SeriesDetail } from '#shared/types'

const route = useRoute()
const id = route.params.id as string

const { data, refresh } = await useFetch<SeriesDetail>(`/api/series/${id}`)
if (!data.value) throw createError({ statusCode: 404, statusMessage: 'Série introuvable', fatal: true })
// Un duel a sa propre page : pas de coach IA, un verdict à la fin.
if (data.value.series.mode === 'duel') await navigateTo(`/duel/${id}`, { replace: true })
const { patchGame } = useGameSave(data, refresh)
// Draft changed in another browser: reload the series (see server/utils/live.ts)
useLive('series', () => refresh())

const { champions, byId, iconUrl } = await useChampions()
const nameOf = (champ: string) => byId.value.get(champ)?.name ?? champ
const { data: team } = await useFetch<Player[]>('/api/team')
const { data: pro } = await useFetch<{ meta: ProMeta }>('/api/pro')
const { data: combos } = await useFetch<Combo[]>('/api/combos')

const activeN = ref(data.value.games.at(-1)?.n ?? 1)
// Une nouvelle game arrive (synchro drafter.lol ou autre navigateur) : on l'affiche.
watch(() => data.value?.games.at(-1)?.n, (n, before) => { if (n && before && n > before) activeN.value = n })
const game = computed(() => data.value?.games.find(g => g.n === activeN.value))
const series = computed(() => data.value!.series)
const SIDE_LABEL: Record<Side, string> = { blue: 'Bleu', red: 'Rouge' }
const canAddGame = computed(() => data.value!.games.length < MAX_GAMES[series.value.format])

const score = computed(() => {
  let us = 0
  let them = 0
  for (const g of data.value!.games) {
    if (!g.winner) continue
    if (g.winner === g.ourSide) us++
    else them++
  }
  return { us, them }
})

const coachCtx = computed<CoachContext | undefined>(() => game.value && {
  game: game.value,
  games: data.value!.games,
  fearless: series.value.fearless,
  format: series.value.format,
  team: team.value ?? [],
  champions: champions.value,
  pro: pro.value?.meta,
  combos: combos.value ?? [],
  opponent: series.value.opponent,
})

async function nextGame() {
  // Default: the loser of the previous game usually picks side; start on the opposite side, editable below.
  const prev = data.value!.games.at(-1)
  const ourSide: Side = prev ? otherSide(prev.ourSide) : 'blue'
  await $fetch(`/api/series/${id}/games`, { method: 'POST', body: { ourSide } })
  await refresh()
  activeN.value = data.value!.games.at(-1)!.n
}
</script>

<template>
  <div v-if="data" class="flex flex-col gap-5">
    <div class="flex flex-wrap items-center gap-4">
      <div>
        <h1 class="text-3xl font-bold">
          {{ series.name }}
        </h1>
        <p class="text-sm text-zinc-400">
          vs {{ series.opponent || '?' }} · {{ series.format }} ·
          {{ series.fearless === 'off' ? 'Draft normale' : 'Fearless' }} ·
          <span class="font-display text-lg font-bold tabular-nums text-amber-300">{{ score.us }} – {{ score.them }}</span>
        </p>
      </div>

      <nav class="ml-auto flex items-center gap-1">
        <DrafterSync :series-id="series.id" class="mr-2" />
        <button
          v-for="g in data.games"
          :key="g.id"
          type="button"
          class="rounded-md px-3 py-1.5 text-sm"
          :class="g.n === activeN ? 'bg-zinc-100 text-zinc-950' : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800'"
          @click="activeN = g.n"
        >
          G{{ g.n }}
          <span v-if="g.winner" :class="g.winner === g.ourSide ? 'text-emerald-500' : 'text-red-500'">
            {{ g.winner === g.ourSide ? 'V' : 'D' }}
          </span>
        </button>
        <button
          v-if="canAddGame"
          type="button"
          class="px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-100 bg-zinc-900 hover:bg-zinc-800"
          @click="nextGame"
        >
          + Game suivante
        </button>
      </nav>
    </div>

    <template v-if="game">
      <div class="flex flex-wrap items-center gap-3 text-sm">
        <span class="text-zinc-400">Nous sommes</span>
        <button
          v-for="s in (['blue', 'red'] as const)"
          :key="s"
          type="button"
          class="rounded-md px-3 py-1 capitalize"
          :class="game.ourSide === s ? (s === 'blue' ? 'bg-side-blue' : 'bg-side-red') : 'cursor-pointer bg-zinc-900 text-zinc-400 hover:text-zinc-100'"
          title="Change notre côté à tout moment : la draft reste, seul notre côté change"
          @click="game.ourSide !== s && patchGame(game, { ourSide: s })"
        >
          {{ SIDE_LABEL[s] }}
        </button>

        <span class="ml-6 text-zinc-400">Gagnant</span>
        <button
          v-for="s in (['blue', 'red'] as const)"
          :key="`w-${s}`"
          type="button"
          class="rounded-md px-3 py-1 capitalize"
          :class="game.winner === s ? 'bg-emerald-600' : 'bg-zinc-900 text-zinc-400 hover:text-zinc-100'"
          @click="patchGame(game, { winner: game.winner === s ? null : s })"
        >
          {{ SIDE_LABEL[s] }}
        </button>
      </div>

      <!-- Wide screens: coach in a side column so it stays visible during the draft -->
      <div class="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <DraftBoard
          :key="game.id"
          :game="game"
          :games="data.games"
          :fearless="series.fearless"
          :champions="champions"
          :icon-url="iconUrl"
          :name-of="nameOf"
          @update="actions => patchGame(game!, { actions })"
          @roles="pickRoles => patchGame(game!, { pickRoles })"
        />

        <CoachPanel
          v-if="coachCtx"
          :key="`coach-${game.id}`"
          :ctx="coachCtx"
          :game-id="game.id"
          :icon-url="iconUrl"
          :name-of="nameOf"
          @play="champ => patchGame(game!, { actions: [...game!.actions, champ] })"
        />
      </div>

      <FearlessLocks :fearless="series.fearless" :games="data.games" :game="game" :icon-url="iconUrl" :name-of="nameOf" />
    </template>
  </div>
</template>
