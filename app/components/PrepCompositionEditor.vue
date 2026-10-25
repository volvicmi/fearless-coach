<script setup lang="ts">
import { DRAFT_ORDER } from '#shared/draft'
import type { Side } from '#shared/draft'
import { CHAMPION_ROLES } from '#shared/champion-roles'
import { MAX_PREP_OPTIONS, PREP_ROLE_LABEL, prepSteps } from '#shared/prep'
import { ROLES, SCENARIO_COLORS } from '#shared/types'
import type { Champion, PrepScenario, Role, ScenarioColor } from '#shared/types'

const props = defineProps<{ scenario: PrepScenario, champions: Champion[], nameOf: (id: string) => string, iconUrl: (id: string) => string, saving: boolean, saveError: boolean, busy: boolean }>()
const emit = defineEmits<{ update: [patch: Partial<PrepScenario>], remove: [] }>()
const root = ref<HTMLElement>()
const picker = ref<HTMLElement>()
const searchInput = ref<HTMLInputElement>()
const search = ref('')
const roleFilter = ref<Role | ''>('')
/** `option` = index remplacé au prochain clic sur un champion ; `null` = ajout d'une alternative. */
const selected = ref({ step: prepSteps(props.scenario.ourSide, 'pick')[0]!, option: 0 as number | null })
const feedback = ref('')
const pickSteps = computed(() => prepSteps(props.scenario.ourSide, 'pick'))
const banSteps = computed(() => prepSteps(props.scenario.ourSide, 'ban'))
const choices = (step: number) => props.scenario.slots[step] ?? []
const label = (step: number) => { const s = DRAFT_ORDER[step]!; return s.type === 'ban' ? `Ban ${s.slot + 1}` : `${props.scenario.ourSide === 'blue' ? 'B' : 'R'}${s.slot + 1}` }
/** Nos étapes dans l'ordre de la draft : bans phase 1, picks 1-3, bans phase 2, picks 4-5. */
const rows = computed(() => [
  { kind: 'bans' as const, title: 'Bans 1', steps: banSteps.value.slice(0, 3) },
  ...pickSteps.value.slice(0, 3).map((step, pick) => ({ kind: 'pick' as const, step, pick })),
  { kind: 'bans' as const, title: 'Bans 2', steps: banSteps.value.slice(3) },
  ...pickSteps.value.slice(3).map((step, i) => ({ kind: 'pick' as const, step, pick: i + 3 })),
])
const selectedChoices = computed(() => choices(selected.value.step))
const selectedChampion = computed(() => selected.value.option === null ? undefined : selectedChoices.value[selected.value.option])
const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
const filteredChampions = computed(() => {
  const q = normalize(search.value)
  const list = props.champions.filter(c => (!roleFilter.value || CHAMPION_ROLES[c.id]?.includes(roleFilter.value)) && (!q || normalize(c.name).includes(q) || normalize(c.id).includes(q)))
  const rank = (c: Champion) => normalize(c.name) === q || normalize(c.id) === q ? 0 : normalize(c.name).startsWith(q) ? 1 : 2
  return q ? [...list].sort((a, b) => rank(a) - rank(b)) : list
})
const disabled = (id: string) => selectedChoices.value.includes(id) || (selected.value.option === null && selectedChoices.value.length >= MAX_PREP_OPTIONS)
const isSelected = (step: number, option: number | null) => selected.value.step === step && selected.value.option === option
const pickerTitle = computed(() => {
  if (selectedChampion.value) return `Remplacer ${props.nameOf(selectedChampion.value)}`
  return selectedChoices.value.length ? 'Ajouter une alternative' : 'Choisir un champion'
})

