<script setup lang="ts">
import { CHAMPION_ROLES } from '#shared/champion-roles'
import { CRITERIA, TIERS, TRAITS_STATUS, sortChampions, tierOf } from '#shared/champion-traits'
import type { CriterionId } from '#shared/champion-traits'
import type { Role } from '#shared/types'

const { champions, iconUrl } = await useChampions()

const ROLES: { id: Role, label: string }[] = [
  { id: 'top', label: 'Top' },
  { id: 'jungle', label: 'Jungle' },
  { id: 'mid', label: 'Mid' },
  { id: 'adc', label: 'ADC' },
  { id: 'support', label: 'Support' },
]
const TIER_STYLE = { S: 'bg-amber-500 text-zinc-950', A: 'bg-emerald-600 text-white', B: 'bg-zinc-600 text-white' }

const role = ref<Role | null>(null)
const criterion = ref<CriterionId | null>(null)
const search = ref('')

const rows = computed(() => {
  const q = search.value.trim().toLowerCase()
  const pool = champions.value.filter(c =>
    (!role.value || CHAMPION_ROLES[c.id]?.includes(role.value)) && (!q || c.name.toLowerCase().includes(q)))
  return sortChampions(pool, criterion.value)
})
const hint = computed(() => CRITERIA.find(c => c.id === criterion.value)?.hint)
</script>

<template>
  <div class="flex flex-col gap-4">
    <div>
      <h1 class="text-xl font-semibold">
        Champions
      </h1>
      <p class="text-sm text-zinc-400">
        Filtre par rôle, trie par ordre alphabétique ou par les meilleurs dans un domaine.
      </p>
    </div>

    <p class="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
      {{ TRAITS_STATUS }}
    </p>

    <div class="flex flex-wrap items-center gap-2 text-sm">
      <input v-model="search" type="search" placeholder="Chercher…" class="w-44 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5">
      <span class="ml-3 text-zinc-400">Rôle</span>
      <button
        v-for="r in [{ id: null, label: 'Tous' }, ...ROLES]"
        :key="String(r.id)"
        type="button"
        class="cursor-pointer rounded-md px-3 py-1"
        :class="role === r.id ? 'bg-zinc-100 text-zinc-950' : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800'"
        @click="role = r.id as Role | null"
      >
        {{ r.label }}
      </button>
    </div>

    <div class="flex flex-wrap items-center gap-2 text-sm">
      <span class="text-zinc-400">Trier</span>
      <button
        v-for="c in [{ id: null, label: 'A → Z' }, ...CRITERIA]"
        :key="String(c.id)"
        type="button"
        class="cursor-pointer rounded-md px-3 py-1"
        :class="criterion === c.id ? 'bg-amber-500 text-zinc-950' : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800'"
        @click="criterion = c.id as CriterionId | null"
      >
        {{ c.label }}
      </button>
    </div>
    <p v-if="hint" class="text-xs text-zinc-500">
      {{ hint }} · {{ rows.length }} champions
    </p>

    <template v-if="criterion">
      <section v-for="t in TIERS" :key="t" class="flex items-start gap-3">
        <span class="flex h-12 w-10 shrink-0 items-center justify-center rounded-md text-lg font-bold" :class="TIER_STYLE[t]">{{ t }}</span>
        <div class="flex flex-wrap gap-2">
          <div v-for="c in rows.filter(r => tierOf(criterion!, r.id) === t)" :key="c.id" class="flex w-16 flex-col items-center gap-1" :title="c.name">
            <img :src="iconUrl(c.id)" :alt="c.name" class="h-12 w-12 rounded-md">
            <span class="w-full truncate text-center text-[11px] text-zinc-300">{{ c.name }}</span>
          </div>
          <span v-if="!rows.some(r => tierOf(criterion!, r.id) === t)" class="py-3 text-xs text-zinc-600">Aucun champion</span>
        </div>
      </section>
    </template>
    <div v-else class="flex flex-wrap gap-2">
      <div v-for="c in rows" :key="c.id" class="flex w-16 flex-col items-center gap-1" :title="c.name">
        <img :src="iconUrl(c.id)" :alt="c.name" class="h-12 w-12 rounded-md">
        <span class="w-full truncate text-center text-[11px] text-zinc-300">{{ c.name }}</span>
      </div>
    </div>
  </div>
</template>
