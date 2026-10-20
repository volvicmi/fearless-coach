<script setup lang="ts">
// Fenêtre modale simple : fond assombri, fermeture par Échap, clic à côté ou bouton ✕.
defineProps<{ title: string, wide?: boolean }>()
const open = defineModel<boolean>({ required: true })

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') open.value = false
}
watch(open, (v) => {
  if (import.meta.client) v ? window.addEventListener('keydown', onKey) : window.removeEventListener('keydown', onKey)
})
onBeforeUnmount(() => import.meta.client && window.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-6 pt-[8vh] backdrop-blur-[2px]" @click.self="open = false">
      <section class="cut flex w-full flex-col gap-5 bg-zinc-900 p-6 shadow-2xl shadow-black/60" :class="wide ? 'max-w-4xl' : 'max-w-xl'" role="dialog" :aria-label="title">
        <header class="flex items-center gap-4">
          <h2 class="text-xl font-bold">
            {{ title }}
          </h2>
          <button type="button" class="ml-auto px-2 py-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-100" aria-label="Fermer" @click="open = false">
            ✕
          </button>
        </header>
        <slot />
      </section>
    </div>
  </Teleport>
</template>
