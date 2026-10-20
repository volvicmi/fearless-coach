<script setup lang="ts">
import { prepSteps } from '#shared/prep'
import { ROLES, SCENARIO_COLORS } from '#shared/types'
import type { Prep, PrepScenario, ScenarioColor } from '#shared/types'

const { data: preps, status, error, refresh } = await useFetch<Prep[]>('/api/preps')
const { byId, iconUrl } = await useChampions()
const query = ref('')
const prepFilter = ref('')
const styleFilter = ref('')
const creating = ref(false)
const open = ref(false)
const createError = ref('')
const form = reactive({ name: '', prep: '', prepName: '', opponent: '', color: 'engage' as ScenarioColor, ourSide: 'blue' as 'blue' | 'red' })
const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const nameOf = (id: string) => byId.value.get(id)?.name ?? id
const all = computed(() => (preps.value ?? []).flatMap(p => (p.scenarios ?? []).map(s => ({ ...s, prep: p }))))
const visible = computed(() => all.value.filter(s => (!prepFilter.value || String(s.prep.id) === prepFilter.value)
  && (!styleFilter.value || s.color === styleFilter.value)
  && normalize([s.name, s.prep.name, s.prep.opponent, ...s.slots.flat().map(nameOf)].join(' ')).includes(normalize(query.value))))
const picks = (s: NonNullable<Prep['scenarios']>[number]) => prepSteps(s.ourSide, 'pick')
  .map((step, pick) => ({ champion: s.slots[step]?.[0], role: s.pickRoles[pick]! }))
  .sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role))
  .map(p => p.champion)
const filled = (s: NonNullable<Prep['scenarios']>[number]) => [...prepSteps(s.ourSide, 'pick'), ...prepSteps(s.ourSide, 'ban')].filter(i => s.slots[i]?.length).length
const alternatives = (s: NonNullable<Prep['scenarios']>[number]) => s.slots.reduce((n, a) => n + Math.max(0, a.length - 1), 0)

function newComposition() {
  Object.assign(form, { name: '', prep: prepFilter.value, prepName: '', opponent: '', color: (styleFilter.value || 'engage') as ScenarioColor, ourSide: 'blue' })
  createError.value = ''
  open.value = true
}
async function create() {
  if (!form.name.trim() || creating.value) return
  creating.value = true
  createError.value = ''
  let prepId = Number(form.prep)
  let scenarioId: number | undefined
  const newPrep = !prepId
  try {
    if (newPrep) {
      const created = await $fetch<{ id: number }>('/api/preps', { method: 'POST', body: { name: form.prepName.trim() || form.name.trim(), opponent: form.opponent } })
      prepId = created.id
      const detail = await $fetch<{ scenarios: PrepScenario[] }>(`/api/preps/${prepId}`)
      scenarioId = detail.scenarios[0]?.id
    }
    else scenarioId = (await $fetch<PrepScenario>(`/api/preps/${prepId}/scenarios`, { method: 'POST', body: {} })).id
    if (!scenarioId) throw new Error('Composition non créée')
    await $fetch(`/api/scenarios/${scenarioId}`, { method: 'PUT', body: { name: form.name.trim(), color: form.color, ourSide: form.ourSide } })
    open.value = false
    await refresh()
    await navigateTo({ path: `/prep/${prepId}`, query: { s: scenarioId } })
  }
  catch {
    createError.value = 'Impossible de créer cette composition. Réessaie.'
    if (newPrep && prepId) await $fetch(`/api/preps/${prepId}`, { method: 'DELETE' }).catch(() => {})
    else if (scenarioId) await $fetch(`/api/scenarios/${scenarioId}`, { method: 'DELETE' }).catch(() => {})
  }
  finally { creating.value = false }
}
</script>

