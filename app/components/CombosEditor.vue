<script setup lang="ts">
import { CHAMPION_ROLES } from '#shared/champion-roles'
import { PREP_ROLE_LABEL } from '#shared/prep'
import { ROLES } from '#shared/types'
import type { Champion, Combo, Role } from '#shared/types'
import type { DropTarget } from '~/composables/useChampionDrag'

const props = defineProps<{
  champions: Champion[]
  iconUrl: (id: string) => string
  nameOf: (id: string) => string
}>()

const { data: combos, refresh } = await useFetch<Combo[]>('/api/combos')

/** Ordre choisi par glisser-déposer, filtrable sur le rôle du champion de départ. */
const roleFilter = ref<Role | ''>('')
const ROLE_TABS = [{ id: '' as const, label: 'Tous' }, ...ROLES.map(role => ({ id: role, label: PREP_ROLE_LABEL[role] }))]
const shown = computed(() => (combos.value ?? [])
  .filter(c => !roleFilter.value || CHAMPION_ROLES[c.anchor]?.includes(roleFilter.value)))

const list = ref<HTMLElement>()
/** Place le combo `id` à l'endroit de `target` (avant ou après selon le sens du déplacement). */
function moveCombo(id: number, target: number) {
  const ids = combos.value!.map(c => c.id)
  const down = ids.indexOf(id) < ids.indexOf(target)
  ids.splice(ids.indexOf(id), 1)
  ids.splice(ids.indexOf(target) + (down ? 1 : 0), 0, id)
  combos.value = ids.map(i => combos.value!.find(c => c.id === i)!)
}
async function saveOrder() {
  try { await $fetch('/api/combos/order', { method: 'PUT', body: { ids: combos.value!.map(c => c.id) } }) }
  catch { await refresh() }
}
const { dragging } = useCardReorder(list, moveCombo, saveOrder)

/** Drop zones: "new" (start a combo), "a:<id>" (its champion), "p:<id>" (its partners), "remove" (the list). */
const zoneId = (kind: 'a' | 'p', c: Combo) => `${kind}:${c.id}`
const parse = (zone?: string) => {
  const [kind, id] = (zone ?? '').split(':')
  return { kind, combo: combos.value?.find(c => c.id === Number(id)) }
}

async function save(c: Combo, patch: Partial<Combo>) {
  // Instant on screen (useFetch data is a shallowRef: replace, don't mutate), then saved.
  combos.value = combos.value!.map(x => (x.id === c.id ? { ...x, ...patch } : x))
  await $fetch(`/api/combos/${c.id}`, { method: 'PUT', body: patch })
}

async function create(anchor: string) {
  await $fetch('/api/combos', { method: 'POST', body: { anchor } })
  await refresh()
}

async function removeCombo(c: Combo) {
  if (c.partners.length && !(await askConfirm(`Supprimer le combo ${props.nameOf(c.anchor)} ?`, { confirmLabel: 'Supprimer', danger: true }))) return
  await $fetch(`/api/combos/${c.id}`, { method: 'DELETE' })
  await refresh()
}

const root = ref<HTMLElement>()
useChampionDrag(root, async (champ: string, target: DropTarget, index?: number, from?: string) => {
  const src = parse(from)
  const dst = parse(target)

  if (target === 'new') return create(champ)
  if (target === 'remove') {
    if (src.kind === 'p' && src.combo) await save(src.combo, { partners: src.combo.partners.filter(p => p !== champ) })
    else if (src.kind === 'a' && src.combo) await removeCombo(src.combo)
    return
  }
  if (!dst.combo) return

  // Moving a partner out of another combo.
  if (src.kind === 'p' && src.combo && src.combo.id !== dst.combo.id) {
    await save(src.combo, { partners: src.combo.partners.filter(p => p !== champ) })
  }
  const combo = combos.value!.find(c => c.id === dst.combo!.id)!
  if (dst.kind === 'a') {
    await save(combo, { anchor: champ, partners: combo.partners.filter(p => p !== champ) })
  }
  else if (dst.kind === 'p' && champ !== combo.anchor) {
    const partners = combo.partners.filter(p => p !== champ)
    partners.splice(Math.min(index ?? partners.length, partners.length), 0, champ)
    await save(combo, { partners })
  }
})

/** Click / Enter in the list: start a new combo with that champion. */
const noteTimers = new Map<number, ReturnType<typeof setTimeout>>()
function editNote(c: Combo, note: string) {
  clearTimeout(noteTimers.get(c.id))
  noteTimers.set(c.id, setTimeout(() => save(c, { note }), 600))
}
</script>

