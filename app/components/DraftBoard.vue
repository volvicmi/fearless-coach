<script setup lang="ts">
import { DRAFT_ORDER, NO_BAN, fearlessLocked } from '#shared/draft'
import type { FearlessMode } from '#shared/draft'
import type { Champion, Game } from '#shared/types'

const props = defineProps<{
  game: Game
  games: Game[]
  fearless: FearlessMode
  champions: Champion[]
  iconUrl: (id: string) => string
  nameOf: (id: string) => string
}>()
const emit = defineEmits<{ update: [actions: string[]] }>()

const current = computed(() => DRAFT_ORDER[props.game.actions.length])
const done = computed(() => !current.value)

/** Everything the acting team can't take right now, with the reason shown on hover. */
const disabled = computed(() => {
  const reasons = new Map<string, string>()
  props.game.actions.forEach((champ, i) => {
    if (champ !== NO_BAN) reasons.set(champ, DRAFT_ORDER[i]!.type === 'ban' ? 'Banned' : 'Picked')
  })
  for (const [champ, n] of fearlessLocked(props.fearless, props.games, props.game)) {
    if (!reasons.has(champ)) reasons.set(champ, `Fearless · played in G${n}`)
  }
  return reasons
})

const actor = computed(() => {
  if (!current.value) return ''
  const who = current.value.side === props.game.ourSide ? 'Us' : 'Them'
  return `${current.value.side} ${current.value.type} ${current.value.slot + 1} · ${who}`
})

const play = (champ: string) => emit('update', [...props.game.actions, champ])
const undo = () => emit('update', props.game.actions.slice(0, -1))

function onKey(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
    e.preventDefault()
    if (props.game.actions.length) undo()
  }
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="grid gap-5 lg:grid-cols-[200px_minmax(0,1fr)_200px]">
    <DraftSide
      side="blue"
      :is-us="game.ourSide === 'blue'"
      :actions="game.actions"
      :current="current"
      :icon-url="iconUrl"
      :name-of="nameOf"
    />

    <div class="flex min-h-0 flex-col gap-3 lg:h-[70vh]">
      <div class="flex items-center gap-3">
        <p v-if="!done" class="text-sm">
          Now: <span class="font-semibold capitalize" :class="current?.side === 'blue' ? 'text-side-blue' : 'text-side-red'">{{ actor }}</span>
          <span class="text-zinc-500"> · step {{ game.actions.length + 1 }}/20</span>
        </p>
        <p v-else class="text-sm font-semibold text-emerald-400">
          Draft complete
        </p>
        <div class="ml-auto flex gap-2">
          <button
            v-if="current?.type === 'ban'"
            type="button"
            class="rounded-md border border-zinc-700 px-3 py-1 text-xs hover:bg-zinc-800"
            @click="play(NO_BAN)"
          >
            Skip ban
          </button>
          <button
            type="button"
            class="rounded-md border border-zinc-700 px-3 py-1 text-xs hover:bg-zinc-800 disabled:opacity-40"
            :disabled="!game.actions.length"
            title="Ctrl+Z"
            @click="undo"
          >
            Undo
          </button>
        </div>
      </div>

      <ChampionGrid
        class="flex-1"
        :champions="champions"
        :disabled="disabled"
        :icon-url="iconUrl"
        :active="!done"
        @select="play"
      />
    </div>

    <DraftSide
      side="red"
      :is-us="game.ourSide === 'red'"
      :actions="game.actions"
      :current="current"
      :icon-url="iconUrl"
      :name-of="nameOf"
    />
  </div>
</template>
