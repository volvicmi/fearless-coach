<script setup lang="ts">
import type { FearlessMode, SeriesFormat, Side } from '#shared/draft'
import type { SeriesMode } from '#shared/types'

defineEmits<{ close: [] }>()

const MODES: { value: SeriesMode, title: string, text: string, ai: string }[] = [
  {
    value: 'team',
    title: 'Coaching d’équipe',
    text: 'Notre équipe contre un adversaire : tu saisis la draft en direct.',
    ai: 'Coach IA : conseils sur notre tour, prédictions sur le leur, analyse finale.',
  },
  {
    value: 'duel',
    title: 'Duel 1v1',
    text: 'Deux joueurs draftent l’un contre l’autre, chacun son tour.',
    ai: 'Aucun conseil pendant la draft. À la fin, l’IA désigne le vainqueur et explique pourquoi.',
  },
]

const mode = ref<SeriesMode>('team')
const form = reactive({
  name: '',
  opponent: '',
  playerA: '',
  playerB: '',
  format: 'Bo3' as SeriesFormat,
  fearless: 'hard' as FearlessMode,
  ourSide: 'blue' as Side,
})
const error = ref('')
const busy = ref(false)

// On retient les derniers réglages (pas les noms) : on relance souvent la même série.
const PREFS_KEY = 'fearless-coach:new-series'
onMounted(() => {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}')
    if (saved.mode === 'team' || saved.mode === 'duel') mode.value = saved.mode
    if (['Bo1', 'Bo3', 'Bo5'].includes(saved.format)) form.format = saved.format
    if (['hard', 'off'].includes(saved.fearless)) form.fearless = saved.fearless
    if (['blue', 'red'].includes(saved.ourSide)) form.ourSide = saved.ourSide
  }
  catch {}
})
watch([mode, () => form.format, () => form.fearless, () => form.ourSide], () => {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ mode: mode.value, format: form.format, fearless: form.fearless, ourSide: form.ourSide }))
  }
  catch {}
})

async function create() {
  if (busy.value) return
  error.value = ''
  busy.value = true
  try {
    const { id } = await $fetch<{ id: number }>('/api/series', { method: 'POST', body: { ...form, mode: mode.value } })
    await navigateTo(mode.value === 'duel' ? `/duel/${id}` : `/series/${id}`)
  }
  catch (e: any) {
    error.value = e?.data?.statusMessage ?? 'Impossible de créer la série'
    busy.value = false
  }
}

const INPUT = 'rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none placeholder:text-zinc-600 focus:border-amber-400'
const FIELD_LABEL = 'text-xs font-medium uppercase tracking-wider text-zinc-500'
</script>

<template>
  <form class="flex flex-col gap-6 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5" @submit.prevent="create">
    <!-- 1. Le mode -->
    <fieldset class="flex flex-col gap-3">
      <legend class="mb-1 text-sm font-semibold">
        1 · Quel type de draft ?
      </legend>
      <div role="radiogroup" class="grid gap-3 md:grid-cols-2">
        <button
          v-for="m in MODES"
          :key="m.value"
          type="button"
          role="radio"
          :aria-checked="mode === m.value"
          class="flex cursor-pointer gap-4 rounded-xl border p-4 text-left transition-colors"
          :class="mode === m.value ? 'border-amber-400 bg-amber-400/5' : 'border-zinc-800 hover:border-zinc-600'"
          @click="mode = m.value"
        >
          <span class="flex size-11 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-amber-300">
            <svg v-if="m.value === 'team'" viewBox="0 0 24 24" class="size-6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 3 5 6v5c0 4.4 3 7.7 7 9.5 4-1.8 7-5.1 7-9.5V6l-7-3Z" />
              <path d="m9 12 2 2 4-4" />
            </svg>
            <span v-else class="text-sm font-bold">1v1</span>
          </span>
          <span class="flex flex-col gap-1">
            <span class="font-semibold">{{ m.title }}</span>
            <span class="text-sm text-zinc-400">{{ m.text }}</span>
            <span class="text-xs text-amber-300/80">{{ m.ai }}</span>
          </span>
        </button>
      </div>
    </fieldset>

    <!-- 2. Les réglages -->
    <fieldset class="flex flex-col gap-4">
      <legend class="mb-1 text-sm font-semibold">
        2 · Réglages
      </legend>

      <div v-if="mode === 'team'" class="grid gap-4 md:grid-cols-2">
        <label class="flex flex-col gap-1.5">
          <span :class="FIELD_LABEL">Nom de la série</span>
          <input v-model="form.name" required placeholder="Scrim contre Équipe X" :class="INPUT">
        </label>
        <label class="flex flex-col gap-1.5">
          <span :class="FIELD_LABEL">Adversaire</span>
          <input v-model="form.opponent" placeholder="Équipe X" :class="INPUT">
        </label>
      </div>
      <div v-else class="grid gap-4 md:grid-cols-2">
        <label class="flex flex-col gap-1.5">
          <span :class="FIELD_LABEL">Joueur 1</span>
          <input v-model="form.playerA" maxlength="30" placeholder="Joueur 1" :class="INPUT">
        </label>
        <label class="flex flex-col gap-1.5">
          <span :class="FIELD_LABEL">Joueur 2</span>
          <input v-model="form.playerB" maxlength="30" placeholder="Joueur 2" :class="INPUT">
        </label>
      </div>

      <div class="flex flex-wrap gap-x-8 gap-y-4">
        <div class="flex flex-col gap-1.5">
          <span :class="FIELD_LABEL">Format</span>
          <SegmentedControl
            v-model="form.format"
            :options="[{ value: 'Bo1', label: 'Bo1' }, { value: 'Bo3', label: 'Bo3' }, { value: 'Bo5', label: 'Bo5' }]"
          />
        </div>
        <div class="flex flex-col gap-1.5">
          <span :class="FIELD_LABEL">Règle</span>
          <SegmentedControl
            v-model="form.fearless"
            :options="[{ value: 'hard', label: 'Fearless' }, { value: 'off', label: 'Draft normale' }]"
          />
        </div>
        <div class="flex flex-col gap-1.5">
          <span :class="FIELD_LABEL">{{ mode === 'duel' ? 'Côté du joueur 1 en game 1' : 'Notre côté en game 1' }}</span>
          <SegmentedControl
            v-model="form.ourSide"
            :options="[{ value: 'blue', label: 'Bleu', tone: 'blue' }, { value: 'red', label: 'Rouge', tone: 'red' }]"
          />
        </div>
      </div>
    </fieldset>

    <p v-if="error" class="text-sm text-red-400" role="alert">
      {{ error }}
    </p>

    <div class="flex items-center gap-3">
      <button
        type="submit"
        :disabled="busy"
        class="cursor-pointer rounded-lg bg-amber-400 px-5 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:cursor-wait disabled:opacity-60"
      >
        {{ busy ? 'Création…' : mode === 'duel' ? 'Lancer le duel' : 'Lancer la série' }}
      </button>
      <button type="button" class="cursor-pointer text-sm text-zinc-400 hover:text-zinc-100" @click="$emit('close')">
        Annuler
      </button>
    </div>
  </form>
</template>
