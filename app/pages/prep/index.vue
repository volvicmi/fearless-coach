<script setup lang="ts">
import { prepSteps } from '#shared/prep'
import { ROLES, SCENARIO_COLORS } from '#shared/types'
import type { Prep, ScenarioColor } from '#shared/types'

const { data: preps, status, error, refresh } = await useFetch<Prep[]>('/api/preps')
const { byId, iconUrl } = await useChampions()
const query = ref('')
/** Tags cochés : une draft doit les avoir tous. */
const styleFilter = ref<ScenarioColor[]>([])
const toggleFilter = (tag: ScenarioColor) => { styleFilter.value = styleFilter.value.includes(tag) ? styleFilter.value.filter(t => t !== tag) : [...styleFilter.value, tag] }
const creating = ref(false)
const createError = ref('')
const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const nameOf = (id: string) => byId.value.get(id)?.name ?? id
/** Ordre choisi par glisser-déposer ; les drafts jamais rangées suivent, les plus récentes d'abord. */
const all = computed(() => (preps.value ?? []).flatMap(p => (p.scenarios ?? []).map(s => ({ ...s, prep: p })))
  .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity)))
const page = ref<HTMLElement>()
const orderError = ref('')
/** Place la draft `id` à l'endroit de `target` (avant ou après selon le sens du déplacement). */
function moveCard(id: number, target: number) {
  const ids = all.value.map(s => s.id)
  const down = ids.indexOf(id) < ids.indexOf(target)
  ids.splice(ids.indexOf(id), 1)
  ids.splice(ids.indexOf(target) + (down ? 1 : 0), 0, id)
  // useFetch renvoie une ref superficielle : il faut remplacer la liste pour que la galerie se réordonne.
  preps.value = (preps.value ?? []).map(p => ({ ...p, scenarios: p.scenarios?.map(s => ({ ...s, rank: ids.indexOf(s.id) })) }))
}
async function saveOrder() {
  orderError.value = ''
  try { await $fetch('/api/scenarios/order', { method: 'PUT', body: { ids: all.value.map(s => s.id) } }) }
  catch { orderError.value = 'Impossible d’enregistrer l’ordre.'; await refresh() }
}
const { dragging } = useCardReorder(page, moveCard, saveOrder)
const visible = computed(() => all.value.filter(s => styleFilter.value.every(t => s.styles.includes(t))
  && normalize([s.name, s.prep.name, s.prep.opponent, ...s.slots.flat().map(nameOf)].join(' ')).includes(normalize(query.value))))
const picks = (s: NonNullable<Prep['scenarios']>[number]) => prepSteps(s.ourSide, 'pick')
  .map((step, pick) => ({ champion: s.slots[step]?.[0], role: s.pickRoles[pick]! }))
  .sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role))
  .map(p => p.champion)

/** Une prep = une draft : on supprime la prep, sauf pour les anciennes preps à plusieurs drafts. */
async function removeDraft(s: (typeof all.value)[number]) {
  if (!(await askConfirm(`Supprimer « ${s.name} » ?`, { confirmLabel: 'Supprimer', danger: true }))) return
  try {
    await $fetch((s.prep.scenarios?.length ?? 1) > 1 ? `/api/scenarios/${s.id}` : `/api/preps/${s.prep.id}`, { method: 'DELETE' })
    await refresh()
  }
  catch { orderError.value = 'Impossible de supprimer cette draft.' }
}

/** Crée tout de suite une draft au nom générique (renommable dans l'éditeur) et l'ouvre. */
async function newComposition() {
  if (creating.value) return
  creating.value = true
  createError.value = ''
  try {
    const { id } = await $fetch<{ id: number }>('/api/preps', { method: 'POST', body: { styles: styleFilter.value } })
    await navigateTo(`/prep/${id}`)
  }
  catch { createError.value = 'Impossible de créer cette composition. Réessaie.' }
  finally { creating.value = false }
}
</script>

<template>
  <div ref="page" class="prep-gallery-page">
    <header class="prep-gallery-heading">
      <div><h1>Toutes les compos <span>{{ all.length }}</span></h1></div>
      <button class="btn-action" type="button" :disabled="creating" @click="newComposition">{{ creating ? 'Création…' : '+ Nouvelle composition' }}</button>
    </header>
    <div class="prep-gallery-tools">
      <label class="prep-search prep-search-icon"><span class="sr-only">Rechercher une draft ou un champion</span><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg><input v-model="query" type="search" placeholder="Rechercher…"></label>
      <div class="prep-style-filters" role="group" aria-label="Filtrer par type de composition">
        <button type="button" :aria-pressed="!styleFilter.length" @click="styleFilter = []">Tous</button>
        <button v-for="color in SCENARIO_COLORS" :key="color" type="button" :aria-pressed="styleFilter.includes(color)" @click="toggleFilter(color)"><span class="prep-dot" :class="styleOf(color).dot" />{{ styleOf(color).label }}</button>
      </div>
    </div>
    <p v-if="createError || orderError" role="alert" class="text-red-300">{{ createError || orderError }}</p>
    <div v-if="error" class="prep-empty"><p>Impossible de charger les préparations.</p><button class="prep-btn" @click="refresh()">Réessayer</button></div>
    <p v-else-if="status === 'pending'" class="prep-empty">Chargement des compositions…</p>
    <div v-else-if="!visible.length" class="prep-empty">
      <h2>{{ all.length ? 'Aucune composition trouvée' : 'Ta première composition' }}</h2>
      <p>{{ all.length ? 'Essaie un autre nom ou élargis les filtres.' : 'Prépare tes picks, leurs alternatives et ton plan de jeu.' }}</p>
      <button v-if="all.length" class="prep-btn" @click="query = ''; styleFilter = []">Effacer les filtres</button>
      <button v-else class="btn-action" @click="newComposition">+ Nouvelle composition</button>
    </div>
    <div v-else class="prep-gallery-grid">
      <NuxtLink v-for="s in visible" :key="s.id" :to="{ path: `/prep/${s.prep.id}`, query: { s: s.id } }" class="prep-gallery-card" :class="{ 'prep-card-dragging': dragging === s.id }" :data-card-id="s.id" title="Glisse la carte pour ranger tes drafts">
        <button type="button" class="prep-card-delete" :aria-label="`Supprimer ${s.name}`" title="Supprimer" @click.prevent.stop="removeDraft(s)">×</button>
        <header><h2>{{ s.name }}</h2><div class="prep-tags"><span v-for="tag in s.styles" :key="tag" class="prep-type" :class="styleOf(tag).solid">{{ styleOf(tag).label }}</span></div></header>
        <div class="prep-gallery-art"><div v-for="(champ, i) in picks(s)" :key="i"><PrepArt :id="champ" :name="champ ? nameOf(champ) : 'Pick à définir'" :fallback="champ ? iconUrl(champ) : undefined" /><span>{{ champ ? nameOf(champ) : 'À définir' }}</span></div></div>
        <footer><p class="prep-teaser">{{ s.notes.trim() || 'Pas encore de plan de jeu' }}</p></footer>
      </NuxtLink>
    </div>
  </div>
</template>
