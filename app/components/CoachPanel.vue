<script setup lang="ts">
import { DRAFT_ORDER, otherSide, picksOf } from '#shared/draft'
import { suggestPicks, unavailableNow } from '#shared/coach'
import { estimateWinRate } from '#shared/winrate'
import type { CoachContext } from '#shared/coach'
import type { CoachMode, CoachResult } from '#shared/types'

const props = defineProps<{
  ctx: CoachContext
  gameId: number
  iconUrl: (id: string) => string
  nameOf: (id: string) => string
}>()
const emit = defineEmits<{ play: [champId: string] }>()

const step = computed(() => DRAFT_ORDER[props.ctx.game.actions.length])
const ourTurn = computed(() => step.value?.side === props.ctx.game.ourSide)
const mode = computed<CoachMode>(() => (!step.value ? 'review' : ourTurn.value ? 'advice' : 'prediction'))
const suggestions = computed(() => suggestPicks(props.ctx))
const blocked = computed(() => unavailableNow(props.ctx))

const result = ref<CoachResult | null>(null)
/** Draft length the result was computed for: anything else means it's outdated. */
const resultAt = ref(-1)
const loading = ref(false)
/** Which AI answers: auto (server's choice) or one provider, to compare answers. Each answer shows its model. */
const provider = ref<'auto' | 'gemini' | 'claude' | 'openrouter'>('auto')
/** « Draft seule » : l'IA ne reçoit ni pools ni combos, seulement la draft (réglage retenu dans le navigateur) */
const draftOnly = ref(true)
const providerBody = () => ({ gameId: props.gameId, provider: provider.value === 'auto' ? undefined : provider.value, draftOnly: draftOnly.value })
const error = ref('')
const auto = ref(false)

onMounted(() => {
  try {
    auto.value = localStorage.getItem('coach-auto') === '1'
    draftOnly.value = localStorage.getItem('coach-draft-only') !== '0'
  }
  catch {}
  loadHistory()
  loadPlan()
})
watch(draftOnly, (on) => {
  try { localStorage.setItem('coach-draft-only', on ? '1' : '0') }
  catch {}
})
watch(auto, (on) => {
  try { localStorage.setItem('coach-auto', on ? '1' : '0') }
  catch {}
  if (on) maybeAutoAsk()
})

async function ask() {
  const at = props.ctx.game.actions.length
  loading.value = true
  error.value = ''
  try {
    const res = await $fetch<CoachResult>('/api/coach', { method: 'POST', body: providerBody() })
    if (props.ctx.game.actions.length === at) { // ignore answers that arrive after the next click
      result.value = res
      resultAt.value = at
      viewIndex.value = null
      await loadHistory()
    }
  }
  catch (e: any) {
    error.value = e?.data?.statusMessage ?? 'Le coach IA est indisponible'
  }
  finally {
    loading.value = false
  }
}

/** Auto mode asks on our turns and once for the final review; predictions stay manual to save quota. */
function maybeAutoAsk() {
  if (!auto.value || loading.value || resultAt.value === props.ctx.game.actions.length) return
  if (mode.value === 'advice' || mode.value === 'review') ask()
}
watch(() => props.ctx.game.actions.length, maybeAutoAsk)

/** Saved answers of this game, one per draft step, last step first. Browsing them never changes the draft. */
interface AdviceRecord { id: number, stepIndex: number, result: CoachResult }
const history = ref<AdviceRecord[]>([])
/** Index in `history` being looked at (0 = newest saved), null = the live answer. */
const viewIndex = ref<number | null>(null)
const viewed = computed(() => (viewIndex.value === null ? null : history.value[viewIndex.value] ?? null))
const shown = computed(() => viewed.value?.result ?? result.value)