/** Sur ordinateur, le curseur va dans la recherche : on tape le champion puis Entrée. Sur téléphone, on fait défiler jusqu'au choix. */
function revealPicker() {
  if (!import.meta.client) return
  if (window.matchMedia('(max-width: 900px)').matches) void nextTick(() => picker.value?.scrollIntoView({ block: 'start', behavior: 'auto' }))
  else void nextTick(() => searchInput.value?.focus())
}
function select(step: number, option: number | null) {
  // Une étape vide : le prochain champion devient le choix principal.
  selected.value = { step, option: choices(step).length ? option : 0 }
  search.value = ''; feedback.value = ''
  revealPicker()
}
function updateSlots(slots: string[][]) { emit('update', { slots }) }
function place(id: string, step: number, index?: number, from?: number) {
  const slots = props.scenario.slots.map(s => [...s])
  // Un ban n'a pas d'alternative : le champion déposé remplace l'ancien.
  if (DRAFT_ORDER[step]!.type === 'ban') {
    if (from !== undefined && from !== step) slots[from] = slots[from]!.filter(c => c !== id)
    slots[step] = [id]
    updateSlots(slots)
    return
  }
  const dest = slots[step]!.filter(c => c !== id)
  if (dest.length >= MAX_PREP_OPTIONS) { feedback.value = 'Six choix maximum par étape. Retire une alternative.'; return }
  if (from !== undefined && from !== step) slots[from] = slots[from]!.filter(c => c !== id)
  dest.splice(Math.min(index ?? dest.length, dest.length), 0, id); slots[step] = dest
  updateSlots(slots)
}
function chooseChampion(id: string) {
  if (disabled(id)) return
  const slots = props.scenario.slots.map(s => [...s]), list = slots[selected.value.step]!
  const option = selected.value.option
  if (option !== null && option < list.length) list[option] = id
  else { list.push(id); selected.value.option = list.length - 1 }
  updateSlots(slots); feedback.value = `${props.nameOf(id)} enregistré pour ${label(selected.value.step)}.`
  search.value = ''; searchInput.value?.focus()
}
function removeOption(step: number, position: number) {
  const slots = props.scenario.slots.map(s => [...s]); slots[step]!.splice(position, 1); updateSlots(slots)
  selected.value = { step, option: slots[step]!.length ? null : 0 }
}
function switchSide(side: Side) {
  if (side === props.scenario.ourSide) return
  const before = DRAFT_ORDER[selected.value.step]!, slots = DRAFT_ORDER.map(() => [] as string[])
  DRAFT_ORDER.forEach((s, i) => { if (s.side === props.scenario.ourSide) { const j = DRAFT_ORDER.findIndex(t => t.side === side && t.type === s.type && t.slot === s.slot); slots[j] = [...props.scenario.slots[i]!] } })
  selected.value.step = DRAFT_ORDER.findIndex(s => s.side === side && s.type === before.type && s.slot === before.slot)
  emit('update', { ourSide: side, slots })
}
function toggleStyle(tag: ScenarioColor) {
  const styles = props.scenario.styles.includes(tag) ? props.scenario.styles.filter(t => t !== tag) : SCENARIO_COLORS.filter(t => t === tag || props.scenario.styles.includes(t))
  emit('update', { styles, color: styles[0] ?? 'engage' })
}
function saveNote(pick: number, value: string) { const pickNotes = [...props.scenario.pickNotes]; pickNotes[pick] = value; emit('update', { pickNotes }) }
function saveName(event: Event) { const input = event.target as HTMLInputElement; const name = input.value.trim(); if (name) emit('update', { name }); else input.value = props.scenario.name }
useChampionDrag(root, (id, destination, index, from) => {
  if (destination === 'remove') { if (from !== undefined) { const slots = props.scenario.slots.map(s => [...s]); slots[Number(from)] = slots[Number(from)]!.filter(c => c !== id); updateSlots(slots) } return }
  place(id, Number(destination), index, from !== undefined ? Number(from) : undefined)
})
</script>

