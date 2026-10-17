<script setup lang="ts">
import { ROLES } from '#shared/types'
import type { Player, Role } from '#shared/types'

const { data: team, refresh } = await useFetch<Player[]>('/api/team')
const { champions, byId, iconUrl } = await useChampions()
const nameOf = (id: string) => byId.value.get(id)?.name ?? id

const form = reactive({ name: '', role: 'top' as Role })

async function addPlayer() {
  if (!form.name.trim()) return
  await $fetch('/api/players', { method: 'POST', body: form })
  form.name = ''
  await refresh()
}

const missingRoles = computed(() => ROLES.filter(r => !team.value?.some(p => p.role === r)))
</script>

<template>
  <div class="flex flex-col gap-5">
    <div class="flex flex-wrap items-end gap-4">
      <div>
        <h1 class="text-xl font-semibold">
          Team
        </h1>
        <p class="text-sm text-zinc-400">
          Champion pools feed the draft suggestions. Click a champion to change its tier, hover it to remove it.
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

    <p v-if="missingRoles.length" class="text-sm text-amber-300/80">
      No player yet for: <span class="capitalize">{{ missingRoles.join(', ') }}</span>
    </p>

    <div class="grid gap-4 lg:grid-cols-2">
      <PlayerCard
        v-for="p in team"
        :key="p.id"
        :player="p"
        :champions="champions"
        :icon-url="iconUrl"
        :name-of="nameOf"
        @changed="refresh"
      />
    </div>
  </div>
</template>
