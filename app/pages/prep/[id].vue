<script setup lang="ts">
import type { PrepDetail, PrepScenario } from '#shared/types'

definePageMeta({ fitScreen: true, prepLayout: true })
const route = useRoute()
const id = route.params.id as string
const { data } = await useFetch<PrepDetail>(`/api/preps/${id}`)
if (!data.value) throw createError({ statusCode: 404, statusMessage: 'Préparation introuvable', fatal: true })
const { champions, byId, iconUrl } = await useChampions()
const selectedId = computed({ get: () => Number(route.query.s) || data.value?.scenarios[0]?.id, set: s => { void navigateTo({ query: { ...route.query, s } }, { replace: true }) } })
const selected = computed(() => data.value?.scenarios.find(s => s.id === selectedId.value) ?? data.value?.scenarios[0])
const pending = ref(0)
const dirtyCount = ref(0)
const failed = ref(new Set<number>())
const busy = ref(false)
const actionError = ref('')
const dirty = new Map<number, PrepScenario>()
let timer: ReturnType<typeof setTimeout> | undefined
let queue: Promise<void> = Promise.resolve()

function patchScenario(s: PrepScenario, patch: Partial<PrepScenario>) {
  const updated = { ...s, ...patch }
  data.value = { ...data.value!, scenarios: data.value!.scenarios.map(x => x.id === s.id ? updated : x) }
  dirty.set(s.id, updated)
  dirtyCount.value = dirty.size
  clearTimeout(timer)
  timer = setTimeout(flush, 350)
}
function flush() {
  clearTimeout(timer)
  const batch = [...dirty.values()]
  dirty.clear()
  dirtyCount.value = 0
  pending.value += batch.length
  queue = queue.then(async () => {
    for (const snapshot of batch) {
      try {
        await $fetch(`/api/scenarios/${snapshot.id}`, { method: 'PUT', body: { name: snapshot.name, ourSide: snapshot.ourSide, slots: snapshot.slots, styles: snapshot.styles, notes: snapshot.notes, pickNotes: snapshot.pickNotes } })
        const next = new Set(failed.value); next.delete(snapshot.id); failed.value = next
      }
      catch { failed.value = new Set([...failed.value, snapshot.id]) }
      finally { pending.value-- }
    }
  })
  return queue
}
async function retry() {
  for (const s of data.value!.scenarios) if (failed.value.has(s.id)) dirty.set(s.id, s)
  await flush()
}
async function removePrep() {
  if (!(await askConfirm(`Supprimer « ${selected.value?.name ?? data.value!.prep.name} » ?`, { confirmLabel: 'Supprimer', danger: true }))) return
  await flush()
  busy.value = true
  // Une prep = une draft ; les anciennes preps à plusieurs drafts ne perdent que celle-ci.
  const only = data.value!.scenarios.length <= 1 || !selected.value
  try { await $fetch(only ? `/api/preps/${id}` : `/api/scenarios/${selected.value!.id}`, { method: 'DELETE' }); failed.value = new Set(); await navigateTo('/prep') }
  catch { actionError.value = 'Impossible de supprimer cette draft.' }
  finally { busy.value = false }
}
onBeforeRouteLeave(async () => { await flush(); if (failed.value.size) return askConfirm('Certaines modifications ne sont pas enregistrées. Quitter cette préparation ?', { confirmLabel: 'Quitter', danger: true }) })
onBeforeUnmount(() => { clearTimeout(timer) })
</script>

<template>
  <div class="prep-detail-page">
    <div v-if="failed.size || actionError" role="alert" class="prep-save-error"><span>{{ actionError || 'Sauvegarde impossible. Tes modifications sont toujours affichées.' }}</span><button v-if="failed.size" type="button" class="prep-btn" @click="retry">Réessayer la sauvegarde</button></div>
    <PrepCompositionEditor v-if="selected" :key="selected.id" :scenario="selected" :champions="champions" :name-of="c => byId.get(c)?.name ?? c" :icon-url="iconUrl" :saving="pending > 0 || dirtyCount > 0" :save-error="failed.has(selected.id)" :busy="busy" @update="patch => patchScenario(selected!, patch)" @remove="removePrep" />
    <div v-else class="prep-empty"><NuxtLink to="/prep">← Galerie</NuxtLink><p>Cette préparation ne contient aucune draft.</p><button class="prep-btn prep-danger" @click="removePrep">Supprimer</button></div>
  </div>
</template>
