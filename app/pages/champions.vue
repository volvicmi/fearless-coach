<script setup lang="ts">
import { CHAMPION_ROLES } from '#shared/champion-roles'
import { CRITERIA, TIERS } from '#shared/champion-traits'
import type { CriterionId, Tier } from '#shared/champion-traits'
import type { Role } from '#shared/types'
import type { DropTarget } from '~/composables/useChampionDrag'

interface TraitEntry { criterion: CriterionId, champId: string, tier: Tier, position: number }

definePageMeta({ fitScreen: true })

const { champions, byId, iconUrl } = await useChampions()
const nameOf = (id: string) => byId.value.get(id)?.name ?? id
const { data: entries, refresh } = await useFetch<TraitEntry[]>('/api/traits')
// Another browser changed a list: reload it (see server/utils/live.ts)
useLive('traits', () => refresh())

const ROLES: { id: Role, label: string }[] = [
  { id: 'top', label: 'Top' },
  { id: 'jungle', label: 'Jungle' },
  { id: 'mid', label: 'Mid' },
  { id: 'adc', label: 'ADC' },
  { id: 'support', label: 'Support' },
]
const TIER_STYLE: Record<Tier, string> = {
  S: 'bg-tier-s text-zinc-950',
  A: 'bg-tier-a text-zinc-950',
  B: 'bg-tier-b text-zinc-950',
  C: 'bg-tier-c text-zinc-950',
}

const role = ref<Role | null>(null)
const criterion = ref<CriterionId | null>(null)
const search = ref('')
const board = ref<HTMLElement>()

const hint = computed(() => CRITERIA.find(c => c.id === criterion.value)?.hint)
/** Champions that can fill the chosen role (all of them without a role). */
const pickable = computed(() => champions.value.filter(c => !role.value || CHAMPION_ROLES[c.id]?.includes(role.value)))

/** Without a criterion: plain alphabetical list. */
const alphabetical = computed(() => {
  const q = search.value.trim().toLowerCase()
  return pickable.value
    .filter(c => !q || c.name.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name))
})

/** With a criterion: the three rows of the list, best first inside each row. */
const byTier = computed(() => TIERS.map(tier => ({
  tier,
  entries: (entries.value ?? [])
    .filter(e => e.criterion === criterion.value && e.tier === tier)
    .sort((a, b) => a.position - b.position),
})))
/** Champions already in this list: the grid greys them out. */
const placed = computed(() => new Map(
  (entries.value ?? [])
    .filter(e => e.criterion === criterion.value)
    .map(e => [e.champId, `Déjà en tier ${e.tier}`]),
))

async function setTier(champId: string, tier: Tier, index?: number) {
  if (!criterion.value) return
  await $fetch(`/api/traits/${criterion.value}/${champId}`, { method: 'PUT', body: { tier, index } })
  await refresh()
}

async function removeChamp(champId: string) {
  if (!criterion.value) return
  await $fetch(`/api/traits/${criterion.value}/${champId}`, { method: 'DELETE' })
  await refresh()
}

useChampionDrag(board, (champId: string, target: DropTarget, index?: number) =>
  target === 'remove' ? removeChamp(champId) : setTier(champId, target as Tier, index))
</script>

