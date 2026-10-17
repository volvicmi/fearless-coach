<script setup lang="ts">
import type { Series, SeriesMode } from '#shared/types'

const { data: series, refresh } = await useFetch<Series[]>('/api/series')

// Le formulaire est ouvert d'office tant qu'il n'y a aucune série.
const creating = ref(!series.value?.length)

const filter = ref<'all' | SeriesMode>('all')
const FILTERS: { value: 'all' | SeriesMode, label: string }[] = [
  { value: 'all', label: 'Tout' },
  { value: 'team', label: 'Équipe' },
  { value: 'duel', label: 'Duel 1v1' },
]
const countOf = (f: 'all' | SeriesMode) => (series.value ?? []).filter(s => f === 'all' || s.mode === f).length

const visible = computed(() => (series.value ?? []).filter(s => filter.value === 'all' || s.mode === filter.value))
const groups = computed(() => [
  { title: 'En cours', items: visible.value.filter(s => !seriesSummary(s).over) },
  { title: 'Terminées', items: visible.value.filter(s => seriesSummary(s).over) },
].filter(g => g.items.length))

async function remove(s: Series) {
  if (!confirm(`Supprimer « ${s.name} » et ses games ?`)) return
  await $fetch(`/api/series/${s.id}`, { method: 'DELETE' })
  await refresh()
}
</script>

<template>
  <div class="flex flex-col gap-8">
    <header class="flex flex-wrap items-end gap-4">
      <div>
        <h1 class="text-2xl font-semibold">
          Draft
        </h1>
        <p class="mt-1 text-sm text-zinc-400">
          Saisis une draft en direct avec le coach IA, ou lance un duel 1v1 que l’IA départage.
        </p>
      </div>
      <button
        v-if="!creating"
        type="button"
        class="ml-auto cursor-pointer rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300"
        @click="creating = true"
      >
        + Nouvelle série
      </button>
    </header>

    <NewSeriesForm v-if="creating" @close="creating = false" />

    <p v-else-if="!series?.length" class="rounded-xl border border-dashed border-zinc-800 px-4 py-10 text-center text-sm text-zinc-500">
      Aucune série pour l’instant. Crée-en une pour commencer la draft.
    </p>

    <section v-if="series?.length" class="flex flex-col gap-6">
      <div class="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrer les séries">
        <button
          v-for="f in FILTERS"
          :key="f.value"
          type="button"
          class="cursor-pointer rounded-full border px-3 py-1 text-sm"
          :class="filter === f.value ? 'border-amber-400 bg-amber-400/10 text-amber-300' : 'border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'"
          :aria-pressed="filter === f.value"
          @click="filter = f.value"
        >
          {{ f.label }} <span class="text-xs text-zinc-500">{{ countOf(f.value) }}</span>
        </button>
      </div>

      <div v-for="group in groups" :key="group.title">
        <h2 class="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          {{ group.title }} · {{ group.items.length }}
        </h2>
        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <SeriesCard v-for="s in group.items" :key="s.id" :series="s" @remove="remove(s)" />
        </div>
      </div>

      <p v-if="!visible.length" class="text-sm text-zinc-500">
        Aucune série de ce type pour l’instant.
      </p>
    </section>
  </div>
</template>
