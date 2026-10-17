<script setup lang="ts">
import { DRAFT_ORDER } from '#shared/draft'
import { stepLabel, suggestPicks, unavailableFor } from '#shared/coach'
import type { CoachContext } from '#shared/coach'
import type { CoachAdvice } from '#shared/types'

const props = defineProps<{
  ctx: CoachContext
  gameId: number
  iconUrl: (id: string) => string
  nameOf: (id: string) => string
}>()
const emit = defineEmits<{ play: [champId: string] }>()

const step = computed(() => DRAFT_ORDER[props.ctx.game.actions.length])
const ourTurn = computed(() => step.value?.side === props.ctx.game.ourSide)
const suggestions = computed(() => suggestPicks(props.ctx))
const blocked = computed(() => (step.value ? unavailableFor(props.ctx, step.value) : new Set<string>()))

const advice = ref<CoachAdvice | null>(null)
/** Draft length the advice was computed for: anything else means it's outdated. */
const adviceAt = ref(-1)
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
    const res = await $fetch<CoachAdvice>('/api/coach', { method: 'POST', body: { gameId: props.gameId } })
    if (props.ctx.game.actions.length === at) { // ignore answers that arrive after the next click
      advice.value = res
      adviceAt.value = at
    }
  }
  catch (e: any) {
    error.value = e?.data?.statusMessage ?? 'The AI coach is unavailable'
  }
  finally {
    loading.value = false
  }
}

function maybeAutoAsk() {
  if (auto.value && ourTurn.value && !loading.value && adviceAt.value !== props.ctx.game.actions.length) ask()
}
watch(() => props.ctx.game.actions.length, maybeAutoAsk)

const fresh = computed(() => advice.value && adviceAt.value === props.ctx.game.actions.length)

function play(champId: string) {
  if (ourTurn.value && !blocked.value.has(champId)) emit('play', champId)
}

const CONFIDENCE: Record<string, string> = { high: 'text-emerald-400', medium: 'text-amber-300', low: 'text-zinc-400' }
</script>

<template>
  <section class="grid gap-4 rounded-lg border border-zinc-800 p-4 lg:grid-cols-[1fr_1.4fr] xl:grid-cols-1">
    <!-- Instant engine suggestions -->
    <div class="flex flex-col gap-2">
      <h3 class="text-sm font-semibold">
        Suggestions
        <span class="font-normal text-zinc-500">· from your pools</span>
      </h3>
      <p v-if="!step" class="text-xs text-zinc-500">
        Draft complete.
      </p>
      <p v-else-if="!ourTurn" class="text-xs text-zinc-500">
        Waiting for their {{ step.type }}…
      </p>
      <p v-else-if="step.type === 'ban'" class="text-xs text-zinc-500">
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
    <div class="flex flex-col gap-2">
      <div class="flex items-center gap-3">
        <h3 class="text-sm font-semibold">
          AI coach
        </h3>
        <label class="flex items-center gap-1.5 text-xs text-zinc-400">
          <input v-model="auto" type="checkbox" class="accent-amber-400">
          Auto on our turns
        </label>
        <button
          type="button"
          class="ml-auto rounded-md bg-amber-400 px-3 py-1 text-xs font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-40"
          :disabled="!ourTurn || loading"
          @click="ask"
        >
          {{ loading ? 'Thinking…' : 'Ask the coach' }}
        </button>
      </div>

      <p v-if="error" class="text-xs text-red-400">
        {{ error }}
      </p>
      <p v-else-if="!advice && !loading" class="text-xs text-zinc-500">
        On your turn, the coach reads the draft, your pools and the Fearless locks, then suggests up to 3 options.
      </p>

      <div v-if="advice" class="flex flex-col gap-2" :class="!fresh && 'opacity-40'">
        <p class="text-xs text-zinc-500">
          {{ advice.step }} · {{ (advice.ms / 1000).toFixed(1) }}s
          <span v-if="!fresh" class="text-amber-300"> · outdated, the draft moved on</span>
        </p>
        <button
          v-for="r in advice.recommendations"
          :key="r.champId"
          type="button"
          class="flex items-start gap-2 rounded-md p-1.5 text-left hover:bg-zinc-800 disabled:cursor-default disabled:hover:bg-transparent"
          :disabled="!fresh"
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
          <span class="font-semibold text-emerald-400">Plan:</span> {{ advice.plan }}
        </p>
        <p v-for="w in advice.warnings" :key="w" class="text-xs text-amber-300">
          ⚠ {{ w }}
        </p>
      </div>
    </div>
  </section>
</template>
