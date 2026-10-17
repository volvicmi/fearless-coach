<script setup lang="ts">
import { DRAFT_ORDER } from '#shared/draft'
import type { Side } from '#shared/draft'
import { SCENARIO_COLORS } from '#shared/types'
import type { Champion, PrepScenario } from '#shared/types'
import type { DropTarget } from '~/composables/useChampionDrag'

const MAX_ALTERNATIVES = 6

const props = defineProps<{
  scenario: PrepScenario
  champions: Champion[]
  iconUrl: (id: string) => string
  nameOf: (id: string) => string
}>()
const emit = defineEmits<{
  update: [patch: Partial<Pick<PrepScenario, 'name' | 'color' | 'ourSide' | 'slots' | 'notes'>>]
  duplicate: []
  remove: []
}>()

/** Step being filled by click / Enter: the first empty one unless the user picked another. */
const firstEmpty = () => props.scenario.slots.findIndex(s => !s.length)
const selected = ref<number>(Math.max(0, firstEmpty()))

const stepsOf = (side: Side, type: 'ban' | 'pick') =>
  DRAFT_ORDER.map((s, i) => ({ ...s, i })).filter(s => s.side === side && s.type === type)

const label = (i: number) => {
  const s = DRAFT_ORDER[i]!
  return s.type === 'ban' ? `Ban ${s.slot + 1}` : `${s.side === 'blue' ? 'B' : 'R'}${s.slot + 1}`
}
const who = (side: Side) => (side === props.scenario.ourSide ? 'Us' : 'Them')

function setSlots(fn: (slots: string[][]) => void) {
  const slots = props.scenario.slots.map(s => [...s])
  fn(slots)
  emit('update', { slots })
}

/** Puts `champ` in step `to` at `index` (end by default), taking it out of step `from` if it came from one. */
function place(champ: string, to: number, index?: number, from?: number) {
  setSlots((slots) => {
    if (from !== undefined) slots[from] = slots[from]!.filter(c => c !== champ)
    const list = slots[to]!.filter(c => c !== champ)
    if (list.length >= MAX_ALTERNATIVES) return
    list.splice(Math.min(index ?? list.length, list.length), 0, champ)
    slots[to] = list
  })
}

function removeFrom(step: number, champ: string) {
  setSlots(slots => (slots[step] = slots[step]!.filter(c => c !== champ)))
}

/** Click or Enter in the champion list: add to the selected step, then move on if it was empty. */
function addToSelected(champ: string) {
  const wasEmpty = !props.scenario.slots[selected.value]!.length
  place(champ, selected.value)
  if (wasEmpty) {
    nextTick(() => {
      const next = firstEmpty()
      if (next >= 0) selected.value = next
    })
  }
}

const root = ref<HTMLElement>()
useChampionDrag(root, (champ: string, target: DropTarget, index?: number, from?: string) => {
  const fromStep = from !== undefined && from !== '' ? Number(from) : undefined
  if (target === 'remove') {
    if (fromStep !== undefined) removeFrom(fromStep, champ)
    return
  }
  place(champ, Number(target), index, fromStep)
})

/** Champions already in the selected step can't be added there twice. */
const disabled = computed(() => new Map((props.scenario.slots[selected.value] ?? []).map(c => [c, 'Already in this step'])))

// The parent keys this component by scenario id, so local state starts fresh for each scenario.
const notes = ref(props.scenario.notes)
let notesTimer: ReturnType<typeof setTimeout> | undefined
watch(notes, (text) => {
  clearTimeout(notesTimer)
  notesTimer = setTimeout(() => emit('update', { notes: text }), 600)
})
</script>