<template>
  <div ref="root" class="prep-editor">
    <header class="prep-detail-heading">
      <div class="prep-title-group">
        <NuxtLink to="/prep" class="prep-back">← Galerie</NuxtLink>
        <label class="sr-only" for="prep-title">Nom de la draft</label>
        <input id="prep-title" class="prep-title-input" :value="scenario.name" maxlength="100" @change="saveName">
        <div class="prep-meta">
          <div class="prep-style-switch" role="group" aria-label="Tags de la draft">
            <button v-for="tag in SCENARIO_COLORS" :key="tag" type="button" :aria-pressed="scenario.styles.includes(tag)" :style="{ '--tag': styleOf(tag).hex }" @click="toggleStyle(tag)"><span class="prep-dot" />{{ styleOf(tag).label }}</button>
          </div>
          <div class="prep-side-switch" role="group" aria-label="Notre côté"><button v-for="side in (['blue', 'red'] as const)" :key="side" type="button" :aria-pressed="scenario.ourSide === side" @click="switchSide(side)">{{ side === 'blue' ? 'Bleu' : 'Rouge' }}</button></div>
          <button class="prep-btn prep-danger prep-delete" type="button" :disabled="busy" @click="emit('remove')">Supprimer</button>
        </div>
      </div>
    </header>
    <div class="prep-workspace">
      <section class="prep-order" aria-label="Nos étapes dans l'ordre de la draft">
        <template v-for="row in rows" :key="row.kind === 'pick' ? `p${row.step}` : row.title">
          <div v-if="row.kind === 'bans'" class="prep-ban-row">
            <h3>{{ row.title }}</h3>
            <div v-for="step in row.steps" :key="step" class="prep-slot-zone" :data-tier-drop="String(step)">
              <span v-if="choices(step)[0]" class="prep-icon-wrap">
                <button type="button" class="prep-icon" :class="{ 'prep-choice-active': isSelected(step, 0) }" :title="nameOf(choices(step)[0]!)" :data-drag-champ="choices(step)[0]" :data-drag-from="String(step)" :aria-label="`${label(step)} : ${nameOf(choices(step)[0]!)}`" @click="select(step, 0)"><img :src="iconUrl(choices(step)[0]!)" alt="" draggable="false"></button>
                <button type="button" class="prep-icon-remove" :aria-label="`Retirer ${nameOf(choices(step)[0]!)}`" @click="removeOption(step, 0)">×</button>
              </span>
              <button v-else type="button" class="prep-icon prep-icon-empty" :class="{ 'prep-choice-active': selected.step === step }" :aria-label="`Choisir ${label(step)}`" @click="select(step, 0)" />
            </div>
          </div>
          <article v-else class="prep-pick-row" :class="{ 'prep-card-active': selected.step === row.step }">
            <span class="prep-pick-order" :class="scenario.ourSide === 'blue' ? 'text-side-blue' : 'text-side-red'">{{ label(row.step) }}</span>
            <div class="prep-slot-zone" :data-tier-drop="String(row.step)">
              <span v-for="(champ, j) in choices(row.step)" :key="champ" class="prep-icon-wrap" :class="{ 'prep-icon-main': j === 0 }">
                <button type="button" class="prep-icon" :class="{ 'prep-choice-active': isSelected(row.step, j) }" :title="nameOf(champ)" :data-drag-champ="champ" :data-drag-from="String(row.step)" :aria-label="`${j ? 'Alternative' : 'Choix principal'} ${label(row.step)} : ${nameOf(champ)}`" @click="select(row.step, j)"><img :src="iconUrl(champ)" alt="" draggable="false"></button>
                <button type="button" class="prep-icon-remove" :aria-label="`Retirer ${nameOf(champ)}`" @click="removeOption(row.step, j)">×</button>
              </span>
              <button v-for="n in MAX_PREP_OPTIONS - choices(row.step).length" :key="`empty${n}`" type="button" class="prep-icon prep-icon-empty" :class="{ 'prep-icon-main': !choices(row.step).length && n === 1, 'prep-choice-active': n === 1 && selected.step === row.step && (selected.option === null || !choices(row.step).length) }" :aria-label="choices(row.step).length ? `Ajouter une alternative ${label(row.step)}` : `Choisir ${label(row.step)}`" @click="select(row.step, null)" />
            </div>
            <label class="prep-pick-note"><span class="sr-only">Note du pick {{ label(row.step) }}</span><textarea :value="scenario.pickNotes[row.pick]" rows="2" maxlength="500" placeholder="Note" @change="saveNote(row.pick, ($event.target as HTMLTextAreaElement).value)" /></label>
          </article>
        </template>
        <label class="prep-plan"><h3>Plan de jeu</h3><textarea :value="scenario.notes" rows="5" maxlength="5000" placeholder="Condition de victoire, timings, comment on joue les fights…" @change="emit('update', { notes: ($event.target as HTMLTextAreaElement).value })" /></label>
      </section>
      <aside ref="picker" class="prep-picker" data-tier-drop="remove" aria-label="Choisir un champion">
        <p class="prep-eyebrow">{{ label(selected.step) }} · {{ pickerTitle }}</p>
        <label class="prep-search"><span class="sr-only">Rechercher un champion</span><input ref="searchInput" v-model="search" type="search" placeholder="Chercher un champion…" @keydown.enter.prevent="filteredChampions.find(c => !disabled(c.id)) && chooseChampion(filteredChampions.find(c => !disabled(c.id))!.id)"></label>
        <div class="prep-role-filters" role="group" aria-label="Filtrer les champions par rôle"><button type="button" :aria-pressed="!roleFilter" @click="roleFilter = ''">Tous</button><button v-for="r in ROLES" :key="r" type="button" :aria-pressed="roleFilter === r" @click="roleFilter = r">{{ PREP_ROLE_LABEL[r] }}</button></div>
        <div class="prep-champion-grid"><button v-for="c in filteredChampions" :key="c.id" class="prep-champion" type="button" :disabled="disabled(c.id)" :title="c.name" :aria-label="`Choisir ${c.name}`" :data-drag-champ="!disabled(c.id) ? c.id : undefined" @click="chooseChampion(c.id)"><img :src="iconUrl(c.id)" alt="" loading="lazy" draggable="false"></button><p v-if="!filteredChampions.length" class="prep-picker-help">Aucun résultat.</p></div>
      </aside>
    </div>
    <footer class="prep-editor-status"><span role="status" aria-live="polite">{{ feedback }}</span><span class="prep-save-status" :class="{ 'prep-danger': saveError }">{{ saveError ? 'Non enregistré' : saving ? 'Enregistrement…' : 'Enregistré' }}</span></footer>
  </div>
</template>