<template>
  <div ref="board" class="flex min-h-0 flex-1 flex-col gap-4 select-none">
    <div>
      <h1 class="text-3xl font-bold">
        Champions
      </h1>
      <p class="text-sm text-zinc-400">
        Choisis un domaine pour classer les champions en tiers S / A / B / C. Glisse-les, ajoute-les depuis la grille, retire-les en les lâchant sur la grille.
      </p>
    </div>

    <div class="flex flex-wrap items-center gap-2 text-sm">
      <span class="text-zinc-400">Rôle</span>
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
      <span class="text-zinc-400">Domaine</span>
      <button
        v-for="c in [{ id: null, label: 'Aucun (A → Z)' }, ...CRITERIA]"
        :key="String(c.id)"
        type="button"
        class="cursor-pointer rounded-md px-3 py-1"
        :class="criterion === c.id ? 'bg-amber-500 text-zinc-950' : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800'"
        @click="criterion = c.id as CriterionId | null"
      >
        {{ c.label }}
      </button>
    </div>
    <!-- Ligne toujours présente : les filtres ne font pas sauter la mise en page -->
    <p class="min-h-4 text-xs text-zinc-500">
      <template v-if="hint">{{ hint }}</template>
      <template v-else-if="!criterion">{{ alphabetical.length }} champions</template>
    </p>

    <input v-if="!criterion" v-model="search" type="search" placeholder="Chercher…" class="w-44 rounded-md bg-zinc-800 px-3 py-1.5 text-sm">

    <!-- Seule la liste défile ; la gouttière stable évite le décalage quand la barre apparaît -->
    <div class="-mr-2 min-h-0 flex-1 overflow-y-auto pr-2 [scrollbar-gutter:stable]">
      <!-- With a criterion: editable tier list, same behaviour as the Team tab -->
      <div v-if="criterion" class="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div class="flex flex-col gap-2">
          <div
            v-for="g in byTier"
            :key="g.tier"
            :data-tier-drop="g.tier"
            class="flex min-h-[72px] overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/40 transition-colors"
          >
            <div class="flex w-16 shrink-0 items-center justify-center text-2xl font-black" :class="TIER_STYLE[g.tier]">
              {{ g.tier }}
            </div>
            <div data-tier-items class="flex flex-1 flex-wrap content-start items-start gap-2 p-2">
              <span v-if="!g.entries.length" class="self-center px-2 text-xs text-zinc-600">Dépose des champions ici</span>
              <div v-for="e in g.entries" :key="e.champId" class="group relative w-16">
                <div
                  :data-drag-champ="e.champId"
                  :data-drag-from="g.tier"
                  class="flex cursor-grab touch-none flex-col items-center gap-0.5 rounded-md p-1 hover:bg-zinc-800 active:cursor-grabbing"
                  :title="`${nameOf(e.champId)} · glisse pour réordonner (à gauche = le plus fort)`"
                >
                  <img :src="iconUrl(e.champId)" :alt="nameOf(e.champId)" draggable="false" class="size-12 select-none rounded-md">
                  <span class="w-full truncate text-center text-[10px] text-zinc-400">{{ nameOf(e.champId) }}</span>
                </div>
                <button
                  type="button"
                  class="absolute -right-1 -top-1 hidden size-5 cursor-pointer place-items-center rounded-full bg-zinc-950 text-xs leading-none text-zinc-400 shadow ring-1 ring-zinc-700 hover:bg-red-600 hover:text-white group-hover:grid"
                  :title="`Retirer ${nameOf(e.champId)}`"
                  @click="removeChamp(e.champId)"
                >
                  ×
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Side panel: add from here, and the "remove" drop zone -->
        <aside data-tier-drop="remove" class="flex flex-col gap-2 rounded-lg border border-zinc-800 p-3 transition-colors">
          <ChampionGrid
            class="min-h-80 flex-1"
            :champions="pickable"
            :disabled="placed"
            :icon-url="iconUrl"
            :active="true"
            drag-source
            @select="id => setTier(id, 'B')"
          />
          <p class="text-center text-[11px] text-zinc-600">
            Clic ou Entrée ajoute en B · glisse sur une ligne pour placer · lâche ici pour retirer
          </p>
        </aside>
      </div>

      <!-- Without a criterion: plain list -->
      <div v-else class="flex flex-wrap content-start gap-2">
        <div v-for="c in alphabetical" :key="c.id" class="flex w-16 flex-col items-center gap-1" :title="c.name">
          <img :src="iconUrl(c.id)" :alt="c.name" class="h-12 w-12 rounded-md">
          <span class="w-full truncate text-center text-[11px] text-zinc-300">{{ c.name }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
