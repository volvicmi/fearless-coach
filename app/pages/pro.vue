<script setup lang="ts">
import type { ProMeta, ProTournament, SyncStatus } from '#shared/types'

const { data, refresh } = await useFetch<{ tournaments: ProTournament[], meta: ProMeta }>('/api/pro')
const { byId, iconUrl } = await useChampions()
const nameOf = (id: string) => byId.value.get(id)?.name ?? id

const newName = ref('')
const statuses = reactive<Record<string, SyncStatus>>({})
const showAll = ref(false)
const champs = computed(() => (data.value?.meta.champions ?? []).slice(0, showAll.value ? undefined : 40))

let timer: ReturnType<typeof setInterval> | undefined
onBeforeUnmount(() => clearInterval(timer))

/** Polls every running import until all are done, then reloads the data. */
function poll() {
  clearInterval(timer)
  timer = setInterval(async () => {
    const running = Object.keys(statuses).filter(n => statuses[n]!.state === 'running')
    if (!running.length) {
      clearInterval(timer)
      await refresh()
      return
    }
    for (const name of running) statuses[name] = await $fetch<SyncStatus>('/api/pro/sync', { query: { name } })
  }, 1500)
}

async function sync(name: string) {
  statuses[name] = await $fetch<SyncStatus>('/api/pro/sync', { method: 'POST', body: { name } })
  poll()
}

async function add() {
  const name = newName.value.trim()
  if (!name) return
  statuses[name] = await $fetch<SyncStatus>('/api/pro/tournaments', { method: 'POST', body: { name } })
  newName.value = ''
  await refresh()
  poll()
}

async function remove(name: string) {
  if (!confirm(`Remove "${name}" and its imported data?`)) return
  await $fetch(`/api/pro/tournaments/${encodeURIComponent(name)}`, { method: 'DELETE' })
  await refresh()
}

const pct = (x: number) => `${Math.round(x * 100)}%`
const wrClass = (wr: number) => (wr >= 0.55 ? 'text-emerald-400' : wr < 0.45 ? 'text-red-400' : 'text-zinc-300')
</script>

<template>
  <div class="flex flex-col gap-6">
    <div>
      <h1 class="text-xl font-semibold">
        Pro meta
      </h1>
      <p class="text-sm text-zinc-400">
        Champion stats and real drafts from gol.gg. The AI coach uses them on every request, the suggestions give a small edge to present champions.
      </p>
    </div>

    <section class="flex flex-col gap-2">
      <div
        v-for="t in data?.tournaments"
        :key="t.name"
        class="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-800 px-4 py-3"
      >
        <a
          :href="`https://gol.gg/tournament/tournament-stats/${encodeURIComponent(t.name)}/`"
          target="_blank"
          rel="noopener noreferrer"
          class="font-medium hover:text-amber-300"
        >{{ t.name }} <span class="text-zinc-500">&#x2197;&#xFE0E;</span></a>
        <span class="text-xs text-zinc-500">
          {{ t.series }} series · {{ t.games }} drafts
          <template v-if="t.syncedAt"> · synced {{ t.syncedAt.slice(0, 16) }}</template>
        </span>
        <span v-if="statuses[t.name]" class="text-xs" :class="statuses[t.name]!.state === 'error' ? 'text-red-400' : 'text-amber-300'">
          {{ statuses[t.name]!.state === 'running' && statuses[t.name]!.total ? `${statuses[t.name]!.done}/${statuses[t.name]!.total} · ` : '' }}{{ statuses[t.name]!.message }}
        </span>
        <button
          type="button"
          class="ml-auto cursor-pointer rounded-md border border-zinc-700 px-3 py-1 text-xs hover:bg-zinc-800 disabled:opacity-40"
          :disabled="statuses[t.name]?.state === 'running'"
          @click="sync(t.name)"
        >
          {{ t.syncedAt ? 'Update' : 'Import' }}
        </button>
        <button type="button" class="cursor-pointer text-xs text-zinc-500 hover:text-red-400" @click="remove(t.name)">
          Remove
        </button>
      </div>

      <form class="flex gap-2" @submit.prevent="add">
        <input
          v-model="newName"
          placeholder="gol.gg tournament name, e.g. LCK 2026 Rounds 1-2"
          class="w-96 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm"
        >
        <button class="cursor-pointer rounded-md bg-amber-400 px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-amber-300">
          Add tournament
        </button>
      </form>
      <p class="text-xs text-zinc-500">
        Use the exact name shown in the gol.gg URL (…/tournament-stats/<b>LCK Cup 2026</b>/). Imports read one page per second.
      </p>
    </section>

    <section v-if="data?.meta.games" class="flex flex-col gap-2">
      <h2 class="font-semibold">
        Champions <span class="text-sm font-normal text-zinc-500">· {{ data.meta.games }} pro games</span>
      </h2>
      <table class="w-full text-sm">
        <thead class="text-left text-xs uppercase text-zinc-500">
          <tr>
            <th class="pb-2 font-medium">
              Champion
            </th>
            <th class="pb-2 text-right font-medium">
              Presence
            </th>
            <th class="pb-2 text-right font-medium">
              Picks
            </th>
            <th class="pb-2 text-right font-medium">
              Bans
            </th>
            <th class="pb-2 text-right font-medium">
              WR
            </th>
            <th class="pb-2 text-right font-medium" title="Average pick round">
              Round
            </th>
            <th class="pb-2 text-right font-medium" title="Blind pick %">
              Blind
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in champs" :key="c.champId" class="border-t border-zinc-900">
            <td class="py-1">
              <span class="flex items-center gap-2">
                <img :src="iconUrl(c.champId)" :alt="nameOf(c.champId)" class="size-6 rounded">
                {{ nameOf(c.champId) }}
              </span>
            </td>
            <td class="text-right tabular-nums">
              <span class="inline-flex items-center gap-2">
                <span class="h-1.5 w-16 overflow-hidden rounded-full bg-zinc-800">
                  <span class="block h-full bg-amber-400" :style="{ width: pct(c.presence) }" />
                </span>
                {{ pct(c.presence) }}
              </span>
            </td>
            <td class="text-right tabular-nums text-zinc-400">
              {{ c.picks }}
            </td>
            <td class="text-right tabular-nums text-zinc-400">
              {{ c.bans }}
            </td>
            <td class="text-right tabular-nums" :class="c.picks ? wrClass(c.winRate) : 'text-zinc-600'">
              {{ c.picks ? pct(c.winRate) : '–' }}
            </td>
            <td class="text-right tabular-nums text-zinc-400">
              {{ c.avgRound || '–' }}
            </td>
            <td class="text-right tabular-nums text-zinc-400">
              {{ c.picks ? `${c.blindPct}%` : '–' }}
            </td>
          </tr>
        </tbody>
      </table>
      <button
        v-if="(data.meta.champions.length ?? 0) > 40"
        type="button"
        class="cursor-pointer self-start text-xs text-zinc-500 hover:text-zinc-200"
        @click="showAll = !showAll"
      >
        {{ showAll ? 'Show less' : `Show all ${data.meta.champions.length} champions` }}
      </button>
    </section>
  </div>
</template>
