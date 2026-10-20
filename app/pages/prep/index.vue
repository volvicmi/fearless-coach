<script setup lang="ts">
import { picksOf } from '#shared/draft'
import type { Prep, PrepScenario } from '#shared/types'

const { data: preps, refresh } = await useFetch<Prep[]>('/api/preps')
const { byId, iconUrl } = await useChampions()
const nameOf = (id: string) => byId.value.get(id)?.name ?? id

/** One click: the prep (named "Prep N", renamed inside) and its first draft open right away. */
async function create() {
  const { id } = await $fetch<{ id: number }>('/api/preps', { method: 'POST', body: {} })
  await navigateTo(`/prep/${id}`)
}

async function newDraft(p: Prep) {
  const created = await $fetch<PrepScenario>(`/api/preps/${p.id}/scenarios`, { method: 'POST', body: {} })
  await navigateTo({ path: `/prep/${p.id}`, query: { s: created.id } })
}

async function remove(p: Prep) {
  if (!(await askConfirm(`Supprimer « ${p.name} » et ses ${p.scenarioCount} draft(s) ?`, { confirmLabel: 'Supprimer', danger: true }))) return
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
        <h1 class="text-3xl font-bold">
          Prep de draft
        </h1>
        <p class="text-sm text-zinc-400">
          Prépare tes drafts à l’avance : une prep par adversaire ou par thème, plusieurs drafts dedans, plusieurs options par étape.
        </p>
      </div>
      <button
        type="button"
        class="btn-action ml-auto cursor-pointer text-sm"
        @click="create"
      >
        + Nouvelle prep
      </button>
    </div>

    <div v-if="!preps?.length" class="cut flex flex-col items-center gap-3 border-dashed py-16 text-center bg-zinc-900">
      <p class="text-zinc-300">
        Aucune prep pour l’instant
      </p>
      <p class="max-w-md text-sm text-zinc-500">
        Crée une prep pour ton prochain adversaire, puis prépare quelques drafts : engage, poke, front to back… avec des picks de secours à chaque étape.
      </p>
      <button type="button" class="btn-action cursor-pointer text-sm" @click="create">
        + Nouvelle prep
      </button>
    </div>

    <div class="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
      <article
        v-for="p in preps"
        :key="p.id"
        class="cut flex flex-col gap-3 bg-zinc-900 p-4 transition-colors hover:bg-zinc-800/70"
      >
        <header class="flex items-start gap-3">
          <NuxtLink :to="`/prep/${p.id}`" class="flex flex-1 flex-col hover:text-amber-300">
            <span class="text-lg font-semibold">{{ p.name }}</span>
            <span class="text-xs text-zinc-400">{{ p.opponent ? `vs ${p.opponent}` : 'Pas d’adversaire' }} · {{ p.scenarioCount }} draft(s)</span>
          </NuxtLink>
          <button type="button" class="cursor-pointer text-xs text-zinc-600 hover:text-red-400" @click="remove(p)">
            Supprimer
          </button>
        </header>

        <!-- Draft previews: style, name, our 5 main picks -->
        <ul class="flex flex-col gap-1">
          <li v-for="s in p.scenarios" :key="s.id">
            <NuxtLink
              :to="{ path: `/prep/${p.id}`, query: { s: s.id } }"
              class="flex items-center gap-3 bg-zinc-900 px-3 py-1.5 transition-colors hover:bg-zinc-800"
            >
              <span class="size-2 shrink-0 rounded-full" :class="styleOf(s.color).dot" />
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
              >{{ s.ourSide === 'blue' ? 'bleu' : 'rouge' }}</span>
            </NuxtLink>
          </li>
        </ul>

        <button
          type="button"
          class="cursor-pointer self-start px-3 py-1 text-xs text-zinc-400 hover:text-zinc-100 bg-zinc-900 hover:bg-zinc-800"
          @click="newDraft(p)"
        >
          + Nouvelle draft
        </button>
      </article>
    </div>
  </div>
</template>
