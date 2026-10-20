<script setup lang="ts">
import { DRAFT_ORDER, MAX_GAMES, otherSide, picksOf, seriesScore } from '#shared/draft'
// duelHeaders / saveDuelToken come from app/composables/duelSeat.ts (auto-imported)
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

// --- Sièges : chaque navigateur est le joueur A, le joueur B, ou un spectateur (jeton dans localStorage) ---
interface SeatInfo { mySeat: 'a' | 'b' | null, a: { name: string, taken: boolean }, b: { name: string, taken: boolean } }
const seats = ref<SeatInfo | null>(null)
const spectating = ref(false)
const claimName = ref('')
const claimError = ref('')
const myName = ref('')

async function loadSeats() {
  seats.value = await $fetch<SeatInfo>(`/api/duel/${id}/seats`, { headers: duelHeaders(id) })
  if (seats.value.mySeat) myName.value = seats.value[seats.value.mySeat].name
}
onMounted(() => {
  spectating.value = localStorage.getItem(`duel-spectate-${id}`) === '1'
  loadSeats()
})
// The other player (or another browser) changed the draft or a seat: reload (see server/utils/live.ts)
useLive('series', () => {
  refresh()
  loadSeats()
})

const mySeat = computed(() => seats.value?.mySeat ?? null)
const showSeatPopup = computed(() => !!seats.value && !mySeat.value && !spectating.value)
/** Side this browser plays in the current game (null for a spectator). */
const mySide = computed<Side | null>(() => {
  const g = game.value
  if (!g || !mySeat.value) return null
  return mySeat.value === 'a' ? g.ourSide : otherSide(g.ourSide)
})
/** Side whose turn it is (the next step of the draft). */
const sideToAct = computed<Side | null>(() => DRAFT_ORDER[game.value?.actions.length ?? 0]?.side ?? null)
const canPlay = computed(() => !!mySide.value && sideToAct.value === mySide.value)