<template>
  <div ref="root" class="grid select-none items-start gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
    <div ref="list" class="flex flex-col gap-2">
      <p class="text-sm text-zinc-400">
        Une ligne par champion avec les partenaires avec qui il est travaillé : Jhin + Shen / Camille / Alistar, Kai'Sa + Nautilus / Leona…
        Les suggestions et le coach IA mettent en avant le partenaire dès qu’un côté du combo est pické.
      </p>

      <div class="flex gap-1" role="group" aria-label="Filtrer par rôle">
        <button
          v-for="r in ROLE_TABS"
          :key="r.id"
          type="button"
          class="cursor-pointer px-3 py-1.5 text-xs"
          :class="roleFilter === r.id ? 'bg-zinc-800 text-zinc-100 shadow-[inset_0_-2px_0_var(--color-amber-400)]' : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800'"
          @click="roleFilter = r.id"
        >
          {{ r.label }}
        </button>
      </div>

      <div
        v-for="c in shown"
        :key="c.id"
        :data-card-id="c.id"
        class="cut group/combo flex cursor-grab items-center gap-3 bg-zinc-900 p-2"
        :class="{ 'opacity-20': dragging === c.id }"
      >
        <!-- The champion of the combo -->
        <div :data-tier-drop="zoneId('a', c)" class="rounded-lg p-1 transition-colors">
          <div
            :data-drag-champ="c.anchor"
            :data-drag-from="zoneId('a', c)"
            class="flex w-16 cursor-grab touch-none flex-col items-center"
            :title="`${nameOf(c.anchor)} · dépose un autre champion ici pour le remplacer`"
          >
            <img :src="iconUrl(c.anchor)" :alt="nameOf(c.anchor)" draggable="false" class="size-14 rounded-md ring-2 ring-amber-400/70">
            <span class="mt-0.5 w-full truncate text-center text-[10px] text-zinc-300">{{ nameOf(c.anchor) }}</span>
          </div>
        </div>

        <span class="text-lg text-zinc-600">+</span>

        <!-- Its partners -->
        <div
          :data-tier-drop="zoneId('p', c)"
          class="cut flex min-h-16 flex-1 items-center border-dashed p-1.5 transition-colors bg-zinc-900"
        >
          <div data-tier-items class="flex flex-wrap items-center gap-1.5">
            <span v-if="!c.partners.length" class="px-1 text-xs text-zinc-600">Dépose ses partenaires ici</span>
            <div v-for="p in c.partners" :key="p" class="group relative">
              <div :data-drag-champ="p" :data-drag-from="zoneId('p', c)" class="flex w-12 cursor-grab touch-none flex-col items-center" :title="nameOf(p)">
                <img :src="iconUrl(p)" :alt="nameOf(p)" draggable="false" class="size-10 rounded-md">
                <span class="w-full truncate text-center text-[10px] text-zinc-400">{{ nameOf(p) }}</span>
              </div>
              <button
                type="button"
                class="absolute -right-1 -top-1 hidden size-4 cursor-pointer place-items-center rounded-full bg-zinc-950 text-zinc-400 ring-1 ring-zinc-700 hover:bg-red-600 hover:text-white group-hover:grid"
                :title="`Retirer ${nameOf(p)}`"
                @click="save(c, { partners: c.partners.filter(x => x !== p) })"
              >
                <svg viewBox="0 0 12 12" class="size-2" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
              </button>
            </div>
          </div>
        </div>

        <input
          :value="c.note"
          placeholder="Note (lane, quand le picker…)"
          class="w-56 select-text bg-zinc-800 px-2 py-1 text-xs outline-none focus:bg-zinc-700"
          @input="editNote(c, ($event.target as HTMLInputElement).value)"
        >
        <button
          type="button"
          class="cursor-pointer px-1 text-xs text-zinc-600 opacity-0 hover:text-red-400 group-hover/combo:opacity-100"
          @click="removeCombo(c)"
        >
          Supprimer
        </button>
      </div>

      <div
        data-tier-drop="new"
        class="flex min-h-20 items-center justify-center rounded-lg border-2 border-dashed border-transparent text-sm text-zinc-500 transition-colors bg-zinc-900"
      >
        Dépose un champion ici pour créer un combo (ou clique sur l’un d’eux dans la liste)
      </div>
    </div>

    <aside data-tier-drop="remove" class="cut flex flex-col gap-2 p-3 transition-colors xl:sticky xl:top-4 xl:h-[640px] bg-zinc-900">
      <ChampionGrid
        class="min-h-80 flex-1"
        :champions="champions"
        :disabled="new Map()"
        :icon-url="iconUrl"
        :active="true"
        drag-source
        @select="create"
      />
      <p class="text-center text-[11px] text-zinc-600">
        Glisse sur un combo pour ajouter un partenaire · glisse-le ici pour le retirer
      </p>
    </aside>
  </div>
</template>
