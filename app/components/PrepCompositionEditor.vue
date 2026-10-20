<script setup lang="ts">
import { DRAFT_ORDER } from '#shared/draft'
import type { Side } from '#shared/draft'
import { CHAMPION_ROLES } from '#shared/champion-roles'
import { MAX_PREP_COMBOS, MAX_PREP_OPTIONS, PREP_ROLE_LABEL, prepComboKey, prepSteps } from '#shared/prep'
import { ROLES, SCENARIO_COLORS } from '#shared/types'
import type { Champion, PrepCombo, PrepScenario, Role } from '#shared/types'

const props = defineProps<{ scenario: PrepScenario, champions: Champion[], nameOf: (id: string) => string, iconUrl: (id: string) => string, saving: boolean, saveError: boolean, busy: boolean }>()
const emit = defineEmits<{ update: [patch: Partial<PrepScenario>], duplicate: [], remove: [] }>()
type ComboTarget = { pick: number, champion: string, partnerPick: number, linkId?: string }
const root = ref<HTMLElement>()
const picker = ref<HTMLElement>()
const notesOpen = ref(false)
const search = ref('')
const roleFilter = ref<Role | ''>('')
const mode = ref<'pick' | 'combo'>('pick')
const selected = ref({ step: prepSteps(props.scenario.ourSide, 'pick')[0]!, option: 0 as number | null })
const comboTarget = ref<ComboTarget>()
const feedback = ref('')
const pickSteps = computed(() => prepSteps(props.scenario.ourSide, 'pick'))
const banSteps = computed(() => prepSteps(props.scenario.ourSide, 'ban'))
const choices = (pick: number) => props.scenario.slots[pickSteps.value[pick]!] ?? []
const roleOf = (pick: number) => props.scenario.pickRoles[pick]!
const roleLabel = (pick: number) => PREP_ROLE_LABEL[roleOf(pick)]
const label = (step: number) => { const s = DRAFT_ORDER[step]!; return s.type === 'ban' ? `Ban ${s.slot + 1}` : `${props.scenario.ourSide === 'blue' ? 'B' : 'R'}${s.slot + 1}` }
const columns = computed(() => pickSteps.value.map((step, pick) => ({ step, pick, role: roleOf(pick) })).sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role)))
const selectedChoices = computed(() => props.scenario.slots[selected.value.step] ?? [])
const selectedChampion = computed(() => selected.value.option === null ? undefined : selectedChoices.value[selected.value.option])
const selectedPick = computed(() => DRAFT_ORDER[selected.value.step]!.slot)
const isPick = computed(() => DRAFT_ORDER[selected.value.step]!.type === 'pick')
const allSteps = computed(() => [...pickSteps.value, ...banSteps.value])
const filled = computed(() => allSteps.value.filter(i => props.scenario.slots[i]?.length).length)
const alternatives = computed(() => allSteps.value.reduce((n, i) => n + Math.max(0, (props.scenario.slots[i]?.length ?? 0) - 1), 0))
const linked = computed(() => props.scenario.combos.find(c => c.id === comboTarget.value?.linkId))
const orient = (link: PrepCombo, pick: number) => link.a.pick === pick ? { anchor: link.a, partner: link.b } : { anchor: link.b, partner: link.a }
const linksFor = (pick: number) => props.scenario.combos.filter(c => c.a.pick === pick || c.b.pick === pick).map(link => ({ link, ...orient(link, pick) }))
const comboPartner = computed(() => !comboTarget.value ? undefined : linked.value ? orient(linked.value, comboTarget.value.pick).partner.champion : choices(comboTarget.value.partnerPick)[0])
const comboReady = computed(() => !!linked.value && [linked.value.a, linked.value.b].every(end => choices(end.pick)[0] === end.champion))
const comboAnchors = computed(() => comboTarget.value ? [...new Set([...choices(comboTarget.value.pick), comboTarget.value.champion])] : [])
const defaultDupe = computed(() => { const ct = comboTarget.value; return ct && comboPartner.value ? props.scenario.combos.find(c => prepComboKey(c) === prepComboKey({ a: { pick: ct.pick, champion: ct.champion }, b: { pick: ct.partnerPick, champion: comboPartner.value! } })) : undefined })
const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
const filteredChampions = computed(() => {
  const q = normalize(search.value)
  const list = props.champions.filter(c => (!roleFilter.value || CHAMPION_ROLES[c.id]?.includes(roleFilter.value)) && (!q || normalize(c.name).includes(q) || normalize(c.id).includes(q)))
  const rank = (c: Champion) => normalize(c.name) === q || normalize(c.id) === q ? 0 : normalize(c.name).startsWith(q) ? 1 : 2
  return q ? [...list].sort((a, b) => rank(a) - rank(b)) : list
})
function disabled(id: string) { return mode.value === 'combo' ? id === comboTarget.value?.champion : selectedChoices.value.includes(id) || (selected.value.option === null && selectedChoices.value.length >= MAX_PREP_OPTIONS) }
const columnActive = (pick: number) => mode.value === 'combo' ? comboTarget.value?.pick === pick || comboTarget.value?.partnerPick === pick : isPick.value && selectedPick.value === pick
function revealPicker() { if (import.meta.client && window.matchMedia('(max-width: 900px)').matches) void nextTick(() => picker.value?.scrollIntoView({ block: 'start', behavior: 'auto' })) }
function select(step: number, option: number | null = null) {
  selected.value = { step, option }; mode.value = 'pick'; comboTarget.value = undefined; search.value = ''; feedback.value = ''
  roleFilter.value = DRAFT_ORDER[step]!.type === 'pick' ? roleOf(DRAFT_ORDER[step]!.slot) : ''
  revealPicker()
}
function updateSlots(slots: string[][]) { emit('update', { slots }) }
function place(id: string, step: number, index?: number, from?: number) {
  const slots = props.scenario.slots.map(s => [...s])
  const dest = slots[step]!.filter(c => c !== id)
  if (dest.length >= MAX_PREP_OPTIONS) { feedback.value = 'Six choix maximum par étape. Retire une alternative.'; return }
  if (from !== undefined && from !== step) slots[from] = slots[from]!.filter(c => c !== id)
  dest.splice(Math.min(index ?? dest.length, dest.length), 0, id); slots[step] = dest
  updateSlots(slots)
}
function chooseChampion(id: string) {
  if (disabled(id)) return
  if (mode.value === 'combo') { saveCombo(id); return }
  const slots = props.scenario.slots.map(s => [...s]), list = slots[selected.value.step]!
  const option = selected.value.option
  if (option !== null && option < list.length) list[option] = id
  else { list.push(id); selected.value.option = list.length - 1 }
  updateSlots(slots); feedback.value = `${props.nameOf(id)} enregistré pour ${label(selected.value.step)}.`
}
function removeOption(position: number) { const slots = props.scenario.slots.map(s => [...s]); slots[selected.value.step]!.splice(position, 1); updateSlots(slots); selected.value.option = null }
function promote() { if (selected.value.option === null || selected.value.option < 1) return; const slots = props.scenario.slots.map(s => [...s]), list = slots[selected.value.step]!; list.unshift(...list.splice(selected.value.option, 1)); selected.value.option = 0; updateSlots(slots) }
function switchSide(side: Side) {
  if (side === props.scenario.ourSide) return
  const before = DRAFT_ORDER[selected.value.step]!, slots = DRAFT_ORDER.map(() => [] as string[])
  DRAFT_ORDER.forEach((s, i) => { if (s.side === props.scenario.ourSide) { const j = DRAFT_ORDER.findIndex(t => t.side === side && t.type === s.type && t.slot === s.slot); slots[j] = [...props.scenario.slots[i]!] } })
  selected.value.step = DRAFT_ORDER.findIndex(s => s.side === side && s.type === before.type && s.slot === before.slot)
  emit('update', { ourSide: side, slots })
}
function changeRole(pick: number, value: Role) {
  const pickRoles = [...props.scenario.pickRoles], other = pickRoles.indexOf(value)
  if (other >= 0) pickRoles[other] = pickRoles[pick]!
  pickRoles[pick] = value
  emit('update', { pickRoles })
}
function openCombo(pick: number, link?: PrepCombo) {
  const ends = link ? orient(link, pick) : undefined, champion = ends?.anchor.champion ?? choices(pick)[0]
  if (!champion) return
  const preferred: Record<Role, Role> = { top: 'jungle', jungle: 'top', mid: 'jungle', adc: 'support', support: 'adc' }
  const partnerPick = ends?.partner.pick ?? props.scenario.pickRoles.findIndex((r, i) => i !== pick && r === preferred[roleOf(pick)])
  comboTarget.value = { pick, champion, partnerPick, linkId: link?.id }; mode.value = 'combo'; search.value = ''; roleFilter.value = roleOf(partnerPick); feedback.value = ''
  revealPicker()
}
function editComboField(field: 'champion' | 'partnerPick', value: string) {
  if (!comboTarget.value) return
  comboTarget.value = { ...comboTarget.value, linkId: undefined, ...(field === 'champion' ? { champion: value } : { partnerPick: Number(value) }) }
  roleFilter.value = roleOf(comboTarget.value.partnerPick); search.value = ''
}
function saveCombo(partner: string) {
  const ct = comboTarget.value
  if (!ct || partner === ct.champion) return
  if (!ct.linkId && props.scenario.combos.length >= MAX_PREP_COMBOS) { feedback.value = 'Cette composition contient déjà 60 combos.'; return }
  const combo: PrepCombo = { id: ct.linkId ?? crypto.randomUUID(), a: { pick: ct.pick, champion: ct.champion }, b: { pick: ct.partnerPick, champion: partner } }
  const duplicate = props.scenario.combos.find(c => c.id !== ct.linkId && prepComboKey(c) === prepComboKey(combo))
  if (duplicate) { openCombo(ct.pick, duplicate); feedback.value = 'Ce duo est déjà préparé.'; return }
  const combos = ct.linkId ? props.scenario.combos.map(c => c.id === ct.linkId ? combo : c) : [...props.scenario.combos, combo]
  emit('update', { combos }); comboTarget.value = { ...ct, linkId: combo.id }; feedback.value = `Combo ${props.nameOf(ct.champion)} + ${props.nameOf(partner)} enregistré.`
}
function removeCombo() { if (!comboTarget.value) return; const pick = comboTarget.value.pick; emit('update', { combos: props.scenario.combos.filter(c => c.id !== comboTarget.value!.linkId) }); openCombo(pick); feedback.value = 'Combo supprimé des deux picks.' }
function applyCombo() {
  if (!linked.value) return
  const slots = props.scenario.slots.map(s => [...s])
  for (const end of [linked.value.a, linked.value.b]) { const list = slots[pickSteps.value[end.pick]!]!; if (!list.includes(end.champion) && list.length >= MAX_PREP_OPTIONS) { feedback.value = `Retire une alternative ${roleLabel(end.pick)} avant d’appliquer ce duo.`; return } }
  for (const end of [linked.value.a, linked.value.b]) { const step = pickSteps.value[end.pick]!; slots[step] = [end.champion, ...slots[step]!.filter(c => c !== end.champion)] }
  updateSlots(slots); feedback.value = 'Duo appliqué. Les précédents choix restent en alternatives.'
}
function saveName(event: Event) { const input = event.target as HTMLInputElement; const name = input.value.trim(); if (name) emit('update', { name }); else input.value = props.scenario.name }
useChampionDrag(root, (id, destination, index, from) => {
  if (destination.startsWith('combo:')) {
    const pick = Number(destination.split(':')[1])
    if (!choices(pick)[0]) { feedback.value = 'Choisis le champion principal avant de préparer son combo.'; return }
    openCombo(pick); saveCombo(id); return
  }
  if (destination === 'remove') { if (from !== undefined) { const slots = props.scenario.slots.map(s => [...s]); slots[Number(from)] = slots[Number(from)]!.filter(c => c !== id); updateSlots(slots) } return }
  mode.value = 'pick'; comboTarget.value = undefined
  place(id, Number(destination), index, from !== undefined ? Number(from) : undefined)
})
</script>

