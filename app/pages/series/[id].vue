<script setup lang="ts">
import { MAX_GAMES, fearlessLocked, otherSide } from '#shared/draft'
import type { Side } from '#shared/draft'
import type { CoachContext } from '#shared/coach'
import type { Game, Player, SeriesDetail } from '#shared/types'

const route = useRoute()
const id = route.params.id as string

const { data, refresh } = await useFetch<SeriesDetail>(`/api/series/${id}`)
if (!data.value) throw createError({ statusCode: 404, statusMessage: 'Series not found', fatal: true })

const { champions, byId, iconUrl } = await useChampions()
const nameOf = (champ: string) => byId.value.get(champ)?.name ?? champ
const { data: team } = await useFetch<Player[]>('/api/team')

const activeN = ref(data.value.games.at(-1)?.n ?? 1)
const game = computed(() => data.value?.games.find(g => g.n === activeN.value))
const series = computed(() => data.value!.series)
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

/** Champions locked for both teams in the active game, grouped by the game that burned them. */
const lockedByGame = computed(() => {
  const g = game.value
  if (!g) return []
  const groups = new Map<number, string[]>()
  for (const [champ, n] of fearlessLocked(series.value.fearless, data.value!.games, g)) {
    groups.set(n, [...(groups.get(n) ?? []), champ])
  }
  return [...groups].map(([n, champs]) => ({ n, champs }))
})

const coachCtx = computed<CoachContext | undefined>(() => game.value && {
  game: game.value,
  games: data.value!.games,
  fearless: series.value.fearless,
  format: series.value.format,
  team: team.value ?? [],
  champions: champions.value,
})

/** Saves run one after another so fast clicks + undo reach the server in the right order. */
let saveQueue: Promise<unknown> = Promise.resolve()

function patchGame(g: Game, body: Partial<Pick<Game, 'actions' | 'winner' | 'ourSide'>>) {
  // Optimistic: the board must react instantly during a live draft.
  // useFetch data is a shallowRef, so swap in a new object instead of mutating.
  const next = { ...g, ...body }
  data.value = { ...data.value!, games: data.value!.games.map(x => (x.id === g.id ? next : x)) }
  saveQueue = saveQueue
    .then(() => $fetch(`/api/games/${g.id}`, { method: 'PUT', body }))
    .catch(() => refresh()) // server refused: resync with what is actually stored
}

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
        <h1 class="text-xl font-semibold">
          {{ series.name }}
        </h1>
        <p class="text-sm text-zinc-400">
          vs {{ series.opponent || '?' }} · {{ series.format }} ·
          {{ series.fearless === 'off' ? 'Normal draft' : 'Fearless' }} ·
          <span class="font-semibold text-zinc-200">{{ score.us }} – {{ score.them }}</span>
        </p>
      </div>

      <nav class="ml-auto flex items-center gap-1">
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
            {{ g.winner === g.ourSide ? 'W' : 'L' }}
          </span>
        </button>
        <button
          v-if="canAddGame"
          type="button"
          class="rounded-md border border-dashed border-zinc-700 px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-100"
          @click="nextGame"
        >
          + Next game
        </button>
      </nav>
    </div>

    <template v-if="game">
      <div class="flex flex-wrap items-center gap-3 text-sm">
        <span class="text-zinc-400">We are</span>
        <button
          v-for="s in (['blue', 'red'] as const)"
          :key="s"
          type="button"
          class="rounded-md px-3 py-1 capitalize"
          :class="game.ourSide === s ? (s === 'blue' ? 'bg-side-blue' : 'bg-side-red') : 'bg-zinc-900 text-zinc-400'"
          :disabled="game.actions.length > 0"
          :title="game.actions.length ? 'Undo the whole draft to change sides' : undefined"
          @click="patchGame(game, { ourSide: s })"
        >
          {{ s }}
        </button>

        <span class="ml-6 text-zinc-400">Winner</span>
        <button
          v-for="s in (['blue', 'red'] as const)"
          :key="`w-${s}`"
          type="button"
          class="rounded-md px-3 py-1 capitalize"
          :class="game.winner === s ? 'bg-emerald-600' : 'bg-zinc-900 text-zinc-400 hover:text-zinc-100'"
          @click="patchGame(game, { winner: game.winner === s ? null : s })"
        >
          {{ s }}
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

      <section v-if="series.fearless !== 'off'" class="rounded-lg border border-zinc-800 p-3">
        <h3 class="mb-2 text-sm font-semibold">
          Locked by Fearless
          <span class="font-normal text-zinc-500">· both teams ({{ lockedByGame.reduce((n, g) => n + g.champs.length, 0) }})</span>
        </h3>
        <p v-if="!lockedByGame.length" class="text-xs text-zinc-500">
          Nothing locked yet: picks from this game get locked from the next one.
        </p>
        <div v-for="group in lockedByGame" :key="group.n" class="flex items-center gap-2 py-0.5">
          <span class="w-7 text-xs text-zinc-500">G{{ group.n }}</span>
          <div class="flex flex-wrap gap-1">
            <img
              v-for="champ in group.champs"
              :key="champ"
              :src="iconUrl(champ)"
              :alt="nameOf(champ)"
              :title="nameOf(champ)"
              class="size-8 rounded grayscale"
            >
          </div>
        </div>
      </section>
    </template>
  </div>
</template>
