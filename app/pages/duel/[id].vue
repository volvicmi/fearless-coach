<script setup lang="ts">
import { DRAFT_ORDER, MAX_GAMES, otherSide, picksOf, seriesScore } from '#shared/draft'
import type { Side } from '#shared/draft'
import type { DuelVerdict, Game, SeriesDetail } from '#shared/types'

const route = useRoute()
const id = route.params.id as string

const { data, refresh } = await useFetch<SeriesDetail>(`/api/series/${id}`)
if (!data.value) throw createError({ statusCode: 404, statusMessage: 'Série introuvable', fatal: true })
// Une série d'équipe a sa propre page, avec le coach.
if (data.value.series.mode !== 'duel') await navigateTo(`/series/${id}`, { replace: true })

const { champions, byId, iconUrl } = await useChampions()
const nameOf = (champ: string) => byId.value.get(champ)?.name ?? champ
const { patchGame, saved } = useGameSave(data, refresh)

const series = computed(() => data.value!.series)
const games = computed(() => data.value!.games)
const activeN = ref(games.value.at(-1)?.n ?? 1)
const game = computed(() => games.value.find(g => g.n === activeN.value))

const SIDE_OPTIONS: { value: Side, label: string, tone: 'blue' | 'red' }[] = [
  { value: 'blue', label: 'Bleu', tone: 'blue' },
  { value: 'red', label: 'Rouge', tone: 'red' },
]

// Le joueur 1 est le côté `ourSide` de chaque game ; les côtés s'échangent d'une game à l'autre.
const names = computed<Record<Side, string>>(() => {
  const g = game.value
  if (!g) return { blue: series.value.playerA, red: series.value.playerB }
  return { [g.ourSide]: series.value.playerA, [otherSide(g.ourSide)]: series.value.playerB } as Record<Side, string>
})
const champs = computed<Record<Side, string[]>>(() => ({
  blue: picksOf(game.value?.actions ?? [], 'blue'),
  red: picksOf(game.value?.actions ?? [], 'red'),
}))
const winnerOf = (g: Game) => (g.winner === g.ourSide ? series.value.playerA : series.value.playerB)

const score = computed(() => seriesScore(series.value.format, games.value))
const seriesWinnerName = computed(() => (score.value.winner === 'a' ? series.value.playerA : series.value.playerB))
const complete = computed(() => (game.value?.actions.length ?? 0) >= DRAFT_ORDER.length)
const started = computed(() => (game.value?.actions.length ?? 0) > 0)
// La game suivante s'ouvre une fois la précédente départagée, tant que la série n'est pas jouée.
const canNextGame = computed(() =>
  !score.value.winner && games.value.length < MAX_GAMES[series.value.format] && !!games.value.at(-1)?.winner)

async function nextGame() {
  // Les côtés s'échangent ; ils restent modifiables avant le premier ban.
  const prev = games.value.at(-1)
  const ourSide: Side = prev ? otherSide(prev.ourSide) : 'blue'
  await $fetch(`/api/series/${id}/games`, { method: 'POST', body: { ourSide } })
  await refresh()
  activeN.value = games.value.at(-1)!.n
}

// --- Verdict de l'IA ---
const judging = ref(false)
const judgeError = ref('')

async function judge(force = false) {
  const g = game.value
  if (!g || judging.value || g.actions.length < DRAFT_ORDER.length) return
  judging.value = true
  judgeError.value = ''
  try {
    await saved() // le serveur lit la draft en base : le dernier pick doit y être enregistré
    const verdict = await $fetch<DuelVerdict>('/api/duel/judge', { method: 'POST', body: { gameId: g.id, force } })
    data.value = { ...data.value!, games: games.value.map(x => (x.id === g.id ? { ...x, verdict, winner: verdict.winner } : x)) }
  }
  catch (e: any) {
    judgeError.value = e?.data?.statusMessage ?? 'L’IA est indisponible pour le moment'
  }
  finally {
    judging.value = false
  }
}

// Le verdict part tout seul à la fin de la draft, une fois par game : une erreur ne boucle pas, le bouton réessaie.
const attempted = new Set<number>()
watch(
  () => {
    const g = game.value
    return g && g.actions.length >= DRAFT_ORDER.length && !g.verdict && !g.winner ? g.id : null
  },
  (gameId) => {
    if (gameId === null) {
      attempted.clear() // draft rouverte (annulation) ou autre game : elle sera rejugée
      judgeError.value = ''
      return
    }
    if (import.meta.client && !attempted.has(gameId)) {
      attempted.add(gameId)
      judge()
    }
  },
  { immediate: true },
)
</script>

