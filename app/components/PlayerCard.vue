<script setup lang="ts">
import { ROLES, TIERS } from '#shared/types'
import type { Champion, Player, PoolEntry, Tier } from '#shared/types'
import type { DropTarget } from '~/composables/useChampionDrag'

const props = defineProps<{
  player: Player
  champions: Champion[]
  iconUrl: (id: string) => string
  nameOf: (id: string) => string
}>()
const emit = defineEmits<{ changed: [] }>()

/** Local copy so a drop shows instantly; resynced whenever the server data comes back. */
const pool = ref<PoolEntry[]>([...props.player.pool])
watch(() => props.player.pool, p => (pool.value = [...p]))

const byTier = computed(() => TIERS.map(tier => ({ tier, entries: pool.value.filter(e => e.tier === tier) })))
const inPool = computed(() => new Map(pool.value.map(e => [e.champId, `Already ${e.tier === 'P' ? 'in Practice' : `${e.tier} tier`}`])))

const TIER_STYLE: Record<Tier, string> = {
  S: 'bg-amber-400 text-zinc-950',
  A: 'bg-emerald-500 text-zinc-950',
  B: 'bg-sky-500 text-zinc-950',
  C: 'bg-zinc-500 text-zinc-950',
  P: 'bg-violet-500 text-zinc-950',
}
const TIER_CAPTION: Record<Tier, string> = {
  S: 'Best comfort',
  A: 'Comfortable',
  B: 'Playable',
  C: 'Pocket',
  P: 'Practice',
}

const tab = ref<'champions' | 'ranked'>('champions')

const card = ref<HTMLElement>()
useChampionDrag(card, (champId: string, target: DropTarget, index?: number) =>
  target === 'remove' ? removeChamp(champId) : setTier(champId, target as Tier, index))

async function updatePlayer(body: Partial<Pick<Player, 'name' | 'role' | 'riotId'>>) {
  await $fetch(`/api/players/${props.player.id}`, { method: 'PUT', body })
  emit('changed')
}

/** Puts a champion in `tier` at `index` (0 = leftmost = strongest), or at the end of the tier. */
async function setTier(champId: string, tier: Tier, index?: number) {
  const existing = pool.value.find(e => e.champId === champId)
  const entry: PoolEntry = { champId, tier, note: existing?.note ?? '' }
  const rest = pool.value.filter(e => e.champId !== champId)
  const sameTier = rest.filter(e => e.tier === tier)
  const at = Math.min(index ?? sameTier.length, sameTier.length)
  // Insert right before the champion currently at that place (or after the tier's last one).
  const anchor = sameTier[at]
  const insertAt = anchor
    ? rest.indexOf(anchor)
    : sameTier.length ? rest.indexOf(sameTier[sameTier.length - 1]!) + 1 : rest.length
  pool.value = [...rest.slice(0, insertAt), entry, ...rest.slice(insertAt)]

  await $fetch(`/api/players/${props.player.id}/pool/${champId}`, { method: 'PUT', body: { tier, index } })
  emit('changed')
}

