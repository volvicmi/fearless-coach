<script setup lang="ts">
import { ROLES } from '#shared/types'
import type { Player, Role } from '#shared/types'

const { data: team, refresh } = await useFetch<Player[]>('/api/team')
const { champions, byId, iconUrl } = await useChampions()
const nameOf = (id: string) => byId.value.get(id)?.name ?? id

const form = reactive({ name: '', role: 'top' as Role })
const selectedId = ref<number | null>(team.value?.[0]?.id ?? null)
const selected = computed(() => team.value?.find(p => p.id === selectedId.value) ?? team.value?.[0])

async function addPlayer() {
  if (!form.name.trim()) return
  const { id } = await $fetch<{ id: number }>('/api/players', { method: 'POST', body: form })
  form.name = ''
  await refresh()
  selectedId.value = id
}

const missingRoles = computed(() => ROLES.filter(r => !team.value?.some(p => p.role === r)))
const ROLE_SHORT: Record<Role, string> = { top: 'TOP', jungle: 'JGL', mid: 'MID', adc: 'ADC', support: 'SUP' }
</script>

<template>
  <div class="flex flex-col gap-5">
    <div class="flex flex-wrap items-end gap-4">
      <div>
        <h1 class="text-xl font-semibold">
          Team
        </h1>
        <p class="text-sm text-zinc-400">
          Champion pools feed the draft suggestions and the AI coach. Drag champions between rows to rank them.
        </p>
      </div>
      <form class="ml-auto flex gap-2" @submit.prevent="addPlayer">
        <input v-model="form.name" placeholder="Player name" class="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm">
        <select v-model="form.role" class="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm capitalize">
          <option v-for="r in ROLES" :key="r" :value="r">
            {{ r }}
          </option>
        </select>
        <button class="rounded-md bg-amber-400 px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-amber-300">
          Add player
        </button>
      </form>
    </div>

    <!-- One tab per player -->
    <nav v-if="team?.length" class="flex flex-wrap gap-2 border-b border-zinc-800 pb-3">
      <button
        v-for="p in team"
        :key="p.id"
        type="button"
        class="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm"
        :class="p.id === selected?.id ? 'border-amber-400 bg-zinc-900 text-zinc-100' : 'border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'"
        @click="selectedId = p.id"
      >
        <span class="text-[10px] font-bold text-zinc-500">{{ ROLE_SHORT[p.role] }}</span>
        {{ p.name }}
        <span v-if="p.status === 'sub'" class="rounded bg-zinc-800 px-1 text-[10px] uppercase text-zinc-400">sub</span>
        <span class="text-xs text-zinc-500">{{ p.pool.filter(e => e.tier !== 'P').length }}</span>
      </button>
      <span v-if="missingRoles.length" class="self-center text-xs text-amber-300/80">
        Missing: <span class="capitalize">{{ missingRoles.join(', ') }}</span>
      </span>
    </nav>
    <p v-else class="text-sm text-zinc-500">
      No player yet: add your five players above.
    </p>

    <PlayerCard
      v-if="selected"
      :key="selected.id"
      :player="selected"
      :champions="champions"
      :icon-url="iconUrl"
      :name-of="nameOf"
      @changed="refresh"
    />
  </div>
</template>
