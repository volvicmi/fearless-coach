<script setup lang="ts">
// Fenêtre de confirmation centrée, montée une fois dans app.vue et pilotée par askConfirm()
const state = useConfirmState()
const okButton = ref<HTMLButtonElement | null>(null)

function onKey(e: KeyboardEvent) {
  if (!state.value) return
  if (e.key === 'Escape') answerConfirm(false)
  if (e.key === 'Enter') { e.preventDefault(); answerConfirm(true) }
}
watch(state, async (v) => {
  if (!v) return
  await nextTick()
  okButton.value?.focus()
})
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0"
      leave-active-class="transition duration-100 ease-in"
      leave-to-class="opacity-0"
    >
      <div v-if="state" class="fixed inset-0 z-[60] flex items-center justify-center bg-black/65 p-6 backdrop-blur-[2px]" @click.self="answerConfirm(false)">
        <section class="cut flex w-full max-w-md flex-col gap-6 bg-zinc-900 p-6 shadow-2xl shadow-black/60" role="alertdialog" aria-modal="true" :aria-label="state.message">
          <p class="text-[15px] leading-relaxed text-zinc-100">
            {{ state.message }}
          </p>
          <div class="flex justify-end gap-2">
            <button type="button" class="bg-zinc-800 px-4 py-2 font-display text-sm font-semibold uppercase tracking-wider text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-zinc-100" @click="answerConfirm(false)">
              Annuler
            </button>
            <button
              ref="okButton"
              type="button"
              class="text-sm outline-none"
              :class="state.danger ? 'bg-red-600 px-5 py-2 font-display font-bold uppercase tracking-wider text-white transition-colors hover:bg-red-500 focus-visible:bg-red-500' : 'btn-action'"
              @click="answerConfirm(true)"
            >
              {{ state.confirmLabel ?? 'Confirmer' }}
            </button>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