async function loadHistory() {
  try { history.value = await $fetch<AdviceRecord[]>(`/api/games/${props.gameId}/advice`) }
  catch {}
}
/** delta +1 = older answer, -1 = newer; back past the newest returns to the live answer. */
function browse(delta: number) {
  const next = (viewIndex.value ?? -1) + delta
  if (next < 0) viewIndex.value = null
  else if (next < history.value.length) viewIndex.value = next
}
/** One chip per step that has a saved answer, pointing at its newest answer (`i` = index in history). */
const stepChips = computed(() => {
  const newest = new Map<number, number>()
  history.value.forEach((r, i) => { if (!newest.has(r.stepIndex)) newest.set(r.stepIndex, i) })
  return [...newest].sort((a, b) => a[0] - b[0]).map(([stepIndex, i]) => ({ stepIndex, i }))
})

/** The answer on screen is for the draft as it is now (same number of picks and bans): its buttons work, live or from history. */
const fresh = computed(() => (viewed.value
  ? viewed.value.stepIndex === props.ctx.game.actions.length
  : !!result.value && resultAt.value === props.ctx.game.actions.length))
const advice = computed(() => (shown.value && shown.value.kind !== 'review' ? shown.value : null))
const review = computed(() => (shown.value?.kind === 'review' ? shown.value : null))

/** Game plan (see server/utils/coach-plan.ts): lanes, fights, split and synergies. */
interface GameLane { lane: 'top' | 'jungle' | 'mid' | 'bot', ours: string, theirs: string, matchup: string, scaling: string, early: string, mid: string, late: string }
interface GamePlan { lanes: GameLane[], fights: string[], split: string, synergies: string[], model: string, ms: number }
const LANE_LABEL = { top: 'Top', jungle: 'Jungle', mid: 'Mid', bot: 'Bot' } as const
const gamePlan = ref<GamePlan | null>(null)
const planLoading = ref(false)
const planError = ref('')

async function loadPlan() {
  try { gamePlan.value = await $fetch<GamePlan | null>(`/api/games/${props.gameId}/plan`) }
  catch {}
}
async function makePlan() {
  planLoading.value = true
  planError.value = ''
  try { gamePlan.value = await $fetch<GamePlan>('/api/coach/plan', { method: 'POST', body: providerBody() }) }
  catch (e: any) { planError.value = e?.data?.statusMessage ?? 'Le plan est indisponible pour le moment' }
  finally { planLoading.value = false }
}

const copied = ref(false)
/** Free fallback: copy the whole coach prompt to paste into any AI chat. */
async function copyContext() {
  error.value = ''
  try {
    const { text } = await $fetch<{ text: string }>('/api/coach/prompt', { method: 'POST', body: { gameId: props.gameId, draftOnly: draftOnly.value } })
    await navigator.clipboard.writeText(text)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  }
  catch (e: any) {
    error.value = e?.data?.statusMessage ?? 'Impossible de copier le contexte'
  }
}

/** Plays a suggestion on our turn, or records a correct prediction on theirs. */
function play(champId: string) {
  if (step.value && !blocked.value.has(champId)) emit('play', champId)
}

const ASK_LABEL: Record<CoachMode, string> = {
  advice: 'Demander au coach',
  prediction: 'Prédire leur choix',
  review: 'Analyser la draft',
}
const IDLE_HINT: Record<CoachMode, string> = {
  advice: 'Le coach lit la draft, vos pools et les verrous Fearless, puis propose jusqu’à 3 options.',
  prediction: 'Leur tour : le coach prédit leurs 3 choix les plus probables et comment y répondre.',
  review: 'Draft terminée : obtiens le winrate estimé des deux compos, leurs plans de jeu et comment les contrer.',
}
const CONFIDENCE: Record<string, string> = { high: 'text-emerald-400', medium: 'text-amber-300', low: 'text-zinc-400' }
const CONFIDENCE_LABEL: Record<string, string> = { high: 'confiance élevée', medium: 'confiance moyenne', low: 'confiance faible' }

const us = computed(() => props.ctx.game.ourSide)
/** Data-based win chance, computed locally as soon as the draft is complete. */
const dataEstimate = computed(() => estimateWinRate(props.ctx))
const champsOf = (side: 'blue' | 'red') => picksOf(props.ctx.game.actions, side)
</script>

