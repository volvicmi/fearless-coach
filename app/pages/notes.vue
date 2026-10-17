<script setup lang="ts">
const { data } = await useFetch<{ text: string }>('/api/notes')
const text = ref(data.value?.text ?? '')
const state = ref<'saved' | 'saving' | 'unsaved' | 'error'>('saved')

const PLACEHOLDER = `## Bot lane
- Nos combos : Ashe + Seraphine, Yunara + Lulu
- Réponse classique : Lucian + Milio, peut-être plus faible depuis le dernier patch

## Patch notes
- …

## Contre cet adversaire
- …`

let timer: ReturnType<typeof setTimeout> | undefined
watch(text, () => {
  state.value = 'unsaved'
  clearTimeout(timer)
  timer = setTimeout(save, 800)
})

async function save() {
  state.value = 'saving'
  try {
    await $fetch('/api/notes', { method: 'PUT', body: { text: text.value } })
    state.value = 'saved'
  }
  catch {
    state.value = 'error'
  }
}

onBeforeUnmount(() => {
  if (state.value === 'unsaved') save()
})

const STATE_LABEL = { saved: 'Enregistré', saving: 'Enregistrement…', unsaved: 'Modifications non enregistrées', error: 'Échec de l’enregistrement' }
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-end gap-4">
      <div>
        <h1 class="text-xl font-semibold">
          Notes du coach
        </h1>
        <p class="text-sm text-zinc-400">
          Notes libres en markdown : combos, réponses classiques, changements de patch, habitudes des adversaires… Le coach IA les lit à chaque demande.
        </p>
      </div>
      <span class="ml-auto text-xs" :class="state === 'error' ? 'text-red-400' : state === 'saved' ? 'text-zinc-500' : 'text-amber-300'">
        {{ STATE_LABEL[state] }} · {{ text.length.toLocaleString('fr-FR') }} / 20 000
      </span>
    </div>
    <textarea
      v-model="text"
      :placeholder="PLACEHOLDER"
      spellcheck="false"
      maxlength="20000"
      class="min-h-[70vh] w-full resize-y rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 font-mono text-sm leading-relaxed text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-amber-400"
    />
  </div>
</template>
