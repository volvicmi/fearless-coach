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
const error = ref('')
const auto = ref(false)

onMounted(() => {
  try { auto.value = localStorage.getItem('coach-auto') === '1' }
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
    const res = await $fetch<CoachResult>('/api/coach', { method: 'POST', body: { gameId: props.gameId } })
    if (props.ctx.game.actions.length === at) { // ignore answers that arrive after the next click
      result.value = res
      resultAt.value = at
    }
  }
  catch (e: any) {
    error.value = e?.data?.statusMessage ?? 'The AI coach is unavailable'
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

const fresh = computed(() => !!result.value && resultAt.value === props.ctx.game.actions.length)
const advice = computed(() => (result.value && result.value.kind !== 'review' ? result.value : null))
const review = computed(() => (result.value?.kind === 'review' ? result.value : null))

const copied = ref(false)
/** Free fallback: copy the whole coach prompt to paste into any AI chat. */
async function copyContext() {
  error.value = ''
  try {
    const { text } = await $fetch<{ text: string }>('/api/coach/prompt', { method: 'POST', body: { gameId: props.gameId } })
    await navigator.clipboard.writeText(text)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  }
  catch (e: any) {
    error.value = e?.data?.statusMessage ?? 'Could not copy the context'
  }
}

/** Plays a suggestion on our turn, or records a correct prediction on theirs. */
function play(champId: string) {
  if (step.value && !blocked.value.has(champId)) emit('play', champId)
}

const ASK_LABEL: Record<CoachMode, string> = {
  advice: 'Ask the coach',
  prediction: 'Predict their move',
  review: 'Review the draft',
}
const IDLE_HINT: Record<CoachMode, string> = {
  advice: 'The coach reads the draft, your pools and the Fearless locks, then suggests up to 3 options.',
  prediction: 'Their turn: the coach predicts their 3 most likely choices and how to answer.',
  review: 'Draft complete: get both comps\' estimated win rate, game plans and how to counter them.',
}
const CONFIDENCE: Record<string, string> = { high: 'text-emerald-400', medium: 'text-amber-300', low: 'text-zinc-400' }

const us = computed(() => props.ctx.game.ourSide)
/** Data-based win chance, computed locally as soon as the draft is complete. */
const dataEstimate = computed(() => estimateWinRate(props.ctx))
const champsOf = (side: 'blue' | 'red') => picksOf(props.ctx.game.actions, side)
</script>

<template>
  <section class="grid gap-4 rounded-lg border border-zinc-800 p-4 lg:grid-cols-[1fr_1.4fr] xl:grid-cols-1">
    <!-- Instant engine suggestions -->
    <div v-if="mode !== 'review'" class="flex flex-col gap-2">
      <h3 class="text-sm font-semibold">
        Suggestions
        <span class="font-normal text-zinc-500">· from your pools</span>
      </h3>
      <p v-if="!ourTurn" class="text-xs text-zinc-500">
        Waiting for their {{ step?.type }}…
      </p>
      <p v-else-if="step?.type === 'ban'" class="text-xs text-zinc-500">
        Ban phase: ask the AI coach for ban targets.
      </p>
      <p v-else-if="!ctx.team.length" class="text-xs text-zinc-500">
        Add your players and pools in the <NuxtLink to="/team" class="text-amber-300 underline">Team</NuxtLink> tab to get suggestions.
      </p>
      <p v-else-if="!suggestions.length" class="text-xs text-zinc-500">
        Nothing left in the pools for the open roles.
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
        </li>
      </ul>
    </div>

    <!-- AI coach -->
    <div class="flex flex-col gap-2" :class="mode === 'review' && 'lg:col-span-2 xl:col-span-1'">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h3 class="text-sm font-semibold">
          AI coach
        </h3>
        <label class="flex items-center gap-1.5 text-xs text-zinc-400" title="Asks automatically on our turns and for the final review">
          <input v-model="auto" type="checkbox" class="accent-amber-400">
          Auto
        </label>
        <button
          type="button"
          class="ml-auto rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
          title="Copy the draft context to paste into any AI chat (free)"
          @click="copyContext"
        >
          {{ copied ? 'Copied ✓' : 'Copy context' }}
        </button>
        <button
          type="button"
          class="rounded-md bg-amber-400 px-3 py-1 text-xs font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-40"
          :disabled="loading"
          @click="ask"
        >
          {{ loading ? 'Thinking…' : ASK_LABEL[mode] }}
        </button>
      </div>

      <p v-if="error" class="text-xs text-red-400">
        {{ error }}
      </p>
      <p v-else-if="!result && !loading" class="text-xs text-zinc-500">
        {{ IDLE_HINT[mode] }}
      </p>

      <!-- Our turn: advice / their turn: prediction -->
      <div v-if="advice" class="flex flex-col gap-2" :class="!fresh && 'opacity-40'">
        <p class="text-xs text-zinc-500">
          <span v-if="advice.kind === 'prediction'" class="font-semibold text-side-red">Prediction · </span>
          {{ advice.step }} · {{ advice.model }} · {{ (advice.ms / 1000).toFixed(1) }}s
          <span v-if="!fresh" class="text-amber-300"> · outdated, the draft moved on</span>
        </p>
        <button
          v-for="r in advice.recommendations"
          :key="r.champId"
          type="button"
          class="flex items-start gap-2 rounded-md p-1.5 text-left hover:bg-zinc-800 disabled:cursor-default disabled:hover:bg-transparent"
          :disabled="!fresh"
          :title="advice.kind === 'prediction' ? 'Click if they take it' : 'Click to play it'"
          @click="play(r.champId)"
        >
          <img :src="iconUrl(r.champId)" :alt="nameOf(r.champId)" class="size-10 rounded">
          <span class="flex flex-col">
            <span class="text-sm font-medium">
              {{ nameOf(r.champId) }}
              <span v-if="r.player" class="text-xs font-normal text-zinc-400">· {{ r.player }}</span>
              <span class="text-xs font-normal" :class="CONFIDENCE[r.confidence]">· {{ r.confidence }}</span>
            </span>
            <span class="text-xs text-zinc-300">{{ r.reason }}</span>
          </span>
        </button>
        <p v-if="advice.enemyRead" class="text-xs">
          <span class="font-semibold text-side-red">Them:</span> {{ advice.enemyRead }}
        </p>
        <p v-if="advice.plan" class="text-xs">
          <span class="font-semibold text-emerald-400">{{ advice.kind === 'prediction' ? 'Our answer:' : 'Plan:' }}</span> {{ advice.plan }}
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
          AI review · {{ review.model }} · {{ (review.ms / 1000).toFixed(1) }}s
        </p>
        <p class="text-xs">
          <span class="font-semibold text-emerald-400">Verdict:</span> {{ review.verdict }}
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
    </div>
  </section>
</template>
