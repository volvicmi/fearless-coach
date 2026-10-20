<script setup lang="ts">
import type { ProMeta, ProTournament, SyncStatus } from '#shared/types'

const { data, refresh } = await useFetch<{ tournaments: ProTournament[], current: string, meta: ProMeta }>('/api/pro')

async function setCurrent(name: string) {
  await $fetch('/api/pro/current', { method: 'PUT', body: { name: data.value?.current === name ? '' : name } })
  await refresh()
}
const { byId, iconUrl } = await useChampions()
const nameOf = (id: string) => byId.value.get(id)?.name ?? id

const newName = ref('')
const statuses = reactive<Record<string, SyncStatus>>({})
const showAll = ref(false)

type SortKey = 'name' | 'presence' | 'picks' | 'bans' | 'winRate' | 'avgRound' | 'blindPct'
const COLUMNS: { key: SortKey, label: string, title?: string }[] = [
  { key: 'presence', label: 'Présence' },
  { key: 'picks', label: 'Picks' },
  { key: 'bans', label: 'Bans' },
  { key: 'winRate', label: 'WR', title: 'Taux de victoire quand il est pické (les champions avec moins de 3 picks passent en dernier)' },
  { key: 'avgRound', label: 'Tour', title: 'Tour de pick moyen' },
  { key: 'blindPct', label: 'Blind', title: '% de blind pick' },
]
const sort = ref<{ key: SortKey, desc: boolean }>({ key: 'presence', desc: true })
function sortBy(key: SortKey) {
  sort.value = sort.value.key === key ? { key, desc: !sort.value.desc } : { key, desc: key !== 'name' && key !== 'avgRound' }
}
const MIN_PICKS_FOR_WR = 3

const champs = computed(() => {
  const { key, desc } = sort.value
  const list = [...(data.value?.meta.champions ?? [])].sort((a, b) => {
    // Win rate on 1-2 games means nothing: those go last whatever the direction.
    if (key === 'winRate' || key === 'avgRound' || key === 'blindPct') {
      const okA = a.picks >= (key === 'winRate' ? MIN_PICKS_FOR_WR : 1)
      const okB = b.picks >= (key === 'winRate' ? MIN_PICKS_FOR_WR : 1)
      if (okA !== okB) return okA ? -1 : 1
    }
    const diff = key === 'name' ? nameOf(a.champId).localeCompare(nameOf(b.champId)) : a[key] - b[key]
    return (desc ? -diff : diff) || b.presence - a.presence
  })
  return list.slice(0, showAll.value ? undefined : 40)
})
const arrow = (key: SortKey) => (sort.value.key === key ? (sort.value.desc ? ' ↓' : ' ↑') : '')

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
  if (!(await askConfirm(`Retirer « ${name} » et ses données importées ?`, { confirmLabel: 'Retirer', danger: true }))) return
  await $fetch(`/api/pro/tournaments/${encodeURIComponent(name)}`, { method: 'DELETE' })
  await refresh()
}

const pct = (x: number) => `${Math.round(x * 100)}%`
const wrClass = (wr: number) => (wr >= 0.55 ? 'text-emerald-400' : wr < 0.45 ? 'text-red-400' : 'text-zinc-300')
</script>

