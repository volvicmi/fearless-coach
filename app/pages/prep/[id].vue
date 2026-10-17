<script setup lang="ts">
import type { PrepDetail, PrepScenario } from '#shared/types'

const route = useRoute()
const id = route.params.id as string

const { data, refresh } = await useFetch<PrepDetail>(`/api/preps/${id}`)
if (!data.value) throw createError({ statusCode: 404, statusMessage: 'Prep not found', fatal: true })
const { champions, byId, iconUrl } = await useChampions()
const nameOf = (c: string) => byId.value.get(c)?.name ?? c

/** Selected scenario, kept in the URL (?s=) so a reload stays on it. */
const selectedId = computed<number | undefined>({
  get: () => Number(route.query.s) || data.value?.scenarios[0]?.id,
  set: s => navigateTo({ query: { ...route.query, s } }, { replace: true }),
})
const selected = computed(() => data.value?.scenarios.find(s => s.id === selectedId.value) ?? data.value?.scenarios[0])

/** Saves run in order; the screen updates first (useFetch data is a shallowRef: replace, don't mutate). */
let saveQueue: Promise<unknown> = Promise.resolve()
function patchScenario(s: PrepScenario, patch: Partial<PrepScenario>) {
  data.value = { ...data.value!, scenarios: data.value!.scenarios.map(x => (x.id === s.id ? { ...x, ...patch } : x)) }
  saveQueue = saveQueue
    .then(() => $fetch(`/api/scenarios/${s.id}`, { method: 'PUT', body: patch }))
    .catch(() => refresh())
}

async function addScenario(copyFrom?: number) {
  const created = await $fetch<PrepScenario>(`/api/preps/${id}/scenarios`, { method: 'POST', body: { copyFrom } })
  await refresh()
  selectedId.value = created.id
}

async function removeScenario(s: PrepScenario) {
  if (!confirm(`Delete "${s.name}"?`)) return
  await $fetch(`/api/scenarios/${s.id}`, { method: 'DELETE' })
  await refresh()
  selectedId.value = data.value?.scenarios[0]?.id
}

async function updatePrep(body: { name?: string, opponent?: string }) {
  await $fetch(`/api/preps/${id}`, { method: 'PUT', body })
  await refresh()
}
</script>

<template>
  <div v-if="data" class="flex flex-col gap-5">
    <div class="flex flex-wrap items-center gap-3">
      <NuxtLink to="/prep" class="text-sm text-zinc-500 hover:text-zinc-200">
        ← Preps
      </NuxtLink>
      <input
        :value="data.prep.name"
        class="w-72 rounded-md border border-transparent bg-transparent px-1 text-xl font-semibold hover:border-zinc-700 focus:border-amber-400 focus:outline-none"
        @change="updatePrep({ name: ($event.target as HTMLInputElement).value })"
      >
      <input
        :value="data.prep.opponent"
        placeholder="Opponent"
        class="w-48 rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 text-sm"
        @change="updatePrep({ opponent: ($event.target as HTMLInputElement).value })"
      >
    </div>

    <div class="grid items-start gap-5 2xl:grid-cols-[260px_minmax(0,1fr)]">
      <!-- Scenario list -->
      <nav class="flex gap-2 overflow-x-auto pb-1 2xl:sticky 2xl:top-4 2xl:max-h-[calc(100vh-2rem)] 2xl:flex-col 2xl:overflow-x-hidden 2xl:overflow-y-auto 2xl:p-1">
        <ScenarioThumb
          v-for="s in data.scenarios"
          :key="s.id"
          class="w-60 shrink-0 2xl:w-auto"
          :scenario="s"
          :active="s.id === selected?.id"
          :icon-url="iconUrl"
          :name-of="nameOf"
          @click="selectedId = s.id"
        />
        <button
          type="button"
          class="w-60 shrink-0 cursor-pointer rounded-lg border border-dashed border-zinc-700 p-3 text-sm text-zinc-400 hover:border-zinc-500 hover:text-zinc-100 2xl:w-auto"
          @click="addScenario()"
        >
          + New draft
        </button>
      </nav>

      <ScenarioEditor
        v-if="selected"
        :key="selected.id"
        :scenario="selected"
        :champions="champions"
        :icon-url="iconUrl"
        :name-of="nameOf"
        @update="patch => patchScenario(selected!, patch)"
        @duplicate="addScenario(selected!.id)"
        @remove="removeScenario(selected!)"
      />
    </div>
  </div>
</template>