async function removeChamp(champId: string) {
  pool.value = pool.value.filter(e => e.champId !== champId)
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
  <article ref="card" class="flex flex-col gap-4">
    <!-- Player info -->
    <div class="flex flex-wrap items-center gap-3">
      <input
        :value="player.name"
        class="w-44 rounded-md border border-transparent bg-transparent px-1 text-lg font-semibold hover:border-zinc-700 focus:border-amber-400 focus:outline-none"
        @change="updatePlayer({ name: ($event.target as HTMLInputElement).value })"
      >
      <select
        :value="player.role"
        class="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm capitalize"
        @change="updatePlayer({ role: ($event.target as HTMLSelectElement).value as Player['role'] })"
      >
        <option v-for="r in ROLES" :key="r" :value="r">
          {{ r }}
        </option>
      </select>
      <input
        :value="player.riotId"
        placeholder="Riot ID (Name#TAG)"
        class="w-56 rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 text-sm"
        @change="updatePlayer({ riotId: ($event.target as HTMLInputElement).value })"
      >
      <button type="button" class="ml-auto text-xs text-zinc-500 hover:text-red-400" @click="removePlayer">
        Remove player
      </button>
    </div>

    <!-- select-none: no blue text selection while dragging champions around -->
    <div class="grid select-none items-start gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
      <!-- Tier list -->
      <div class="flex flex-col gap-2">
        <div
          v-for="group in byTier"
          :key="group.tier"
          :data-tier-drop="group.tier"
          class="flex min-h-[88px] overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/40 transition-colors"
          :class="group.tier === 'P' && 'mt-3'"
        >
          <div class="flex w-20 shrink-0 flex-col items-center justify-center gap-0.5" :class="TIER_STYLE[group.tier]">
            <span class="font-black leading-none" :class="group.tier === 'P' ? 'text-lg' : 'text-3xl'">
              {{ group.tier === 'P' ? '⟳' : group.tier }}
            </span>
            <span class="text-[10px] font-semibold uppercase tracking-wide opacity-80">{{ TIER_CAPTION[group.tier] }}</span>
          </div>
          <div data-tier-items class="flex flex-1 flex-wrap content-start items-start gap-2 p-2">
            <span v-if="!group.entries.length" class="self-center px-2 text-xs text-zinc-600">
              {{ group.tier === 'P' ? 'Drop the champions this player is training' : 'Drop champions here' }}
            </span>
            <div v-for="e in group.entries" :key="e.champId" class="group relative w-16">
              <div
                :data-drag-champ="e.champId"
                :data-drag-from="e.tier"
                class="flex cursor-grab touch-none flex-col items-center gap-0.5 rounded-md p-1 hover:bg-zinc-800 active:cursor-grabbing"
                :title="`${nameOf(e.champId)} · drag to reorder (left = strongest), move to another row, or drop on the champion list to remove`"
              >
                <img :src="iconUrl(e.champId)" :alt="nameOf(e.champId)" draggable="false" class="size-14 select-none rounded-md">
                <span class="w-full truncate text-center text-[10px] text-zinc-400">{{ nameOf(e.champId) }}</span>
              </div>
              <button
                type="button"
                class="absolute -right-1 -top-1 hidden size-5 cursor-pointer place-items-center rounded-full bg-zinc-950 text-zinc-400 shadow ring-1 ring-zinc-700 transition-colors hover:bg-red-600 hover:text-white hover:ring-red-500 group-hover:grid"
                :title="`Remove ${nameOf(e.champId)}`"
                @click="removeChamp(e.champId)"
              >
                <svg viewBox="0 0 12 12" class="size-2.5" aria-hidden="true">
                  <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Side panel: also the "remove" drop zone -->
      <aside data-tier-drop="remove" class="flex flex-col gap-3 rounded-lg border border-zinc-800 p-3 transition-colors xl:sticky xl:top-4 xl:h-[640px]">
        <div class="flex gap-1 rounded-md bg-zinc-900 p-1 text-sm">
          <button
            v-for="t in (['champions', 'ranked'] as const)"
            :key="t"
            type="button"
            class="flex-1 rounded px-3 py-1"
            :class="tab === t ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'"
            @click="tab = t"
          >
            {{ t === 'champions' ? 'Champions' : `Ranked${player.soloq?.games ? ` (${player.soloq.games})` : ''}` }}
          </button>
        </div>

        <!-- Enter (or a click) adds at the end of B; drag for a precise spot -->
        <ChampionGrid
          v-if="tab === 'champions'"
          class="min-h-80 flex-1"
          :champions="champions"
          :disabled="inPool"
          :icon-url="iconUrl"
          :active="true"
          drag-source
          @select="id => setTier(id, 'B')"
        />
        <SoloqPanel v-else class="min-h-0 flex-1 overflow-y-auto" :player="player" :icon-url="iconUrl" :name-of="nameOf" @changed="emit('changed')" />

        <p class="text-center text-[11px] text-zinc-600">
          Drag a champion onto a row · Enter adds the first match to B · drag back here to remove
        </p>
      </aside>
    </div>
  </article>
</template>
