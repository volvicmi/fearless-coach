<script setup lang="ts">
import { DRAFT_ORDER, NO_BAN, fearlessLocked } from '#shared/draft'
import type { FearlessMode, Side } from '#shared/draft'
import type { Champion, Game } from '#shared/types'

const props = defineProps<{
  game: Game
  games: Game[]
  fearless: FearlessMode
  champions: Champion[]
  iconUrl: (id: string) => string
  nameOf: (id: string) => string
  /** Qui joue chaque côté, à la place de « Nous » / « Eux » (duel) */
  labels?: Record<Side, string>
  /** Si renseigné, annuler une draft terminée demande d'abord confirmation avec ce message */
  confirmUndo?: string
}>()
const emit = defineEmits<{ update: [actions: string[]] }>()

const current = computed(() => DRAFT_ORDER[props.game.actions.length])
const done = computed(() => !current.value)

/** Everything the acting team can't take right now, with the reason shown on hover. */
const disabled = computed(() => {
  const reasons = new Map<string, string>()
  props.game.actions.forEach((champ, i) => {
    if (champ !== NO_BAN) reasons.set(champ, DRAFT_ORDER[i]!.type === 'ban' ? 'Banni' : 'Pické')
  })
  for (const [champ, n] of fearlessLocked(props.fearless, props.games, props.game)) {
    if (!reasons.has(champ)) reasons.set(champ, `Fearless · joué en G${n}`)
  }
  return reasons
})

/** L'étape en cours et qui la joue : le nom d'un joueur ne passe jamais en capitales automatiques. */
const actor = computed(() => {
  if (!current.value) return null
  const who = props.labels?.[current.value.side] ?? (current.value.side === props.game.ourSide ? 'Nous' : 'Eux')
  return { step: `${current.value.side === 'blue' ? 'Bleu' : 'Rouge'} ${current.value.type} ${current.value.slot + 1}`, who }
})

const grid = ref<{ focus: () => void }>()
// Après chaque action, le curseur revient dans la recherche : on tape le champion suivant puis Entrée.
const play = (champ: string) => { emit('update', [...props.game.actions, champ]); grid.value?.focus() }
async function undo() {
  if (done.value && props.confirmUndo && !(await askConfirm(props.confirmUndo, { confirmLabel: 'Revenir en arrière' }))) return
  emit('update', props.game.actions.slice(0, -1))
  grid.value?.focus()
}

function onKey(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
    e.preventDefault()
    if (props.game.actions.length) undo()
    return
  }
  // Espace = passer le ban, sauf quand on tape dans un champ (recherche, nom…).
  const el = e.target as HTMLElement | null
  if (e.key === ' ' && !e.ctrlKey && !e.metaKey && !e.altKey && current.value?.type === 'ban'
    && !el?.closest('input, textarea, select, [contenteditable="true"]')) {
    e.preventDefault()
    if (!e.repeat) play(NO_BAN)
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
      :label="labels?.blue"
      :actions="game.actions"
      :current="current"
      :icon-url="iconUrl"
      :name-of="nameOf"
    />

    <div class="flex min-h-0 flex-col gap-3 lg:h-[70vh]">
      <div class="flex items-center gap-3">
        <p v-if="!done" class="text-sm">
          En cours : <span class="font-semibold" :class="current?.side === 'blue' ? 'text-side-blue' : 'text-side-red'"><span class="capitalize">{{ actor?.step }}</span> · {{ actor?.who }}</span>
          <span class="text-zinc-500"> · étape {{ game.actions.length + 1 }}/20</span>
        </p>
        <p v-else class="text-sm font-semibold text-emerald-400">
          Draft terminée
        </p>
        <div class="ml-auto flex gap-2">
          <button
            v-if="current?.type === 'ban'"
            type="button"
            class="px-3 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 font-display font-semibold uppercase tracking-wider"
            @click="play(NO_BAN)"
          >
            Passer le ban
          </button>
          <button
            type="button"
            class="px-3 py-1 text-xs disabled:opacity-40 bg-zinc-800 hover:bg-zinc-700 font-display font-semibold uppercase tracking-wider"
            :disabled="!game.actions.length"
            title="Ctrl+Z"
            @click="undo"
          >
            Annuler
          </button>
        </div>
      </div>

      <ChampionGrid
        ref="grid"
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
      :label="labels?.red"
      :actions="game.actions"
      :current="current"
      :icon-url="iconUrl"
      :name-of="nameOf"
    />
  </div>
</template>
