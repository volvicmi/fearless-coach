<script setup lang="ts">
import { ROLES, TIERS } from '#shared/types'
import type { Champion, Player, Tier } from '#shared/types'

const props = defineProps<{
  player: Player
  champions: Champion[]
  iconUrl: (id: string) => string
  nameOf: (id: string) => string
}>()
const emit = defineEmits<{ changed: [] }>()

const picking = ref(false)
const newTier = ref<Tier>('A')

const byTier = computed(() =>
  TIERS.map(tier => ({ tier, entries: props.player.pool.filter(e => e.tier === tier) })))

const inPool = computed(() => new Map(props.player.pool.map(e => [e.champId, `Already ${e.tier} tier`])))

const TIER_STYLE: Record<Tier, string> = {
  S: 'bg-amber-400 text-zinc-950',
  A: 'bg-emerald-500 text-zinc-950',
  B: 'bg-sky-500 text-zinc-950',
  C: 'bg-zinc-600 text-zinc-100',
}

async function updatePlayer(body: Partial<Pick<Player, 'name' | 'role' | 'riotId'>>) {
  await $fetch(`/api/players/${props.player.id}`, { method: 'PUT', body })
  emit('changed')
}

async function setTier(champId: string, tier: Tier) {
  await $fetch(`/api/players/${props.player.id}/pool/${champId}`, { method: 'PUT', body: { tier } })
  emit('changed')
}

/** Click on a pool icon cycles S → A → B → C → S. */
function cycleTier(champId: string, tier: Tier) {
  return setTier(champId, TIERS[(TIERS.indexOf(tier) + 1) % TIERS.length]!)
}

async function removeChamp(champId: string) {
  await $fetch(`/api/players/${props.player.id}/pool/${champId}`, { method: 'DELETE' })
  emit('changed')
}

async function removePlayer() {
  if (!confirm(`Remove ${props.player.name} and their pool?`)) return
  await $fetch(`/api/players/${props.player.id}`, { method: 'DELETE' })
  emit('changed')
}
</script>

<template>
  <article class="flex flex-col gap-3 rounded-lg border border-zinc-800 p-4">
    <div class="flex flex-wrap items-center gap-2">
      <input
        :value="player.name"
        class="w-36 rounded-md border border-transparent bg-transparent px-1 font-semibold hover:border-zinc-700 focus:border-amber-400 focus:outline-none"
        @change="updatePlayer({ name: ($event.target as HTMLInputElement).value })"
      >
      <select
        :value="player.role"
        class="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs capitalize"
        @change="updatePlayer({ role: ($event.target as HTMLSelectElement).value as Player['role'] })"
      >
        <option v-for="r in ROLES" :key="r" :value="r">
          {{ r }}
        </option>
      </select>
      <input
        :value="player.riotId"
        placeholder="Riot ID (Name#TAG)"
        class="min-w-0 flex-1 rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs"
        @change="updatePlayer({ riotId: ($event.target as HTMLInputElement).value })"
      >
      <button type="button" class="text-xs text-zinc-500 hover:text-red-400" @click="removePlayer">
        Remove
      </button>
    </div>

    <div class="flex flex-col gap-2">
      <div v-for="group in byTier" :key="group.tier" class="flex items-start gap-2">
        <span class="mt-1.5 w-6 rounded text-center text-xs font-bold" :class="TIER_STYLE[group.tier]">{{ group.tier }}</span>
        <div class="flex min-h-9 flex-1 flex-wrap gap-1">
          <span v-if="!group.entries.length" class="self-center text-xs text-zinc-600">—</span>
          <div v-for="e in group.entries" :key="e.champId" class="group relative">
            <button
              type="button"
              :title="`${nameOf(e.champId)} · click to change tier`"
              @click="cycleTier(e.champId, e.tier)"
            >
              <img :src="iconUrl(e.champId)" :alt="nameOf(e.champId)" class="size-9 rounded">
            </button>
            <button
              type="button"
              class="absolute -right-1 -top-1 hidden size-4 items-center justify-center rounded-full bg-red-600 text-[10px] leading-none group-hover:flex"
              :title="`Remove ${nameOf(e.champId)}`"
              @click="removeChamp(e.champId)"
            >
              ×
            </button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="picking" class="flex flex-col gap-2 rounded-md border border-zinc-800 p-2">
      <div class="flex items-center gap-2 text-xs">
        <span class="text-zinc-400">Add as</span>
        <button
          v-for="t in TIERS"
          :key="t"
          type="button"
          class="w-7 rounded py-0.5 font-bold"
          :class="newTier === t ? TIER_STYLE[t] : 'bg-zinc-900 text-zinc-400'"
          @click="newTier = t"
        >
          {{ t }}
        </button>
        <button type="button" class="ml-auto text-zinc-400 hover:text-zinc-100" @click="picking = false">
          Done
        </button>
      </div>
      <div class="h-72">
        <ChampionGrid
          class="h-full"
          :champions="champions"
          :disabled="inPool"
          :icon-url="iconUrl"
          :active="true"
          @select="id => setTier(id, newTier)"
        />
      </div>
    </div>
    <button
      v-else
      type="button"
      class="self-start rounded-md border border-dashed border-zinc-700 px-3 py-1 text-xs text-zinc-400 hover:text-zinc-100"
      @click="picking = true"
    >
      + Add champions
    </button>
  </article>
</template>