<template>
  <section class="cut grid gap-4 p-4 lg:grid-cols-[1fr_1.4fr] xl:grid-cols-1 bg-zinc-900">
    <!-- Instant engine suggestions -->
    <div v-if="mode !== 'review'" class="flex flex-col gap-2">
      <h3 class="font-display text-base font-bold uppercase tracking-wider">
        Suggestions
        <span class="font-normal text-zinc-500">· d’après vos pools</span>
      </h3>
      <p v-if="!ourTurn" class="text-xs text-zinc-500">
        En attente de leur {{ step?.type }}…
      </p>
      <p v-else-if="step?.type === 'ban'" class="text-xs text-zinc-500">
        Phase de bans : demande au coach IA quoi bannir.
      </p>
      <p v-else-if="!ctx.team.length" class="text-xs text-zinc-500">
        Ajoute tes joueurs et leurs pools dans l’onglet <NuxtLink to="/team" class="text-amber-300 underline">Équipe</NuxtLink> pour obtenir des suggestions.
      </p>
      <p v-else-if="!suggestions.length" class="text-xs text-zinc-500">
        Plus rien dans les pools pour les rôles restants.
      </p>
      <ul v-else class="flex flex-col gap-1">
        <li v-for="s in suggestions" :key="s.champId">
          <button
            type="button"
            class="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-zinc-800"
            :title="s.reasons.join(' · ')"
            @click="play(s.champId)"
          >
            <img :src="iconUrl(s.champId)" :alt="nameOf(s.champId)" class="size-8 rounded">
            <span class="flex-1 text-sm">
              {{ nameOf(s.champId) }}
              <span class="text-xs text-zinc-500">· {{ s.player }} (<span class="capitalize">{{ s.role }}</span>) · {{ s.tier }}</span>
            </span>
            <span class="text-xs tabular-nums text-zinc-500">{{ s.score.toFixed(2) }}</span>
          </button>
          <!-- Why this champion: each point of the score, in words -->
          <p class="px-1.5 pb-1 text-[11px] leading-snug text-zinc-500">
            {{ s.reasons.join(' · ') }}
          </p>
        </li>
      </ul>
    </div>

    <!-- AI coach -->
    <div class="flex flex-col gap-2" :class="mode === 'review' && 'lg:col-span-2 xl:col-span-1'">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h3 class="font-display text-base font-bold uppercase tracking-wider">
          Coach IA
        </h3>
        <label class="flex items-center gap-1.5 text-xs text-zinc-400" title="Demande automatiquement à nos tours et pour l’analyse finale">
          <input v-model="auto" type="checkbox" class="accent-amber-400">
          Auto
        </label>
        <label class="flex items-center gap-1.5 text-xs text-zinc-400" title="L’IA ne reçoit ni pools ni combos : elle conseille uniquement d’après la draft (comps, contres, synergies, drafts pro)">
          <input v-model="draftOnly" type="checkbox" class="accent-amber-400">
          Draft seule
        </label>
        <button
          type="button"
          class="ml-auto px-2 py-1 text-xs text-zinc-300 bg-zinc-800 hover:bg-zinc-700 font-display font-semibold uppercase tracking-wider"
          title="Copie le contexte de la draft pour le coller dans n’importe quel chat IA (gratuit)"
          @click="copyContext"
        >
          {{ copied ? 'Copié ✓' : 'Copier le contexte' }}
        </button>
        <select
          v-model="provider"
          class="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-300"
          title="Qui répond : automatique, ou un fournisseur précis pour comparer les réponses"
        >
          <option value="auto">
            Auto
          </option>
          <option value="gemini">
            Gemini
          </option>
          <option value="claude">
            Claude
          </option>
          <option value="openrouter">
            OpenRouter
          </option>
        </select>
        <button
          type="button"
          class="btn-action text-xs disabled:opacity-40"
          :disabled="loading"
          @click="ask"
        >
          {{ loading ? 'Réflexion…' : ASK_LABEL[mode] }}
        </button>
      </div>

      <p v-if="error" class="text-xs text-red-400">
        {{ error }}
      </p>
      <p v-else-if="!result && !loading" class="text-xs text-zinc-500">
        {{ IDLE_HINT[mode] }}
      </p>

      <!-- History: browse the coach's earlier answers without touching the draft -->
      <div v-if="history.length" class="flex items-center justify-between gap-2 text-xs text-zinc-400">
        <button type="button" class="cursor-pointer px-1 hover:text-zinc-100 disabled:cursor-default disabled:opacity-30" :disabled="viewIndex === history.length - 1" title="Conseil précédent" @click="browse(1)">
          ‹ Plus ancien
        </button>
        <span class="text-center">
          <template v-if="viewed">Conseil de l’étape {{ viewed.stepIndex + 1 }}</template>
          <template v-else>Conseil en direct</template>
        </span>
        <button type="button" class="cursor-pointer px-1 hover:text-zinc-100 disabled:cursor-default disabled:opacity-30" :disabled="viewIndex === null" title="Conseil suivant" @click="browse(-1)">
          Plus récent ›
        </button>
      </div>

      <!-- One chip per draft step that has a saved answer: jump straight to it (É18 = step 18) -->
      <div v-if="stepChips.length" class="flex flex-wrap gap-1 text-xs">
        <button
          v-for="c in stepChips"
          :key="c.stepIndex"
          type="button"
          class="cursor-pointer rounded px-2 py-0.5"
          :class="viewed?.stepIndex === c.stepIndex ? 'bg-amber-400 text-zinc-950' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'"
          :title="`Conseils de l’étape ${c.stepIndex + 1}`"
          @click="viewIndex = c.i"
        >
          É{{ c.stepIndex + 1 }}
        </button>
      </div>

      <!-- Our turn: advice / their turn: prediction -->
      <div v-if="advice" class="flex flex-col gap-2" :class="!fresh && 'opacity-40'">
        <p class="text-xs text-zinc-500">
          <span v-if="advice.kind === 'prediction'" class="font-semibold text-side-red">Prédiction · </span>
          {{ advice.step }} · {{ advice.model }} · {{ (advice.ms / 1000).toFixed(1) }}s
          <span v-if="!fresh" class="text-amber-300"> · obsolète, la draft a avancé</span>
        </p>
        <button
          v-for="r in advice.recommendations"
          :key="r.champId"
          type="button"
          class="flex items-start gap-2 bg-zinc-800/60 p-2 text-left hover:bg-zinc-800 disabled:cursor-default disabled:hover:bg-zinc-800/60"
          :disabled="!fresh"
          :title="advice.kind === 'prediction' ? 'Clique s’ils le prennent' : 'Clique pour le jouer'"
          @click="play(r.champId)"
        >
          <img :src="iconUrl(r.champId)" :alt="nameOf(r.champId)" class="size-10 rounded">
          <span class="flex flex-col">
            <span class="text-sm font-medium">
              {{ nameOf(r.champId) }}
              <span v-if="r.player" class="text-xs font-normal text-zinc-400">· {{ r.player }}</span>
              <span class="text-xs font-normal" :class="CONFIDENCE[r.confidence]">· {{ CONFIDENCE_LABEL[r.confidence] ?? r.confidence }}</span>
            </span>
            <span class="text-xs text-zinc-300">{{ r.reason }}</span>
          </span>
        </button>
        <p v-if="advice.enemyRead" class="text-xs">
          <span class="font-semibold text-side-red">Eux :</span> {{ advice.enemyRead }}
        </p>
        <p v-if="advice.plan" class="text-xs">
          <span class="font-semibold text-emerald-400">{{ advice.kind === 'prediction' ? 'Notre réponse :' : 'Plan :' }}</span> {{ advice.plan }}
        </p>
        <p v-for="w in advice.warnings" :key="w" class="text-xs text-amber-300">
          ⚠ {{ w }}
        </p>
      </div>

      <!-- Draft complete: data estimate (instant, free), then the AI review on demand -->
      <WinRateBreakdown
        v-if="mode === 'review'"
        :estimate="review && fresh ? review.data : dataEstimate"
        :ai-blue="review && fresh ? review.blue.winRate : undefined"
        :our-side="us"
      />
      <div v-if="review" class="flex flex-col gap-3" :class="!fresh && 'opacity-40'">
        <p class="text-[11px] text-zinc-500">
          Analyse IA · {{ review.model }} · {{ (review.ms / 1000).toFixed(1) }}s
        </p>
        <p class="text-xs">
          <span class="font-semibold text-emerald-400">Verdict :</span> {{ review.verdict }}
        </p>
        <div class="grid gap-3 lg:grid-cols-2 xl:grid-cols-1">
          <CompReviewCard
            v-for="side in [us, otherSide(us)]"
            :key="side"
            :side="side"
            :is-us="side === us"
            :comp="review[side]"
            :champs="champsOf(side)"
            :icon-url="iconUrl"
            :name-of="nameOf"
          />
        </div>
      </div>

      <!-- Plan de jeu : écrit par le coach à partir de cette draft, lane par lane -->
      <div v-if="mode === 'review'" class="flex flex-col gap-3 border-t border-zinc-800 pt-4">
        <div class="flex items-center justify-between gap-2">
          <h3 class="text-sm font-semibold text-zinc-100">
            Plan de jeu
          </h3>
          <button
            type="button"
            class="cursor-pointer rounded-md bg-amber-400 px-3 py-1 text-xs font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-40"
            :disabled="planLoading"
            @click="makePlan"
          >
            {{ planLoading ? 'Réflexion…' : gamePlan ? 'Refaire le plan' : 'Générer le plan' }}
          </button>
        </div>
        <p v-if="planError" class="text-xs text-red-400" role="alert">
          {{ planError }}
        </p>

        <template v-if="gamePlan">
          <p class="text-[11px] text-zinc-500">
            Plan · {{ gamePlan.model }} · {{ (gamePlan.ms / 1000).toFixed(1) }}s
          </p>
          <article v-for="l in gamePlan.lanes" :key="l.lane" class="flex flex-col gap-1.5 rounded-lg border border-zinc-800 p-3">
            <h4 class="text-sm font-semibold text-amber-300">
              {{ LANE_LABEL[l.lane] }} <span class="font-normal text-zinc-400">· {{ l.ours }} vs {{ l.theirs }}</span>
            </h4>
            <p class="text-xs"><span class="font-semibold text-emerald-400">Lane :</span> {{ l.matchup }}</p>
            <p class="text-xs"><span class="font-semibold text-emerald-400">Scaling :</span> {{ l.scaling }}</p>
            <p class="text-xs"><span class="font-semibold">Early :</span> {{ l.early }}</p>
            <p class="text-xs"><span class="font-semibold">Mid :</span> {{ l.mid }}</p>
            <p class="text-xs"><span class="font-semibold">Late :</span> {{ l.late }}</p>
          </article>
          <div class="flex flex-col gap-1 text-xs">
            <p class="font-semibold text-zinc-100">
              Combats
            </p>
            <ul class="list-disc pl-4 text-zinc-300">
              <li v-for="f in gamePlan.fights" :key="f">
                {{ f }}
              </li>
            </ul>
            <p><span class="font-semibold">Split :</span> {{ gamePlan.split }}</p>
            <p class="pt-1 font-semibold text-zinc-100">
              Synergies
            </p>
            <ul class="list-disc pl-4 text-zinc-300">
              <li v-for="s in gamePlan.synergies" :key="s">
                {{ s }}
              </li>
            </ul>
          </div>
        </template>
      </div>
    </div>
  </section>
</template>