<template>
  <div ref="root" class="prep-editor">
    <header class="prep-detail-heading">
      <NuxtLink to="/prep" class="prep-back">← Galerie</NuxtLink>
      <div class="prep-title-group"><label class="sr-only" for="prep-title">Nom de la composition</label><input id="prep-title" class="prep-title-input" :value="scenario.name" maxlength="100" @change="saveName"><div class="prep-meta"><slot name="context" /><label><span class="sr-only">Type de composition</span><select :value="scenario.color" @change="emit('update', { color: ($event.target as HTMLSelectElement).value as PrepScenario['color'] })"><option v-for="color in SCENARIO_COLORS" :key="color" :value="color">{{ styleOf(color).label }}</option></select></label><div class="prep-side-switch" role="group" aria-label="Notre côté"><button v-for="side in (['blue', 'red'] as const)" :key="side" type="button" :aria-pressed="scenario.ourSide === side" @click="switchSide(side)">Côté {{ side === 'blue' ? 'bleu' : 'rouge' }}</button></div><span class="prep-save-status" :class="{ 'prep-danger': saveError }">{{ saveError ? 'Non enregistré' : saving ? 'Enregistrement…' : 'Enregistré' }}</span></div></div>
      <div class="prep-detail-actions"><button class="prep-btn prep-quiet" type="button" @click="notesOpen = true">Notes</button><button class="prep-btn" type="button" :disabled="busy" @click="emit('duplicate')">Dupliquer</button><slot name="actions" /><button class="prep-btn prep-quiet prep-danger" type="button" :disabled="busy" aria-label="Supprimer la composition" @click="emit('remove')">✕</button></div>
    </header>
    <div class="prep-workspace">
      <section class="prep-composer" aria-label="Composition et bans">
        <div class="prep-pick-board">
          <article v-for="col in columns" :key="col.pick" class="prep-pick-card" :class="{ 'prep-card-active': columnActive(col.pick) }" :data-tier-drop="String(col.step)">
            <header class="prep-pick-role"><label><span class="sr-only">Rôle du pick {{ label(col.step) }}</span><select :value="col.role" @change="changeRole(col.pick, ($event.target as HTMLSelectElement).value as Role)"><option v-for="r in ROLES" :key="r" :value="r">{{ PREP_ROLE_LABEL[r] }}</option></select></label><span :title="`Tour ${col.step + 1}`">{{ label(col.step) }}</span></header>
            <button class="prep-main-choice" :class="{ 'prep-choice-active': mode === 'pick' && selected.step === col.step && selected.option === 0 }" type="button" :aria-label="`Modifier le choix principal ${roleLabel(col.pick)}`" :data-drag-champ="choices(col.pick)[0]" :data-drag-from="String(col.step)" @click="select(col.step, 0)"><PrepArt :id="choices(col.pick)[0]" :name="choices(col.pick)[0] ? nameOf(choices(col.pick)[0]!) : 'Pick à définir'" :fallback="choices(col.pick)[0] ? iconUrl(choices(col.pick)[0]!) : undefined" eager /><span class="prep-art-edit">Modifier</span><strong>{{ choices(col.pick)[0] ? nameOf(choices(col.pick)[0]!) : 'Choisir un champion' }}</strong></button>
            <section class="prep-card-options" :aria-label="`Alternatives ${roleLabel(col.pick)}`"><header><h3>Alternatives <small>{{ Math.max(0, choices(col.pick).length - 1) }}</small></h3><button type="button" :disabled="choices(col.pick).length >= MAX_PREP_OPTIONS" :aria-label="`Ajouter une alternative ${roleLabel(col.pick)}`" @click="select(col.step)">+</button></header><div class="prep-choice-strip"><template v-if="choices(col.pick).length > 1"><button v-for="(champ, j) in choices(col.pick).slice(1, choices(col.pick).length > 3 ? 2 : 3)" :key="champ" type="button" class="prep-art-tile" :class="{ 'prep-choice-active': mode === 'pick' && selected.step === col.step && selected.option === j + 1 }" :data-drag-champ="champ" :data-drag-from="String(col.step)" :aria-label="`Modifier ${nameOf(champ)}, alternative ${roleLabel(col.pick)}`" @click="select(col.step, j + 1)"><PrepArt :id="champ" :name="nameOf(champ)" :fallback="iconUrl(champ)" /><span>{{ nameOf(champ) }}</span></button><button v-if="choices(col.pick).length > 3" class="prep-art-tile prep-more-tile" type="button" @click="select(col.step, 1)">+{{ choices(col.pick).length - 2 }}<small>Voir tout</small></button></template><button v-else class="prep-empty-option" type="button" @click="select(col.step)">+ {{ choices(col.pick).length ? 'Alternative' : 'Premier choix' }}</button></div></section>
            <section class="prep-card-options" :aria-label="`Combos ${roleLabel(col.pick)}`" :data-tier-drop="`combo:${col.pick}`"><header><h3>Combos <small>{{ linksFor(col.pick).length }}</small></h3><button type="button" :disabled="!choices(col.pick).length" :aria-label="`Ajouter un combo ${roleLabel(col.pick)}`" @click="openCombo(col.pick)">+</button></header><div class="prep-choice-strip"><template v-if="linksFor(col.pick).length"><button v-for="item in linksFor(col.pick).slice(0, linksFor(col.pick).length > 2 ? 1 : 2)" :key="item.link.id" class="prep-art-tile" :class="{ 'prep-choice-active': mode === 'combo' && linked?.id === item.link.id }" type="button" :aria-label="`Combo ${nameOf(item.anchor.champion)} avec ${nameOf(item.partner.champion)}`" @click="openCombo(col.pick, item.link)"><PrepArt :id="item.partner.champion" :name="nameOf(item.partner.champion)" :fallback="iconUrl(item.partner.champion)" /><small>{{ item.anchor.champion === choices(col.pick)[0] ? roleLabel(item.partner.pick) : `avec ${nameOf(item.anchor.champion)}` }}</small><span>{{ nameOf(item.partner.champion) }}</span></button><button v-if="linksFor(col.pick).length > 2" class="prep-art-tile prep-more-tile" type="button" @click="openCombo(col.pick, linksFor(col.pick)[0]!.link)">+{{ linksFor(col.pick).length - 1 }}<small>Voir tout</small></button></template><button v-else class="prep-empty-option" type="button" :disabled="!choices(col.pick).length" @click="openCombo(col.pick)">+ {{ choices(col.pick).length ? 'Partenaire' : 'Choisis un pick' }}</button></div></section>
          </article>
        </div>
        <section class="prep-bans" aria-label="Nos cinq bans"><header><h3>Bans</h3><small>Phase 1 : 3<br>Phase 2 : 2</small></header><div><button v-for="(step, i) in banSteps" :key="step" class="prep-ban" :class="{ 'prep-card-active': mode === 'pick' && selected.step === step, 'prep-ban-phase': i === 3 }" type="button" :data-tier-drop="String(step)" :aria-label="`Modifier Ban ${i + 1}`" @click="select(step, 0)"><PrepArt :id="scenario.slots[step]?.[0]" :name="scenario.slots[step]?.[0] ? nameOf(scenario.slots[step]![0]!) : 'Ban à définir'" :fallback="scenario.slots[step]?.[0] ? iconUrl(scenario.slots[step]![0]!) : undefined" /><span><small>Ban {{ i + 1 }}{{ (scenario.slots[step]?.length ?? 0) > 1 ? ` · +${scenario.slots[step]!.length - 1}` : '' }}</small><strong>{{ scenario.slots[step]?.[0] ? nameOf(scenario.slots[step]![0]!) : 'À définir' }}</strong></span></button></div></section>
      </section>
      <aside ref="picker" class="prep-picker" :data-tier-drop="mode === 'pick' ? 'remove' : undefined" :aria-label="mode === 'combo' ? 'Modifier le combo' : 'Choisir un champion'">
        <div class="prep-picker-context">
          <button class="prep-mobile-back prep-btn prep-quiet" type="button" @click="root?.querySelector('.prep-card-active')?.scrollIntoView({ block: 'center' })">↑ Revoir ma draft</button>
          <template v-if="mode === 'combo' && comboTarget">
            <p class="prep-eyebrow">Combo · {{ roleLabel(comboTarget.pick) }} + {{ roleLabel(comboTarget.partnerPick) }}</p><h2>{{ nameOf(comboTarget.champion) }}{{ linked && comboPartner ? ` + ${nameOf(comboPartner)}` : '' }}</h2><p class="prep-picker-help">Choisis le rôle, puis le champion partenaire.</p>
            <div class="prep-combo-fields"><label>Champion de départ<select :value="comboTarget.champion" @change="editComboField('champion', ($event.target as HTMLSelectElement).value)"><option v-for="c in comboAnchors" :key="c" :value="c">{{ nameOf(c) }}</option></select></label><label>Avec quel rôle ?<select :value="comboTarget.partnerPick" @change="editComboField('partnerPick', ($event.target as HTMLSelectElement).value)"><template v-for="(r, p) in scenario.pickRoles" :key="p"><option v-if="p !== comboTarget.pick" :value="p">{{ PREP_ROLE_LABEL[r] }} · {{ label(pickSteps[p]!) }}</option></template></select></label></div>
            <div class="prep-duo"><div><PrepArt :id="comboTarget.champion" :name="nameOf(comboTarget.champion)" :fallback="iconUrl(comboTarget.champion)" /><strong>{{ nameOf(comboTarget.champion) }}</strong></div><span>+</span><div><PrepArt :id="comboPartner" :name="comboPartner ? nameOf(comboPartner) : 'À choisir'" :fallback="comboPartner ? iconUrl(comboPartner) : undefined" /><strong>{{ comboPartner ? nameOf(comboPartner) : 'À choisir' }}</strong></div></div>
            <div v-if="linksFor(comboTarget.pick).length > 1" class="prep-related-combos"><button v-for="item in linksFor(comboTarget.pick)" :key="item.link.id" class="prep-mini" type="button" :aria-pressed="linked?.id === item.link.id" @click="openCombo(comboTarget.pick, item.link)">{{ nameOf(item.partner.champion) }} · {{ roleLabel(item.partner.pick) }}</button></div>
            <div class="prep-selection-actions"><template v-if="linked"><span v-if="comboReady" class="text-amber-200 text-xs">✓ Duo dans la compo</span><button v-else type="button" class="btn-action" @click="applyCombo">Appliquer le duo</button><button type="button" class="prep-mini prep-danger" aria-label="Supprimer ce combo" @click="removeCombo">Supprimer</button></template><template v-else-if="comboPartner"><button v-if="defaultDupe" type="button" class="prep-btn" @click="openCombo(comboTarget.pick, defaultDupe)">Voir ce duo déjà préparé</button><button v-else type="button" class="btn-action" @click="saveCombo(comboPartner)">Lier avec {{ nameOf(comboPartner) }}</button></template></div>
          </template>
          <template v-else>
            <p class="prep-eyebrow">{{ isPick ? `${roleLabel(selectedPick)} · ${label(selected.step)}` : label(selected.step) }}</p><h2>{{ selectedChampion ? `Remplacer ${nameOf(selectedChampion)}` : selectedChoices.length ? 'Ajouter une alternative' : 'Choisir un champion' }}</h2><p class="prep-picker-help">Choisis un champion ou une option déjà préparée.</p>
            <div class="prep-option-strip"><span v-for="(id, n) in selectedChoices" :key="id" class="prep-selected-option"><button type="button" :class="{ 'prep-choice-active': selected.option === n }" :aria-label="`Sélectionner ${nameOf(id)}, ${n ? 'alternative ' + n : 'choix principal'}`" :data-drag-champ="id" :data-drag-from="String(selected.step)" @click="select(selected.step, n)"><PrepArt :id="id" :name="nameOf(id)" :fallback="iconUrl(id)" /></button><small>{{ n ? `A${n}` : '1er' }}</small><button type="button" class="prep-option-remove" :aria-label="`Retirer ${nameOf(id)}`" @click="removeOption(n)">×</button></span><button v-if="selectedChoices.length < MAX_PREP_OPTIONS" class="prep-option-add" type="button" aria-label="Ajouter une option" @click="select(selected.step)">+</button></div>
            <div class="prep-selection-actions"><button v-if="selected.option !== null && selected.option > 0 && selectedChampion" type="button" class="prep-mini" @click="promote">↑ Choix principal</button><span v-else class="prep-picker-help">1er = principal · A = alternative</span><button v-if="selected.option !== null && selectedChampion" type="button" class="prep-mini" @click="removeOption(selected.option)">Retirer</button></div>
          </template>
        </div>
        <div class="prep-picker-browser"><label class="prep-search"><span class="sr-only">Rechercher un champion à ajouter</span><input v-model="search" type="search" placeholder="Chercher un champion…" @keydown.enter.prevent="filteredChampions.find(c => !disabled(c.id)) && chooseChampion(filteredChampions.find(c => !disabled(c.id))!.id)"></label><div class="prep-role-filters" role="group" aria-label="Filtrer les champions par rôle"><button type="button" :aria-pressed="!roleFilter" @click="roleFilter = ''">Tous</button><button v-for="r in ROLES" :key="r" type="button" :aria-pressed="roleFilter === r" @click="roleFilter = r">{{ PREP_ROLE_LABEL[r] }}</button></div><div class="prep-champion-grid"><button v-for="c in filteredChampions" :key="c.id" class="prep-champion" type="button" :disabled="disabled(c.id)" :aria-label="`${mode === 'combo' ? 'Lier avec' : 'Choisir'} ${c.name}`" :data-drag-champ="!disabled(c.id) ? c.id : undefined" @click="chooseChampion(c.id)"><PrepArt :id="c.id" :name="c.name" :fallback="iconUrl(c.id)" /><span>{{ c.name }}</span></button><p v-if="!filteredChampions.length" class="prep-picker-help">Aucun résultat. Essaie un autre nom ou le filtre Tous.</p></div></div>
      </aside>
    </div>
    <footer class="prep-editor-status"><span>{{ filled }}/10 étapes · {{ alternatives }} alternatives · {{ scenario.combos.length }} combos</span><span role="status" aria-live="polite">{{ feedback }}</span></footer>
    <AppModal v-model="notesOpen" title="Notes de préparation"><label class="prep-form">Notes de la composition<textarea :value="scenario.notes" rows="7" maxlength="5000" placeholder="Adaptations, choix de repli, points à confirmer avec l’équipe…" @input="emit('update', { notes: ($event.target as HTMLTextAreaElement).value })" /></label><button class="btn-action self-end" type="button" @click="notesOpen = false">Terminer</button></AppModal>
  </div>
</template>
