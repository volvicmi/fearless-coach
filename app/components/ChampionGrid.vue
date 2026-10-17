<script setup lang="ts">
import type { Champion } from '#shared/types'

const props = defineProps<{
  champions: Champion[]
  /** champion id → why it can't be picked right now */
  disabled: Map<string, string>
  iconUrl: (id: string) => string
  active: boolean
  /** Lets champions be dragged onto tier rows (see useChampionDrag) */
  dragSource?: boolean
}>()
const emit = defineEmits<{ select: [id: string] }>()

const TAGS = ['Fighter', 'Tank', 'Mage', 'Assassin', 'Marksman', 'Support']
/** Libellés affichés ; les valeurs de TAGS restent celles de Data Dragon. */
const TAG_LABEL: Record<string, string> = { Fighter: 'Combattant', Tank: 'Tank', Mage: 'Mage', Assassin: 'Assassin', Marksman: 'Tireur', Support: 'Support' }
const search = ref('')
const tag = ref<string | null>(null)
const input = ref<HTMLInputElement>()

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

const filtered = computed(() => {
  const q = normalize(search.value)
  const list = props.champions.filter(c =>
    (!q || normalize(c.name).includes(q) || normalize(c.id).includes(q))
    && (!tag.value || c.tags.includes(tag.value)))
  if (!q) return list
  // "vi" must give Vi before Anivia: exact name, then names starting with the query, then the rest.
  const rank = (c: Champion) => {
    const n = normalize(c.name)
    return n === q || normalize(c.id) === q ? 0 : n.startsWith(q) ? 1 : 2
  }
  return [...list].sort((a, b) => rank(a) - rank(b))
})

function choose(id: string) {
  if (!props.active || props.disabled.has(id)) return
  emit('select', id)
  search.value = ''
  input.value?.focus()
}

/** Enter picks the first available match: fast input during a live draft. */
function onEnter() {
  const first = filtered.value.find(c => !props.disabled.has(c.id))
  if (first) choose(first.id)
}

onMounted(() => input.value?.focus())
</script>

<template>
  <div class="flex min-h-0 flex-col gap-3">
    <div class="flex flex-wrap items-center gap-2">
      <input
        ref="input"
        v-model="search"
        type="search"
        placeholder="Chercher un champion… (Entrée = premier résultat)"
        class="min-w-48 flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm outline-none focus:border-amber-400"
        @keydown.enter.prevent="onEnter"
      >
      <button
        v-for="t in TAGS"
        :key="t"
        type="button"
        class="rounded-md border px-2 py-1 text-xs"
        :class="tag === t ? 'border-amber-400 text-amber-300' : 'border-zinc-700 text-zinc-400 hover:text-zinc-200'"
        @click="tag = tag === t ? null : t"
      >
        {{ TAG_LABEL[t] ?? t }}
      </button>
    </div>

    <div class="grid grid-cols-[repeat(auto-fill,minmax(56px,1fr))] gap-1.5 overflow-y-auto pr-1">
      <button
        v-for="c in filtered"
        :key="c.id"
        type="button"
        :title="disabled.get(c.id) ? `${c.name} · ${disabled.get(c.id)}` : c.name"
        :disabled="!active || disabled.has(c.id)"
        :data-drag-champ="dragSource && !disabled.has(c.id) ? c.id : undefined"
        class="group flex flex-col items-center gap-0.5 rounded-md p-0.5 text-center"
        :class="[
          disabled.has(c.id) ? 'cursor-not-allowed opacity-25 grayscale' : 'hover:bg-zinc-800',
          dragSource && !disabled.has(c.id) && 'cursor-grab touch-none',
        ]"
        @click="choose(c.id)"
      >
        <img :src="iconUrl(c.id)" :alt="c.name" loading="lazy" draggable="false" class="size-12 select-none rounded">
        <span class="w-full truncate text-[10px] text-zinc-400 group-hover:text-zinc-200">{{ c.name }}</span>
      </button>
    </div>
  </div>
</template>
