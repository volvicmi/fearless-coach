<script setup lang="ts">
import { ROLES } from '#shared/types'
import type { Player, Role } from '#shared/types'

const { data: team, refresh } = await useFetch<Player[]>('/api/team')
// Another browser changed the team: reload it (see server/utils/live.ts)
useLive('team', () => refresh())
const { champions, byId, iconUrl } = await useChampions()
const nameOf = (id: string) => byId.value.get(id)?.name ?? id

const form = reactive({ name: '', role: 'top' as Role })
const selectedId = ref<number | null>(team.value?.[0]?.id ?? null)
const selected = computed(() => team.value?.find(p => p.id === selectedId.value) ?? team.value?.[0])
function openPlayer(id: number) {
  selectedId.value = id
}

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
        <h1 class="text-3xl font-bold">
          Équipe
        </h1>
        <p class="text-sm text-zinc-400">
          Les pools de champions alimentent les suggestions de draft et le coach IA. Glisse les champions d’une ligne à l’autre pour les classer.
        </p>
      </div>
      <form class="ml-auto flex gap-2" @submit.prevent="addPlayer">
        <input v-model="form.name" placeholder="Nom du joueur" class="rounded-md bg-zinc-800 px-3 py-1.5 text-sm">
        <select v-model="form.role" class="rounded-md bg-zinc-800 px-2 py-1.5 text-sm capitalize">
          <option v-for="r in ROLES" :key="r" :value="r">
            {{ r }}
          </option>
        </select>
        <button class="btn-action text-sm">
          Ajouter un joueur
        </button>
      </form>
    </div>

    <!-- One tab per player -->
    <nav v-if="team?.length" class="flex flex-wrap items-center gap-1 bg-zinc-900 p-1.5">
      <button
        v-for="p in team"
        :key="p.id"
        type="button"
        class="flex items-center gap-2 px-3.5 py-2 text-sm transition-colors"
        :class="p.id === selected?.id ? 'tab-on' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'"
        @click="openPlayer(p.id)"
      >
        <span class="font-display text-[11px] font-bold tracking-wider text-zinc-500">{{ ROLE_SHORT[p.role] }}</span>
        {{ p.name }}
        <span v-if="p.status === 'sub'" class="rounded bg-zinc-800 px-1 text-[10px] uppercase text-zinc-400">remp.</span>
        <span class="text-xs text-zinc-500">{{ p.pool.filter(e => e.tier !== 'P').length }}</span>
      </button>
      <span v-if="missingRoles.length" class="self-center text-xs text-amber-300/80">
        Manquants : <span class="capitalize">{{ missingRoles.join(', ') }}</span>
      </span>
    </nav>
    <p v-else class="text-sm text-zinc-500">
      Aucun joueur pour l’instant : ajoute tes cinq joueurs ci-dessus.
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
