<script setup lang="ts" generic="T extends string">
/** Choix unique en boutons accolés (format, règle, côté…), plus rapide à lire et à cliquer qu'une liste déroulante. */
defineProps<{
  options: { value: T, label: string, /** couleur du bouton actif */ tone?: 'amber' | 'blue' | 'red' }[]
  disabled?: boolean
}>()
const model = defineModel<T>({ required: true })

const ACTIVE = {
  amber: 'bg-amber-400 text-zinc-950',
  blue: 'bg-side-blue text-white',
  red: 'bg-side-red text-white',
}
</script>

<template>
  <div role="radiogroup" class="inline-flex rounded-lg border border-zinc-700 bg-zinc-900 p-0.5">
    <button
      v-for="o in options"
      :key="o.value"
      type="button"
      role="radio"
      :aria-checked="model === o.value"
      :disabled="disabled"
      class="rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
      :class="model === o.value ? ACTIVE[o.tone ?? 'amber'] : 'cursor-pointer text-zinc-400 hover:text-zinc-100'"
      @click="model = o.value"
    >
      {{ o.label }}
    </button>
  </div>
</template>