<template>
  <div ref="root" class="flex select-none flex-col gap-4">
    <!-- Scenario header -->
    <div class="flex flex-wrap items-center gap-3">
      <span class="size-3 rounded-full" :class="styleOf(scenario.color).dot" />
      <input
        :value="scenario.name"
        class="w-64 rounded-md border border-transparent bg-transparent px-1 text-lg font-semibold hover:border-zinc-700 focus:border-amber-400 focus:outline-none"
        @change="emit('update', { name: ($event.target as HTMLInputElement).value })"
      >
      <div class="flex gap-1">
        <button
          v-for="c in SCENARIO_COLORS"
          :key="c"
          type="button"
          class="flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs"
          :class="scenario.color === c ? [SCENARIO_STYLE[c].border, SCENARIO_STYLE[c].tint, SCENARIO_STYLE[c].text] : 'border-zinc-800 text-zinc-400 hover:text-zinc-200'"
          @click="emit('update', { color: c })"
        >
          <span class="size-2 rounded-full" :class="SCENARIO_STYLE[c].dot" />
          {{ SCENARIO_STYLE[c].label }}
        </button>
      </div>
      <div class="flex items-center gap-1 text-sm">
        <span class="text-zinc-400">We are</span>
        <button
          v-for="s in (['blue', 'red'] as const)"
          :key="s"
          type="button"
          class="cursor-pointer rounded-md px-3 py-1 capitalize"
          :class="scenario.ourSide === s ? (s === 'blue' ? 'bg-side-blue' : 'bg-side-red') : 'bg-zinc-900 text-zinc-400 hover:text-zinc-100'"
          @click="emit('update', { ourSide: s })"
        >
          {{ s }}
        </button>
      </div>
      <div class="ml-auto flex gap-2">
        <button type="button" class="cursor-pointer rounded-md border border-zinc-700 px-3 py-1 text-xs hover:bg-zinc-800" @click="emit('duplicate')">
          Duplicate
        </button>
        <button type="button" class="cursor-pointer rounded-md px-3 py-1 text-xs text-zinc-500 hover:text-red-400" @click="emit('remove')">
          Delete
        </button>
      </div>
    </div>

    <!-- Board: blue | champion list | red -->
    <div class="grid items-start gap-4 xl:grid-cols-[300px_minmax(0,1fr)_300px]">
      <section
        v-for="side in (['blue', 'red'] as const)"
        :key="side"
        class="flex flex-col gap-3"
        :class="side === 'red' && 'xl:order-3'"
      >
        <h3 class="text-sm font-semibold uppercase tracking-wider" :class="side === 'blue' ? 'text-side-blue' : 'text-side-red'">
          {{ side }} side <span class="normal-case text-zinc-400">· {{ who(side) }}</span>
        </h3>

        <!-- Bans -->
        <div class="flex flex-col gap-1">
          <div
            v-for="s in stepsOf(side, 'ban')"
            :key="s.i"
            :data-tier-drop="String(s.i)"
            class="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-2 py-1 transition-colors"
            :class="selected === s.i ? 'border-amber-400 bg-amber-400/5' : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700'"
            @click="selected = s.i"
          >
            <span class="w-11 shrink-0 text-[10px] text-zinc-500">{{ label(s.i) }} <span class="text-zinc-700">#{{ s.i + 1 }}</span></span>
            <div data-tier-items class="flex flex-wrap items-center gap-1">
              <span v-if="!scenario.slots[s.i]!.length" class="text-[11px] text-zinc-600">—</span>
              <div v-for="(c, n) in scenario.slots[s.i]" :key="c" class="group relative">
                <div :data-drag-champ="c" :data-drag-from="String(s.i)" class="cursor-grab touch-none" :title="`${nameOf(c)} · drag to move, reorder or remove`">
                  <img :src="iconUrl(c)" :alt="nameOf(c)" draggable="false" class="rounded grayscale" :class="n === 0 ? 'size-8' : 'size-6 opacity-70'">
                </div>
                <button
                  type="button"
                  class="absolute -right-1 -top-1 hidden size-4 cursor-pointer place-items-center rounded-full bg-zinc-950 text-zinc-400 ring-1 ring-zinc-700 hover:bg-red-600 hover:text-white group-hover:grid"
                  :title="`Remove ${nameOf(c)}`"
                  @click.stop="removeFrom(s.i, c)"
                >
                  <svg viewBox="0 0 12 12" class="size-2" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Picks -->
        <div class="flex flex-col gap-1.5">
          <div
            v-for="s in stepsOf(side, 'pick')"
            :key="s.i"
            :data-tier-drop="String(s.i)"
            class="flex min-h-16 cursor-pointer items-center gap-2 rounded-lg border px-2 py-1.5 transition-colors"
            :class="selected === s.i ? 'border-amber-400 bg-amber-400/5' : 'border-zinc-800 bg-zinc-900/60 hover:border-zinc-700'"
            @click="selected = s.i"
          >
            <span class="flex w-11 shrink-0 flex-col text-xs font-semibold" :class="side === 'blue' ? 'text-side-blue' : 'text-side-red'">
              {{ label(s.i) }}
              <span class="text-[10px] font-normal text-zinc-600">#{{ s.i + 1 }}</span>
            </span>
            <div data-tier-items class="flex flex-wrap items-center gap-1.5">
              <span v-if="!scenario.slots[s.i]!.length" class="text-xs text-zinc-600">Drop or click a champion</span>
              <div v-for="(c, n) in scenario.slots[s.i]" :key="c" class="group relative">
                <div
                  :data-drag-champ="c"
                  :data-drag-from="String(s.i)"
                  class="flex cursor-grab touch-none flex-col items-center"
                  :title="`${nameOf(c)}${n === 0 ? ' · main choice' : ` · option ${n + 1}`} · drag to reorder, move or remove`"
                >
                  <img
                    :src="iconUrl(c)"
                    :alt="nameOf(c)"
                    draggable="false"
                    class="rounded-md"
                    :class="n === 0 ? ['size-12', side === 'blue' ? 'ring-2 ring-side-blue' : 'ring-2 ring-side-red'] : 'size-9 opacity-75'"
                  >
                  <span v-if="n === 0" class="mt-0.5 max-w-12 truncate text-[10px] text-zinc-300">{{ nameOf(c) }}</span>
                </div>
                <button
                  type="button"
                  class="absolute -right-1 -top-1 hidden size-5 cursor-pointer place-items-center rounded-full bg-zinc-950 text-zinc-400 shadow ring-1 ring-zinc-700 hover:bg-red-600 hover:text-white group-hover:grid"
                  :title="`Remove ${nameOf(c)}`"
                  @click.stop="removeFrom(s.i, c)"
                >
                  <svg viewBox="0 0 12 12" class="size-2.5" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Champion list: drag source, and drop back here to remove -->
      <aside data-tier-drop="remove" class="flex flex-col gap-2 rounded-lg border border-zinc-800 p-3 xl:order-2 xl:h-[720px]">
        <p class="text-xs text-zinc-400">
          Filling <span class="font-semibold text-amber-300">{{ label(selected) }}</span>
          <span class="text-zinc-600">(step #{{ selected + 1 }})</span> · click or Enter adds there · drag anywhere on the board
        </p>
        <ChampionGrid
          class="min-h-96 flex-1"
          :champions="champions"
          :disabled="disabled"
          :icon-url="iconUrl"
          :active="true"
          drag-source
          @select="addToSelected"
        />
      </aside>
    </div>

    <textarea
      v-model="notes"
      rows="3"
      placeholder="Notes for this draft: win condition, what to do if they take X, swaps…"
      class="w-full select-text resize-y rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 text-sm outline-none placeholder:text-zinc-600 focus:border-amber-400"
    />
  </div>
</template>
