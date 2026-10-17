<script setup lang="ts">
import type { Player, SyncStatus } from '#shared/types'

const props = defineProps<{
  player: Player
  iconUrl: (id: string) => string
  nameOf: (id: string) => string
}>()
const emit = defineEmits<{ changed: [] }>()

const status = ref<SyncStatus | null>(null)
const error = ref('')
const showAll = ref(false)
const syncing = computed(() => status.value?.state === 'running')

const soloq = computed(() => props.player.soloq)
const champs = computed(() => (soloq.value?.champions ?? []).slice(0, showAll.value ? undefined : 8))
const poolTier = computed(() => new Map(props.player.pool.map(e => [e.champId, e.tier])))

const pct = (wins: number, games: number) => (games ? Math.round((wins / games) * 100) : 0)
const kda = (c: { kills: number, deaths: number, assists: number }) =>
  ((c.kills + c.assists) / Math.max(1, c.deaths)).toFixed(1)
const wrClass = (wr: number) => (wr >= 55 ? 'text-emerald-400' : wr < 45 ? 'text-red-400' : 'text-zinc-300')

let timer: ReturnType<typeof setInterval> | undefined
onBeforeUnmount(() => clearInterval(timer))

async function sync() {
  error.value = ''
  try {
    status.value = await $fetch<SyncStatus>(`/api/players/${props.player.id}/sync`, { method: 'POST' })
  }
  catch (e: any) {
    error.value = e?.data?.statusMessage ?? 'Sync failed'
    return
  }
  clearInterval(timer)
  timer = setInterval(async () => {
    status.value = await $fetch<SyncStatus>(`/api/players/${props.player.id}/sync`)
    if (status.value.state !== 'running') {
      clearInterval(timer)
      if (status.value.state === 'error') error.value = status.value.message ?? 'Sync failed'
      emit('changed')
    }
  }, 1000)
}

async function addToPool(champId: string) {
  await $fetch(`/api/players/${props.player.id}/pool/${champId}`, { method: 'PUT', body: { tier: 'B' } })
  emit('changed')
}
</script>

<template>
  <section class="flex flex-col gap-2">
    <div class="flex flex-wrap items-center gap-2">
      <h4 class="text-xs font-semibold uppercase tracking-wide text-zinc-400">
        Ranked
      </h4>
      <span v-if="soloq?.games" class="text-xs text-zinc-500">
        {{ soloq.games }} games · <span :class="wrClass(pct(soloq.wins, soloq.games))">{{ pct(soloq.wins, soloq.games) }}% WR</span>
        <template v-if="soloq.syncedAt"> · synced {{ soloq.syncedAt.slice(0, 16).replace('T', ' ') }}</template>
      </span>
      <button
        type="button"
        class="ml-auto rounded-md border border-zinc-700 px-2 py-0.5 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
        :disabled="syncing || !player.riotId.includes('#')"
        :title="player.riotId.includes('#') ? 'Import ranked games from the Riot API' : 'Set the Riot ID (Name#TAG) first'"
        @click="sync"
      >
        {{ syncing ? (status!.total ? `${status!.done}/${status!.total}` : 'Syncing…') : 'Sync' }}
      </button>
    </div>

    <p v-if="error" class="text-xs text-red-400">
      {{ error }}
    </p>
    <p v-else-if="syncing" class="text-xs text-zinc-500">
      {{ status?.message }}
    </p>
    <p v-else-if="!soloq?.games" class="text-xs text-zinc-600">
      {{ player.riotId.includes('#') ? 'No ranked games imported yet: click Sync.' : 'Add the Riot ID (Name#TAG) to import ranked games.' }}
    </p>

    <table v-if="champs.length" class="w-full text-xs">
      <thead class="text-left text-[10px] uppercase text-zinc-500">
        <tr>
          <th class="pb-1 font-medium">
            Champion
          </th>
          <th class="pb-1 text-right font-medium">
            Games
          </th>
          <th class="pb-1 text-right font-medium">
            WR
          </th>
          <th class="pb-1 text-right font-medium">
            KDA
          </th>
          <th class="pb-1 text-right font-medium" title="Games in the last 30 days">
            30d
          </th>
          <th class="pb-1 text-right font-medium">
            Pool
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="c in champs" :key="c.champId" class="border-t border-zinc-900">
          <td class="py-1">
            <span
              :data-drag-champ="c.champId"
              :data-drag-from="poolTier.get(c.champId)"
              class="flex cursor-grab touch-none items-center gap-1.5"
              title="Drag onto a tier row"
            >
              <img :src="iconUrl(c.champId)" :alt="nameOf(c.champId)" draggable="false" class="size-5 select-none rounded">
              {{ nameOf(c.champId) }}
              <span v-if="c.role && c.role !== player.role" class="text-[10px] capitalize text-zinc-500">({{ c.role }})</span>
            </span>
          </td>
          <td class="text-right tabular-nums">
            {{ c.games }}
          </td>
          <td class="text-right tabular-nums" :class="wrClass(pct(c.wins, c.games))">
            {{ pct(c.wins, c.games) }}%
          </td>
          <td class="text-right tabular-nums text-zinc-400">
            {{ kda(c) }}
          </td>
          <td class="text-right tabular-nums text-zinc-400">
            {{ c.recent || '–' }}
          </td>
          <td class="text-right">
            <span v-if="poolTier.get(c.champId)" class="font-semibold text-zinc-300">{{ poolTier.get(c.champId) }}</span>
            <button
              v-else
              type="button"
              class="rounded px-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
              :title="`Add ${nameOf(c.champId)} to the pool as B tier`"
              @click="addToPool(c.champId)"
            >
              +
            </button>
          </td>
        </tr>
      </tbody>
    </table>
    <button
      v-if="(soloq?.champions.length ?? 0) > 8"
      type="button"
      class="self-start text-xs text-zinc-500 hover:text-zinc-200"
      @click="showAll = !showAll"
    >
      {{ showAll ? 'Show less' : `Show all ${soloq!.champions.length} champions` }}
    </button>
  </section>
</template>
