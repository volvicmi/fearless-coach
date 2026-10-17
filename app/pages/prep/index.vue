<script setup lang="ts">
import type { Prep } from '#shared/types'

const { data: preps, refresh } = await useFetch<Prep[]>('/api/preps')
const form = reactive({ name: '', opponent: '' })

async function create() {
  if (!form.name.trim()) return
  const { id } = await $fetch<{ id: number }>('/api/preps', { method: 'POST', body: form })
  await navigateTo(`/prep/${id}`)
}

async function remove(p: Prep) {
  if (!confirm(`Delete "${p.name}" and its ${p.scenarioCount} draft(s)?`)) return
  await $fetch(`/api/preps/${p.id}`, { method: 'DELETE' })
  await refresh()
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="flex flex-wrap items-end gap-4">
      <div>
        <h1 class="text-xl font-semibold">
          Draft prep
        </h1>
        <p class="text-sm text-zinc-400">
          Cook drafts in advance: one prep per opponent or theme, several drafts in each, several options per step.
        </p>
      </div>
      <form class="ml-auto flex gap-2" @submit.prevent="create">
        <input v-model="form.name" placeholder="Prep name, e.g. Scrims week 3" class="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm">
        <input v-model="form.opponent" placeholder="Opponent (optional)" class="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm">
        <button class="cursor-pointer rounded-md bg-amber-400 px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-amber-300">
          New prep
        </button>
      </form>
    </div>

    <p v-if="!preps?.length" class="text-sm text-zinc-500">
      No prep yet: create one to start cooking drafts.
    </p>
    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <div
        v-for="p in preps"
        :key="p.id"
        class="group flex items-center gap-3 rounded-lg border border-zinc-800 p-4 transition-colors hover:border-zinc-600"
      >
        <NuxtLink :to="`/prep/${p.id}`" class="flex flex-1 flex-col">
          <span class="font-medium">{{ p.name }}</span>
          <span class="text-xs text-zinc-400">{{ p.opponent || 'No opponent' }} · {{ p.scenarioCount }} draft(s)</span>
        </NuxtLink>
        <button type="button" class="cursor-pointer text-xs text-zinc-600 hover:text-red-400" @click="remove(p)">
          Delete
        </button>
      </div>
    </div>
  </div>
</template>