<template>
  <div class="prep-gallery-page">
    <header class="prep-gallery-heading">
      <div><h1>Toutes les compos <span>{{ all.length }}</span></h1></div>
      <button class="btn-action" type="button" @click="newComposition">+ Nouvelle composition</button>
    </header>
    <div class="prep-gallery-tools">
      <label class="prep-search"><span class="sr-only">Rechercher une composition ou un champion</span><input v-model="query" type="search" placeholder="Nom, champion ou adversaire…"></label>
      <label><span class="sr-only">Filtrer par préparation</span><select v-model="prepFilter"><option value="">Toutes les préparations</option><option v-for="p in preps" :key="p.id" :value="String(p.id)">{{ p.name }}</option></select></label>
      <div class="prep-style-filters" role="group" aria-label="Filtrer par type de composition">
        <button type="button" :aria-pressed="!styleFilter" @click="styleFilter = ''">Tous</button>
        <button v-for="color in SCENARIO_COLORS" :key="color" type="button" :aria-pressed="styleFilter === color" @click="styleFilter = color">{{ styleOf(color).label }}</button>
      </div>
    </div>
    <div v-if="error" class="prep-empty"><p>Impossible de charger les préparations.</p><button class="prep-btn" @click="refresh()">Réessayer</button></div>
    <p v-else-if="status === 'pending'" class="prep-empty">Chargement des compositions…</p>
    <div v-else-if="!visible.length" class="prep-empty">
      <h2>{{ all.length ? 'Aucune composition trouvée' : 'Ta première composition' }}</h2>
      <p>{{ all.length ? 'Essaie un autre nom ou élargis les filtres.' : 'Prépare tes picks, leurs alternatives et les duos que tu veux jouer.' }}</p>
      <button v-if="all.length" class="prep-btn" @click="query = ''; prepFilter = ''; styleFilter = ''">Effacer les filtres</button>
      <button v-else class="btn-action" @click="newComposition">+ Nouvelle composition</button>
    </div>
    <div v-else class="prep-gallery-grid">
      <NuxtLink v-for="s in visible" :key="s.id" :to="{ path: `/prep/${s.prep.id}`, query: { s: s.id } }" class="prep-gallery-card">
        <header><div><h2>{{ s.name }}</h2><p>{{ s.prep.opponent ? `vs ${s.prep.opponent}` : s.prep.name }}</p></div><span class="prep-type" :class="[styleOf(s.color).tint, styleOf(s.color).text]">{{ styleOf(s.color).label }}</span></header>
        <div class="prep-gallery-art"><div v-for="(champ, i) in picks(s)" :key="i"><PrepArt :id="champ" :name="champ ? nameOf(champ) : 'Pick à définir'" :fallback="champ ? iconUrl(champ) : undefined" /><span>{{ champ ? nameOf(champ) : 'À définir' }}</span></div></div>
        <footer><span>{{ alternatives(s) }} alternatives</span><span>{{ filled(s) }}/10 étapes</span><span aria-hidden="true">↗</span></footer>
      </NuxtLink>
    </div>
    <AppModal v-model="open" title="Nouvelle composition">
      <form class="prep-form" @submit.prevent="create">
        <label>Nom de la composition<input v-model="form.name" required maxlength="100" placeholder="Le nom de cette composition"></label>
        <label>Préparation<select v-model="form.prep"><option value="">Nouvelle préparation</option><option v-for="p in preps" :key="p.id" :value="String(p.id)">{{ p.name }}</option></select></label>
        <template v-if="!form.prep"><label>Nom de la préparation<input v-model="form.prepName" placeholder="Par défaut, le nom de la composition"></label><label>Adversaire<input v-model="form.opponent" placeholder="Facultatif"></label></template>
        <div class="prep-form-row"><label>Type<select v-model="form.color"><option v-for="c in SCENARIO_COLORS" :key="c" :value="c">{{ styleOf(c).label }}</option></select></label><label>Notre côté<select v-model="form.ourSide"><option value="blue">Bleu</option><option value="red">Rouge</option></select></label></div>
        <p v-if="createError" role="alert" class="text-red-300">{{ createError }}</p>
        <button class="btn-action" type="submit" :disabled="creating">{{ creating ? 'Création…' : 'Créer la composition' }}</button>
      </form>
    </AppModal>
  </div>
</template>
