<script setup lang="ts">
import { picksOf } from '#shared/draft'
import type { Prep, PrepScenario } from '#shared/types'

const { data: preps, refresh } = await useFetch<Prep[]>('/api/preps')
const { byId, iconUrl } = await useChampions()
const nameOf = (id: string) => byId.value.get(id)?.name ?? id

const form = reactive({ name: '', opponent: '' })
const creating = ref(false)

async function create() {
  if (!form.name.trim()) return
  const { id } = await $fetch<{ id: number }>('/api/preps', { method: 'POST', body: form })
  await navigateTo(`/prep/${id}`)
}

async function newDraft(p: Prep) {
  const created = await $fetch<PrepScenario>(`/api/preps/${p.id}/scenarios`, { method: 'POST', body: {} })
  await navigateTo({ path: `/prep/${p.id}`, query: { s: created.id } })
}

async function remove(p: Prep) {
  if (!confirm(`Delete "${p.name}" and its ${p.scenarioCount} draft(s)?`)) return
  await $fetch(`/api/preps/${p.id}`, { method: 'DELETE' })
  await refresh()
}

/** Main choice of each of our 5 picks (empty string when not set). */
const ourPicks = (s: NonNullable<Prep['scenarios']>[number]) =>
  picksOf(s.slots.map(alts => alts[0] ?? ''), s.ourSide).concat(Array(5).fill('')).slice(0, 5)
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="flex flex-wrap items-end gap-4">
      <div>
        <h1 class="text-xl font-semibold">
          Draft prep
        </h1>
        <p class="text-sm text-zinc-400">
          Cook drafts in advance: one prep per opponent or theme, several drafts inside, several options per step.
        </p>
      </div>
      <button
        v-if="!creating"
        type="button"
        class="ml-auto cursor-pointer rounded-md bg-amber-400 px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-amber-300"
        @click="creating = true"
      >
        + New prep
      </button>
      <form v-else class="ml-auto flex gap-2" @submit.prevent="create">
        <input v-model="form.name" autofocus placeholder="Name, e.g. Scrims week 3" class="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm">
        <input v-model="form.opponent" placeholder="Opponent (optional)" class="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm">
        <button class="cursor-pointer rounded-md bg-amber-400 px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-amber-300">
          Create
        </button>
        <button type="button" class="cursor-pointer px-2 text-sm text-zinc-500 hover:text-zinc-200" @click="creating = false">
          Cancel
        </button>
      </form>
    </div>

    <div v-if="!preps?.length" class="flex flex-col items-center gap-3 rounded-xl border border-dashed border-zinc-800 py-16 text-center">
      <p class="text-zinc-300">
        No prep yet
      </p>
      <p class="max-w-md text-sm text-zinc-500">
        Create a prep for your next opponent, then cook a few drafts: engage, poke, front to back… with backup picks on every step.
      </p>
      <button type="button" class="cursor-pointer rounded-md bg-amber-400 px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-amber-300" @click="creating = true">
        + New prep
      </button>
    </div>

    <div class="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
      <article
        v-for="p in preps"
        :key="p.id"
        class="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900/30 p-4 transition-colors hover:border-zinc-700"
      >
        <header class="flex items-start gap-3">
          <NuxtLink :to="`/prep/${p.id}`" class="flex flex-1 flex-col hover:text-amber-300">
            <span class="text-lg font-semibold">{{ p.name }}</span>
            <span class="text-xs text-zinc-400">{{ p.opponent ? `vs ${p.opponent}` : 'No opponent' }} · {{ p.scenarioCount }} draft(s)</span>
          </NuxtLink>
          <button type="button" class="cursor-pointer text-xs text-zinc-600 hover:text-red-400" @click="remove(p)">
            Delete
          </button>
        </header>

        <!-- Draft previews: style, name, our 5 main picks -->
        <ul class="flex flex-col gap-1">
          <li v-for="s in p.scenarios" :key="s.id">
            <NuxtLink
              :to="{ path: `/prep/${p.id}`, query: { s: s.id } }"
              class="flex items-center gap-3 rounded-md border-l-4 bg-zinc-900/70 px-3 py-1.5 hover:bg-zinc-800"
              :class="styleOf(s.color).border"
            >
              <span class="w-28 truncate text-sm">{{ s.name }}</span>
              <span class="w-20 text-[11px]" :class="styleOf(s.color).text">{{ styleOf(s.color).label }}</span>
              <span class="flex gap-1">
                <template v-for="(c, i) in ourPicks(s)" :key="i">
                  <img v-if="c" :src="iconUrl(c)" :alt="nameOf(c)" :title="nameOf(c)" class="size-7 rounded">
                  <span v-else class="size-7 rounded bg-zinc-800" />
                </template>
              </span>
              <span
                class="ml-auto rounded px-1.5 text-[10px] font-bold uppercase"
                :class="s.ourSide === 'blue' ? 'bg-side-blue/20 text-side-blue' : 'bg-side-red/20 text-side-red'"
              >{{ s.ourSide }}</span>
            </NuxtLink>
          </li>
        </ul>

        <button
          type="button"
          class="cursor-pointer self-start rounded-md border border-dashed border-zinc-700 px-3 py-1 text-xs text-zinc-400 hover:border-zinc-500 hover:text-zinc-100"
          @click="newDraft(p)"
        >
          + New draft
        </button>
      </article>
    </div>
  </div>
</template>
