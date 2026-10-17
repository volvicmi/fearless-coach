<script setup lang="ts">
import type { Champion, Combo } from '#shared/types'
import type { DropTarget } from '~/composables/useChampionDrag'

const props = defineProps<{
  champions: Champion[]
  iconUrl: (id: string) => string
  nameOf: (id: string) => string
}>()

const { data: combos, refresh } = await useFetch<Combo[]>('/api/combos')

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
  if (c.partners.length && !confirm(`Delete the ${props.nameOf(c.anchor)} combo?`)) return
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
    <div class="flex flex-col gap-2">
      <p class="text-sm text-zinc-400">
        One line per champion with the partners it is practised with: Jhin + Shen / Camille / Alistar, Kai'Sa + Nautilus / Leona…
        The suggestions and the AI coach push the partner once one side of a combo is picked.
      </p>

      <div
        v-for="c in combos"
        :key="c.id"
        class="group/combo flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-2"
      >
        <!-- The champion of the combo -->
        <div :data-tier-drop="zoneId('a', c)" class="rounded-lg p-1 transition-colors">
          <div
            :data-drag-champ="c.anchor"
            :data-drag-from="zoneId('a', c)"
            class="flex w-16 cursor-grab touch-none flex-col items-center"
            :title="`${nameOf(c.anchor)} · drop another champion here to replace it`"
          >
            <img :src="iconUrl(c.anchor)" :alt="nameOf(c.anchor)" draggable="false" class="size-14 rounded-md ring-2 ring-amber-400/70">
            <span class="mt-0.5 w-full truncate text-center text-[10px] text-zinc-300">{{ nameOf(c.anchor) }}</span>
          </div>
        </div>

        <span class="text-lg text-zinc-600">+</span>

        <!-- Its partners -->
        <div
          :data-tier-drop="zoneId('p', c)"
          class="flex min-h-16 flex-1 items-center rounded-lg border border-dashed border-zinc-800 p-1.5 transition-colors"
        >
          <div data-tier-items class="flex flex-wrap items-center gap-1.5">
            <span v-if="!c.partners.length" class="px-1 text-xs text-zinc-600">Drop its partners here</span>
            <div v-for="p in c.partners" :key="p" class="group relative">
              <div :data-drag-champ="p" :data-drag-from="zoneId('p', c)" class="flex w-12 cursor-grab touch-none flex-col items-center" :title="nameOf(p)">
                <img :src="iconUrl(p)" :alt="nameOf(p)" draggable="false" class="size-10 rounded-md">
                <span class="w-full truncate text-center text-[10px] text-zinc-400">{{ nameOf(p) }}</span>
              </div>
              <button
                type="button"
                class="absolute -right-1 -top-1 hidden size-4 cursor-pointer place-items-center rounded-full bg-zinc-950 text-zinc-400 ring-1 ring-zinc-700 hover:bg-red-600 hover:text-white group-hover:grid"
                :title="`Remove ${nameOf(p)}`"
                @click="save(c, { partners: c.partners.filter(x => x !== p) })"
              >
                <svg viewBox="0 0 12 12" class="size-2" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
              </button>
            </div>
          </div>
        </div>

        <input
          :value="c.note"
          placeholder="Note (lane, when to pick…)"
          class="w-56 select-text rounded-md border border-zinc-800 bg-zinc-950/40 px-2 py-1 text-xs outline-none focus:border-amber-400"
          @input="editNote(c, ($event.target as HTMLInputElement).value)"
        >
        <button
          type="button"
          class="cursor-pointer px-1 text-xs text-zinc-600 opacity-0 hover:text-red-400 group-hover/combo:opacity-100"
          @click="removeCombo(c)"
        >
          Delete
        </button>
      </div>

      <div
        data-tier-drop="new"
        class="flex min-h-20 items-center justify-center rounded-lg border-2 border-dashed border-zinc-800 text-sm text-zinc-500 transition-colors"
      >
        Drop a champion here to start a combo (or click one in the list)
      </div>
    </div>

    <aside data-tier-drop="remove" class="flex flex-col gap-2 rounded-lg border border-zinc-800 p-3 transition-colors xl:sticky xl:top-4 xl:h-[640px]">
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
        Drag onto a combo to add a partner · drag back here to remove
      </p>
    </aside>
  </div>
</template>