async function claimSeat(seat: 'a' | 'b') {
  claimError.value = ''
  try {
    const { token } = await $fetch<{ token: string }>(`/api/duel/${id}/claim`, {
      method: 'POST',
      body: { seat, name: claimName.value.trim() || seats.value![seat].name },
    })
    saveDuelToken(id, token)
    localStorage.removeItem(`duel-spectate-${id}`)
    await loadSeats()
  }
  catch (e: any) {
    claimError.value = e?.data?.statusMessage ?? 'Impossible de prendre ce siège'
    await loadSeats()
  }
}
function watchOnly() {
  localStorage.setItem(`duel-spectate-${id}`, '1')
  spectating.value = true
}
function takeSeat() {
  localStorage.removeItem(`duel-spectate-${id}`)
  spectating.value = false
}
async function rename() {
  const name = myName.value.trim()
  if (!name || !mySeat.value) return
  await $fetch(`/api/duel/${id}/name`, { method: 'PUT', body: { name }, headers: duelHeaders(id) })
  await refresh()
  await loadSeats()
}

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
        <label v-if="mySeat" class="mt-2 flex items-center gap-2 text-sm text-zinc-400">
          Tu es
          <input v-model="myName" maxlength="30" class="w-40 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-100" @change="rename">
        </label>
      </div>
      <div class="ml-auto flex items-center gap-4" aria-label="Score de la série">
        <span class="font-semibold text-amber-300">{{ series.playerA }}</span>
        <span class="text-3xl font-bold tabular-nums">{{ score.a }}<span class="px-1 text-zinc-600">–</span>{{ score.b }}</span>
        <span class="font-semibold text-violet-300">{{ series.playerB }}</span>
      </div>
    </header>

    <!-- Popup : choisir son siège (ou regarder) avant de draft -->
    <div v-if="showSeatPopup && seats" class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div class="flex w-full max-w-md flex-col gap-4 rounded-xl border border-zinc-700 bg-zinc-900 p-5">
        <h2 class="text-lg font-semibold">
          Qui es-tu dans ce duel ?
        </h2>
        <label class="flex flex-col gap-1 text-sm text-zinc-400">
          Ton nom
          <input v-model="claimName" maxlength="30" class="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100">
        </label>
        <div class="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            :disabled="seats.a.taken"
            class="cursor-pointer rounded-lg border border-amber-400/50 px-4 py-3 text-left hover:bg-amber-400/10 disabled:cursor-default disabled:opacity-40"
            @click="claimSeat('a')"
          >
            <span class="block font-semibold text-amber-300">{{ seats.a.name }}</span>
            <span class="text-xs text-zinc-400">{{ seats.a.taken ? 'Déjà pris' : 'Joueur A · choisit le côté' }}</span>
          </button>
          <button
            type="button"
            :disabled="seats.b.taken"
            class="cursor-pointer rounded-lg border border-violet-400/50 px-4 py-3 text-left hover:bg-violet-400/10 disabled:cursor-default disabled:opacity-40"
            @click="claimSeat('b')"
          >
            <span class="block font-semibold text-violet-300">{{ seats.b.name }}</span>
            <span class="text-xs text-zinc-400">{{ seats.b.taken ? 'Déjà pris' : 'Joueur B · prend l’autre côté' }}</span>
          </button>
        </div>
        <p v-if="claimError" class="text-sm text-red-400" role="alert">
          {{ claimError }}
        </p>
        <button type="button" class="cursor-pointer self-end text-sm text-zinc-400 hover:text-zinc-100" @click="watchOnly">
          Regarder seulement
        </button>
      </div>
    </div>

    <div v-if="seats && !mySeat && spectating" class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-700 bg-zinc-900/60 px-4 py-3 text-sm text-zinc-300">
      <span>Tu regardes ce duel : lecture seule.</span>
      <button v-if="!seats.a.taken || !seats.b.taken" type="button" class="cursor-pointer rounded-md border border-zinc-600 px-3 py-1 hover:bg-zinc-800" @click="takeSeat">
        Prendre un siège
      </button>
    </div>

    <p v-if="mySeat && sideToAct" class="text-sm text-zinc-400">
      Au tour du côté <span class="font-semibold text-zinc-100">{{ sideToAct === 'blue' ? 'Bleu' : 'Rouge' }}</span>
      <span v-if="canPlay" class="text-amber-300"> · c’est ton tour</span>
    </p>

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
        class="cursor-pointer px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-100 bg-zinc-900 hover:bg-zinc-800"
        @click="nextGame"
      >
        + Game suivante
      </button>
    </nav>

    <template v-if="game">
      <!-- Les côtés se choisissent avant le premier ban -->
      <div v-if="!started" class="flex flex-wrap items-center gap-3 text-sm" :class="mySeat !== 'a' && 'pointer-events-none opacity-60'">
        <span><span class="font-medium text-amber-300">{{ series.playerA }}</span> joue</span>
        <SegmentedControl
          :model-value="game.ourSide"
          :options="SIDE_OPTIONS"
          @update:model-value="(s: Side) => patchGame(game!, { ourSide: s })"
        />
        <span class="text-zinc-500">· <span class="text-violet-300">{{ series.playerB }}</span> prend l’autre côté</span>
      </div>

      <div :class="(mySeat === null || (!canPlay && !complete)) && 'pointer-events-none opacity-70'">
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
      </div>

      <!-- Fin de draft : l'IA départage -->
      <section v-if="complete" aria-live="polite" class="flex flex-col gap-3">
        <div v-if="judging" class="cut flex items-center gap-3 bg-zinc-900 px-4 py-5 text-sm text-zinc-300">
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

        <div v-else class="cut flex flex-col gap-3 bg-zinc-900 p-4">
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
              class="btn-action cursor-pointer text-sm"
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
                : 'border-transparent text-zinc-300 hover:bg-zinc-800 bg-zinc-900'"
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