<template>
  <div v-if="data" class="flex flex-col gap-5">
    <!-- En-tête : la série et le score -->
    <header class="flex flex-wrap items-center gap-x-8 gap-y-3">
      <div class="min-w-0">
        <p class="flex items-center gap-2 text-xs text-zinc-500">
          <span class="rounded bg-violet-400/15 px-1.5 py-0.5 font-medium text-violet-300">Duel 1v1</span>
          {{ series.format }} · {{ series.fearless === 'off' ? 'Draft normale' : 'Fearless' }}
        </p>
        <h1 class="mt-1 truncate text-2xl font-semibold">
          {{ series.name }}
        </h1>
      </div>
      <div class="ml-auto flex items-center gap-4" aria-label="Score de la série">
        <span class="font-semibold text-amber-300">{{ series.playerA }}</span>
        <span class="text-3xl font-bold tabular-nums">{{ score.a }}<span class="px-1 text-zinc-600">–</span>{{ score.b }}</span>
        <span class="font-semibold text-violet-300">{{ series.playerB }}</span>
      </div>
    </header>

    <div v-if="score.winner" class="rounded-xl border border-amber-400/40 bg-amber-400/5 px-4 py-3 text-sm">
      <span class="font-semibold text-amber-300">Série terminée</span>
      · {{ seriesWinnerName }} remporte la série {{ score.a }}–{{ score.b }}.
    </div>

    <nav class="flex flex-wrap items-center gap-1.5" aria-label="Games de la série">
      <button
        v-for="g in games"
        :key="g.id"
        type="button"
        class="flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-sm"
        :class="g.n === activeN ? 'bg-zinc-100 text-zinc-950' : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800'"
        @click="activeN = g.n"
      >
        G{{ g.n }}
        <span
          v-if="g.winner"
          class="size-2 rounded-full"
          :class="g.winner === g.ourSide ? 'bg-amber-400' : 'bg-violet-400'"
          :title="`${winnerOf(g)} a mieux drafté`"
        />
      </button>
      <button
        v-if="canNextGame"
        type="button"
        class="cursor-pointer rounded-md border border-dashed border-zinc-700 px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-100"
        @click="nextGame"
      >
        + Game suivante
      </button>
    </nav>

    <template v-if="game">
      <!-- Les côtés se choisissent avant le premier ban -->
      <div v-if="!started" class="flex flex-wrap items-center gap-3 text-sm">
        <span><span class="font-medium text-amber-300">{{ series.playerA }}</span> joue</span>
        <SegmentedControl
          :model-value="game.ourSide"
          :options="SIDE_OPTIONS"
          @update:model-value="(s: Side) => patchGame(game!, { ourSide: s })"
        />
        <span class="text-zinc-500">· <span class="text-violet-300">{{ series.playerB }}</span> prend l’autre côté</span>
      </div>

      <DraftBoard
        :key="game.id"
        :game="game"
        :games="games"
        :fearless="series.fearless"
        :champions="champions"
        :icon-url="iconUrl"
        :name-of="nameOf"
        :labels="names"
        :confirm-undo="game.verdict ? 'Annuler un pick efface le verdict de l’IA : il faudra le redemander. Continuer ?' : undefined"
        @update="actions => patchGame(game!, { actions }, { winner: null, verdict: null })"
      />

      <!-- Fin de draft : l'IA départage -->
      <section v-if="complete" aria-live="polite" class="flex flex-col gap-3">
        <div v-if="judging" class="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-5 text-sm text-zinc-300">
          <span class="size-4 animate-spin rounded-full border-2 border-zinc-600 border-t-amber-400" />
          L’IA compare les deux drafts… quelques secondes.
        </div>

        <template v-else-if="game.verdict">
          <DuelVerdict :verdict="game.verdict" :names="names" :champs="champs" :icon-url="iconUrl" :name-of="nameOf" />
          <div class="flex justify-end">
            <button type="button" class="cursor-pointer text-xs text-zinc-500 hover:text-zinc-200" @click="judge(true)">
              Refaire le verdict
            </button>
          </div>
        </template>

        <div v-else class="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <p v-if="judgeError" class="text-sm text-red-400" role="alert">
            {{ judgeError }}
          </p>
          <p v-else-if="game.winner" class="text-sm text-zinc-300">
            Gagnant désigné à la main : <span class="font-semibold">{{ names[game.winner] }}</span>.
          </p>
          <p v-else class="text-sm text-zinc-400">
            La draft est terminée : l’IA peut maintenant dire qui a le mieux drafté.
          </p>
          <div class="flex flex-wrap items-center gap-2">
            <button
              type="button"
              class="cursor-pointer rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300"
              @click="judge()"
            >
              {{ judgeError ? 'Réessayer' : 'Demander le verdict de l’IA' }}
            </button>
            <span class="ml-2 text-xs text-zinc-500">ou départager à la main :</span>
            <button
              v-for="s in SIDE_OPTIONS"
              :key="s.value"
              type="button"
              class="cursor-pointer rounded-md border px-3 py-1.5 text-sm"
              :class="game.winner === s.value
                ? (s.value === 'blue' ? 'border-side-blue bg-side-blue text-white' : 'border-side-red bg-side-red text-white')
                : 'border-zinc-700 text-zinc-300 hover:bg-zinc-800'"
              @click="patchGame(game!, { winner: game.winner === s.value ? null : s.value })"
            >
              {{ names[s.value] }}
            </button>
          </div>
        </div>
      </section>

      <FearlessLocks :fearless="series.fearless" :games="games" :game="game" :icon-url="iconUrl" :name-of="nameOf" />
    </template>
  </div>
</template>
