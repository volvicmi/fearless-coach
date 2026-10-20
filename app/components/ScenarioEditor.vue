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

/** Our 10 steps (bans + picks) for the side we play, in draft order. */
const ourSteps = computed(() => DRAFT_ORDER.map((s, i) => ({ s, i })).filter(x => x.s.side === props.scenario.ourSide).map(x => x.i))
const isOurs = (i: number) => DRAFT_ORDER[i]!.side === props.scenario.ourSide

/** Step being filled by click / Enter: our first empty one unless the user picked another. */
const firstEmpty = () => ourSteps.value.find(i => !props.scenario.slots[i]!.length) ?? -1
const selected = ref<number>(firstEmpty() >= 0 ? firstEmpty() : ourSteps.value[0]!)

const label = (i: number) => {
  const s = DRAFT_ORDER[i]!
  return s.type === 'ban' ? `Ban ${s.slot + 1}` : `${s.side === 'blue' ? 'B' : 'R'}${s.slot + 1}`
}

/** The four phases of a tournament draft; the other team's turns are shown as markers between ours. */
const PHASES = [
  { label: 'Phase de bans 1', from: 0, to: 5 },
  { label: 'Phase de picks 1', from: 6, to: 11 },
  { label: 'Phase de bans 2', from: 12, to: 15 },
  { label: 'Phase de picks 2', from: 16, to: 19 },
]
type PhaseItem = { kind: 'ours', i: number } | { kind: 'theirs', labels: string[] }
const phases = computed(() => PHASES.map((p) => {
  const items: PhaseItem[] = []
  for (let i = p.from; i <= p.to; i++) {
    if (isOurs(i)) {
      items.push({ kind: 'ours', i })
      continue
    }
    const last = items.at(-1)
    if (last?.kind === 'theirs') last.labels.push(label(i))
    else items.push({ kind: 'theirs', labels: [label(i)] })
  }
  return { label: p.label, isBan: DRAFT_ORDER[p.from]!.type === 'ban', items }
}))

