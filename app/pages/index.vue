<script setup lang="ts">
import type { FearlessMode, SeriesFormat, Side } from '#shared/draft'
import type { Series } from '#shared/types'

const { data: series, refresh } = await useFetch<Series[]>('/api/series')

const form = reactive({
  name: '',
  opponent: '',
  format: 'Bo3' as SeriesFormat,
  fearless: 'hard' as FearlessMode,
  ourSide: 'blue' as Side,
})
const error = ref('')

async function create() {
  error.value = ''
  try {
    const { id } = await $fetch('/api/series', { method: 'POST', body: form })
    await navigateTo(`/series/${id}`)
  }
  catch (e: any) {
    error.value = e?.data?.statusMessage ?? 'Could not create the series'
  }
}

async function remove(s: Series) {
  if (!confirm(`Delete "${s.name}" and its games?`)) return
  await $fetch(`/api/series/${s.id}`, { method: 'DELETE' })
  await refresh()
}

const FEARLESS_LABEL: Record<FearlessMode, string> = {
  hard: 'Fearless',
  off: 'Normal draft',
}
</script>

<template>
  <div class="grid gap-8 md:grid-cols-[320px_1fr]">
    <form class="flex flex-col gap-3 rounded-lg border border-zinc-800 p-4" @submit.prevent="create">
      <h2 class="font-semibold">
        New series
      </h2>
      <label class="flex flex-col gap-1 text-sm">
        Name
        <input v-model="form.name" required placeholder="Scrim vs Team X" class="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5">
      </label>
      <label class="flex flex-col gap-1 text-sm">
        Opponent
        <input v-model="form.opponent" placeholder="Team X" class="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5">
      </label>
      <div class="grid grid-cols-2 gap-3">
        <label class="flex flex-col gap-1 text-sm">
          Format
          <select v-model="form.format" class="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5">
            <option>Bo1</option><option>Bo3</option><option>Bo5</option>
          </select>
        </label>
        <label class="flex flex-col gap-1 text-sm">
          Game 1 side
          <select v-model="form.ourSide" class="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5">
            <option value="blue">Blue</option><option value="red">Red</option>
          </select>
        </label>
      </div>
      <label class="flex flex-col gap-1 text-sm">
        Draft mode
        <select v-model="form.fearless" class="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5">
          <option value="hard">Fearless</option>
          <option value="off">Normal draft</option>
        </select>
      </label>
      <p v-if="error" class="text-sm text-red-400">
        {{ error }}
      </p>
      <button class="rounded-md bg-amber-400 px-3 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300">
        Start series
      </button>
    </form>

    <section class="flex flex-col gap-2">
      <h2 class="font-semibold">
        Series
      </h2>
      <p v-if="!series?.length" class="text-sm text-zinc-500">
        No series yet. Create one to start drafting.
      </p>
      <div
        v-for="s in series"
        :key="s.id"
        class="flex items-center gap-4 rounded-lg border border-zinc-800 px-4 py-3 hover:border-zinc-600"
      >
        <NuxtLink :to="`/series/${s.id}`" class="flex flex-1 flex-col">
          <span class="font-medium">{{ s.name }}</span>
          <span class="text-xs text-zinc-400">
            {{ s.opponent || 'No opponent' }} · {{ s.format }} · {{ FEARLESS_LABEL[s.fearless] }} · {{ s.gameCount }} game(s)
          </span>
        </NuxtLink>
        <button type="button" class="text-xs text-zinc-500 hover:text-red-400" @click="remove(s)">
          Delete
        </button>
      </div>
    </section>
  </div>
</template>