<template>
  <div class="flex flex-col gap-6">
    <div>
      <h1 class="text-3xl font-bold">
        Méta pro
      </h1>
      <p class="text-sm text-zinc-400">
        Stats des champions et vraies drafts issues de gol.gg. Le coach IA les utilise à chaque demande, les suggestions donnent un léger avantage aux champions présents.
      </p>
    </div>

    <section class="flex flex-col gap-2">
      <div
        v-for="t in data?.tournaments"
        :key="t.name"
        class="cut flex flex-wrap items-center gap-3 px-4 py-3 bg-zinc-900"
      >
        <a
          :href="`https://gol.gg/tournament/tournament-stats/${encodeURIComponent(t.name)}/`"
          target="_blank"
          rel="noopener noreferrer"
          class="font-medium hover:text-amber-300"
        >{{ t.name }} <span class="text-zinc-500">&#x2197;&#xFE0E;</span></a>
        <button
          type="button"
          class="cursor-pointer rounded-full border px-2 py-0.5 text-[11px]"
          :class="data?.current === t.name ? 'tab-on' : 'border-transparent text-zinc-500 hover:text-zinc-200 bg-zinc-900'"
          :title="data?.current === t.name ? 'Cliquer pour retirer' : 'Le tournoi que nous jouons en ce moment'"
          @click="setCurrent(t.name)"
        >
          {{ data?.current === t.name ? '★ Tournoi en cours' : 'Définir comme tournoi en cours' }}
        </button>
        <span class="text-xs text-zinc-500">
          {{ t.series }} séries · {{ t.games }} drafts
          <template v-if="t.syncedAt"> · synchronisé le {{ t.syncedAt.slice(0, 16) }}</template>
        </span>
        <span v-if="statuses[t.name]" class="text-xs" :class="statuses[t.name]!.state === 'error' ? 'text-red-400' : 'text-amber-300'">
          {{ statuses[t.name]!.state === 'running' && statuses[t.name]!.total ? `${statuses[t.name]!.done}/${statuses[t.name]!.total} · ` : '' }}{{ statuses[t.name]!.message }}
        </span>
        <button
          type="button"
          class="ml-auto cursor-pointer px-3 py-1 text-xs disabled:opacity-40 bg-zinc-800 hover:bg-zinc-700 font-display font-semibold uppercase tracking-wider"
          :disabled="statuses[t.name]?.state === 'running'"
          @click="sync(t.name)"
        >
          {{ t.syncedAt ? 'Mettre à jour' : 'Importer' }}
        </button>
        <button type="button" class="cursor-pointer text-xs text-zinc-500 hover:text-red-400" @click="remove(t.name)">
          Retirer
        </button>
      </div>

      <form class="flex gap-2" @submit.prevent="add">
        <input
          v-model="newName"
          placeholder="Nom du tournoi sur gol.gg, ex. LCK 2026 Rounds 1-2"
          class="w-96 rounded-md bg-zinc-800 px-3 py-1.5 text-sm"
        >
        <button class="btn-action cursor-pointer text-sm">
          Ajouter un tournoi
        </button>
      </form>
      <p class="text-xs text-zinc-500">
        Utilise le nom exact affiché dans l’URL gol.gg (…/tournament-stats/<b>LCK Cup 2026</b>/). Les imports lisent une page par seconde.
      </p>
    </section>

    <section v-if="data?.meta.games" class="flex flex-col gap-2">
      <h2 class="font-semibold">
        Champions <span class="text-sm font-normal text-zinc-500">· {{ data.meta.games }} games pro</span>
      </h2>
      <table class="w-full text-sm">
        <thead class="text-left text-xs uppercase text-zinc-500">
          <tr>
            <th class="pb-2 font-medium">
              <button type="button" class="cursor-pointer uppercase hover:text-zinc-200" :class="sort.key === 'name' && 'text-amber-300'" @click="sortBy('name')">
                Champion{{ arrow('name') }}
              </button>
            </th>
            <th v-for="col in COLUMNS" :key="col.key" class="pb-2 text-right font-medium">
              <button
                type="button"
                class="cursor-pointer uppercase hover:text-zinc-200"
                :class="sort.key === col.key && 'text-amber-300'"
                :title="col.title ?? `Trier par ${col.label}`"
                @click="sortBy(col.key)"
              >
                {{ col.label }}{{ arrow(col.key) }}
              </button>
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
        {{ showAll ? 'Afficher moins' : `Afficher les ${data.meta.champions.length} champions` }}
      </button>
    </section>
  </div>
</template>