/** Changing side keeps our draft: our Pick 1 stays our Pick 1, in the other side's order. */
function switchSide(to: Side) {
  if (to === props.scenario.ourSide) return
  const slots: string[][] = DRAFT_ORDER.map(() => [])
  DRAFT_ORDER.forEach((s, i) => {
    if (s.side !== props.scenario.ourSide) return
    const j = DRAFT_ORDER.findIndex(t => t.side === to && t.type === s.type && t.slot === s.slot)
    slots[j] = [...props.scenario.slots[i]!]
  })
  emit('update', { ourSide: to, slots })
  nextTick(() => (selected.value = firstEmpty() >= 0 ? firstEmpty() : ourSteps.value[0]!))
}

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
const disabled = computed(() => new Map((props.scenario.slots[selected.value] ?? []).map(c => [c, 'Déjà dans cette étape'])))

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
        class="w-64 border border-transparent bg-transparent px-1 text-lg font-semibold hover:bg-zinc-900 focus:bg-zinc-700 focus:outline-none"
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
        <span class="text-zinc-400">Nous sommes</span>
        <button
          v-for="s in (['blue', 'red'] as const)"
          :key="s"
          type="button"
          class="cursor-pointer rounded-md px-3 py-1 capitalize"
          :class="scenario.ourSide === s ? (s === 'blue' ? 'bg-side-blue' : 'bg-side-red') : 'bg-zinc-900 text-zinc-400 hover:text-zinc-100'"
          @click="switchSide(s)"
        >
          {{ s === 'blue' ? 'Bleu' : 'Rouge' }}
        </button>
      </div>
      <div class="ml-auto flex gap-2">
        <button type="button" class="cursor-pointer px-3 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 font-display font-semibold uppercase tracking-wider" @click="emit('duplicate')">
          Dupliquer
        </button>
        <button type="button" class="cursor-pointer rounded-md px-3 py-1 text-xs text-zinc-500 hover:text-red-400" @click="emit('remove')">
          Supprimer
        </button>
      </div>
    </div>

    <!-- Board: our draft in tournament order | champion list -->
    <div class="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
      <section class="flex flex-col gap-4">
        <div v-for="phase in phases" :key="phase.label" class="flex flex-col gap-1.5">
          <h3 class="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            {{ phase.label }}
          </h3>
          <template v-for="(item, k) in phase.items" :key="k">
            <!-- The other team's turn: only a marker, we don't plan their draft -->
            <div v-if="item.kind === 'theirs'" class="flex items-center gap-2 pl-2 text-[11px] text-zinc-600">
              <span class="h-px w-6 bg-zinc-800" />
              Leur tour : {{ item.labels.join(' · ') }}
              <span class="h-px flex-1 bg-zinc-800" />
            </div>

            <!-- One of our steps -->
            <div
              v-else
              :data-tier-drop="String(item.i)"
              class="flex cursor-pointer items-center gap-3 rounded-lg border px-3 transition-colors"
              :class="[
                phase.isBan ? 'min-h-12 py-1' : 'min-h-[4.5rem] py-1.5',
                selected === item.i ? 'bg-amber-400/5 tab-on' : 'border-transparent bg-zinc-900 hover:bg-zinc-800',
              ]"
              @click="selected = item.i"
            >
              <span
                class="flex w-14 shrink-0 flex-col text-xs font-semibold"
                :class="phase.isBan ? 'text-zinc-400' : scenario.ourSide === 'blue' ? 'text-side-blue' : 'text-side-red'"
              >
                {{ label(item.i) }}
                <span class="text-[10px] font-normal text-zinc-600">étape {{ item.i + 1 }}</span>
              </span>
              <div data-tier-items class="flex flex-wrap items-center gap-1.5">
                <span v-if="!scenario.slots[item.i]!.length" class="text-xs text-zinc-600">
                  {{ phase.isBan ? 'Dépose ou clique sur un ban' : 'Dépose ou clique sur un champion' }}
                </span>
                <div v-for="(c, n) in scenario.slots[item.i]" :key="c" class="group relative">
                  <div
                    :data-drag-champ="c"
                    :data-drag-from="String(item.i)"
                    class="flex cursor-grab touch-none flex-col items-center"
                    :title="`${nameOf(c)}${n === 0 ? ' · choix principal' : ` · option ${n + 1}`} · glisse pour réordonner, déplacer ou retirer`"
                  >
                    <img
                      :src="iconUrl(c)"
                      :alt="nameOf(c)"
                      draggable="false"
                      class="rounded-md"
                      :class="[
                        phase.isBan && 'grayscale',
                        n === 0
                          ? [phase.isBan ? 'size-9' : 'size-12', !phase.isBan && (scenario.ourSide === 'blue' ? 'ring-2 ring-side-blue' : 'ring-2 ring-side-red')]
                          : [phase.isBan ? 'size-7' : 'size-9', 'opacity-75'],
                      ]"
                    >
                    <span v-if="n === 0 && !phase.isBan" class="mt-0.5 max-w-12 truncate text-[10px] text-zinc-300">{{ nameOf(c) }}</span>
                  </div>
                  <button
                    type="button"
                    class="absolute -right-1 -top-1 hidden size-5 cursor-pointer place-items-center rounded-full bg-zinc-950 text-zinc-400 shadow ring-1 ring-zinc-700 hover:bg-red-600 hover:text-white group-hover:grid"
                    :title="`Retirer ${nameOf(c)}`"
                    @click.stop="removeFrom(item.i, c)"
                  >
                    <svg viewBox="0 0 12 12" class="size-2.5" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
                  </button>
                </div>
              </div>
            </div>
          </template>
        </div>
      </section>

      <!-- Champion list: drag source, and drop back here to remove -->
      <aside data-tier-drop="remove" class="cut flex flex-col gap-2 p-3 xl:sticky xl:top-4 xl:h-[720px] bg-zinc-900">
        <p class="text-xs text-zinc-400">
          Étape en cours : <span class="font-semibold text-amber-300">{{ label(selected) }}</span>
          <span class="text-zinc-600">(étape {{ selected + 1 }})</span> · clic ou Entrée ajoute ici · glisse n’importe où sur la draft
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
      placeholder="Notes pour cette draft : condition de victoire, que faire s’ils prennent X, swaps…"
      class="w-full select-text resize-y bg-zinc-800 p-3 text-sm outline-none placeholder:text-zinc-600 focus:bg-zinc-700"
    />
  </div>
</template>
