<script setup lang="ts">
import type { PrepDetail, PrepScenario } from '#shared/types'

definePageMeta({ fitScreen: true, prepLayout: true })
const route = useRoute()
const id = route.params.id as string
const { data, refresh } = await useFetch<PrepDetail>(`/api/preps/${id}`)
if (!data.value) throw createError({ statusCode: 404, statusMessage: 'Préparation introuvable', fatal: true })
const { champions, byId, iconUrl } = await useChampions()
const selectedId = computed({ get: () => Number(route.query.s) || data.value?.scenarios[0]?.id, set: s => { void navigateTo({ query: { ...route.query, s } }, { replace: true }) } })
const selected = computed(() => data.value?.scenarios.find(s => s.id === selectedId.value) ?? data.value?.scenarios[0])
const pending = ref(0)
const dirtyCount = ref(0)
const failed = ref(new Set<number>())
const busy = ref(false)
const actionError = ref('')
const prepModal = ref(false)
const prepForm = reactive({ name: data.value.prep.name, opponent: data.value.prep.opponent })
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
        await $fetch(`/api/scenarios/${snapshot.id}`, { method: 'PUT', body: { name: snapshot.name, color: snapshot.color, ourSide: snapshot.ourSide, slots: snapshot.slots, notes: snapshot.notes, pickRoles: snapshot.pickRoles, combos: snapshot.combos } })
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
async function addScenario(copyFrom?: number) {
  if (busy.value) return
  await flush()
  if (failed.value.size) return
  busy.value = true; actionError.value = ''
  try {
    const created = await $fetch<PrepScenario>(`/api/preps/${id}/scenarios`, { method: 'POST', body: { copyFrom } })
    await refresh(); selectedId.value = created.id
  }
  catch { actionError.value = 'Impossible de créer cette composition. Réessaie.' }
  finally { busy.value = false }
}
async function removeScenario(s: PrepScenario) {
  if (!(await askConfirm(`Supprimer « ${s.name} » ?`, { confirmLabel: 'Supprimer', danger: true }))) return
  await flush()
  busy.value = true
  try { await $fetch(`/api/scenarios/${s.id}`, { method: 'DELETE' }); failed.value.delete(s.id); await refresh(); selectedId.value = data.value?.scenarios[0]?.id }
  catch { actionError.value = 'Impossible de supprimer cette composition.' }
  finally { busy.value = false }
}
async function savePrep() {
  if (!prepForm.name.trim()) return
  busy.value = true
  try { await flush(); await $fetch(`/api/preps/${id}`, { method: 'PUT', body: prepForm }); data.value = { ...data.value!, prep: { ...data.value!.prep, ...prepForm } }; prepModal.value = false }
  catch { actionError.value = 'Impossible de modifier la préparation.' }
  finally { busy.value = false }
}
async function removePrep() {
  if (!(await askConfirm(`Supprimer « ${data.value!.prep.name} » et toutes ses compositions ?`, { confirmLabel: 'Supprimer', danger: true }))) return
  await flush()
  try { await $fetch(`/api/preps/${id}`, { method: 'DELETE' }); failed.value = new Set(); prepModal.value = false; await navigateTo('/prep') }
  catch { actionError.value = 'Impossible de supprimer la préparation.' }
}
onBeforeRouteLeave(async () => { await flush(); if (failed.value.size) return askConfirm('Certaines modifications ne sont pas enregistrées. Quitter cette préparation ?', { confirmLabel: 'Quitter', danger: true }) })
onBeforeUnmount(() => { clearTimeout(timer) })
</script>

<template>
  <div class="prep-detail-page">
    <div v-if="failed.size || actionError" role="alert" class="prep-save-error"><span>{{ actionError || 'Sauvegarde impossible. Tes modifications sont toujours affichées.' }}</span><button v-if="failed.size" type="button" class="prep-btn" @click="retry">Réessayer la sauvegarde</button></div>
    <PrepCompositionEditor v-if="selected" :key="selected.id" :scenario="selected" :champions="champions" :name-of="c => byId.get(c)?.name ?? c" :icon-url="iconUrl" :saving="pending > 0 || dirtyCount > 0" :save-error="failed.has(selected.id)" :busy="busy" @update="patch => patchScenario(selected!, patch)" @duplicate="addScenario(selected!.id)" @remove="removeScenario(selected!)">
      <template #context>
        <button type="button" class="prep-context-button" @click="Object.assign(prepForm, { name: data!.prep.name, opponent: data!.prep.opponent }); prepModal = true">{{ data!.prep.opponent ? `vs ${data!.prep.opponent}` : data!.prep.name }} <span aria-hidden="true">⌄</span></button>
        <label v-if="data!.scenarios.length > 1"><span class="sr-only">Composition de la préparation</span><select v-model="selectedId"><option v-for="s in data!.scenarios" :key="s.id" :value="s.id">{{ s.name }}</option></select></label>
      </template>
      <template #actions><button type="button" class="prep-btn" :disabled="busy" @click="addScenario()">+ Composition</button></template>
    </PrepCompositionEditor>
    <div v-else class="prep-empty"><NuxtLink to="/prep">← Galerie</NuxtLink><h1>{{ data!.prep.name }}</h1><p>Cette préparation ne contient aucune composition.</p><button class="btn-action" :disabled="busy" @click="addScenario()">+ Nouvelle composition</button><button class="prep-btn" @click="Object.assign(prepForm, { name: data!.prep.name, opponent: data!.prep.opponent }); prepModal = true">Modifier la préparation</button></div>
    <AppModal v-model="prepModal" title="Préparation">
      <form class="prep-form" @submit.prevent="savePrep"><label>Nom<input v-model="prepForm.name" required></label><label>Adversaire<input v-model="prepForm.opponent" placeholder="Facultatif"></label><div class="prep-form-actions"><button class="prep-btn prep-danger" type="button" :disabled="busy" @click="removePrep">Supprimer la préparation</button><button class="btn-action" type="submit" :disabled="busy">Enregistrer</button></div></form>
    </AppModal>
  </div>
</template>
