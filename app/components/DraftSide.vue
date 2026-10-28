<script setup lang="ts">
import { NO_BAN, slotsOf } from '#shared/draft'
import type { DraftStep, Side } from '#shared/draft'
import { PREP_ROLE_LABEL } from '#shared/prep'
import { ROLES } from '#shared/types'
import type { Role } from '#shared/types'

const props = defineProps<{
  side: Side
  isUs: boolean
  /** Remplace « Nous » / « Eux » (par exemple le nom d'un joueur en duel) */
  label?: string
  actions: string[]
  current?: DraftStep
  iconUrl: (id: string) => string
  nameOf: (id: string) => string
  /** Mode équipe : rôle de chaque pick (fixé à la main ou deviné), modifiable */
  roles?: Map<string, Role>
  forcedRoles?: Record<string, Role>
}>()
const emit = defineEmits<{ role: [champ: string, role: Role | null] }>()

const bans = computed(() => slotsOf(props.actions, props.side, 'ban'))
const picks = computed(() => slotsOf(props.actions, props.side, 'pick'))
const isCurrent = (type: 'ban' | 'pick', slot: number) =>
  props.current?.side === props.side && props.current.type === type && props.current.slot === slot
// Bandeau plein du côté (charte Régie) ; le côté rouge est en miroir
const band = computed(() => (props.side === 'blue' ? 'cut bg-side-blue' : 'cut-l bg-side-red justify-end'))
const mirror = computed(() => (props.side === 'red' ? 'flex-row-reverse text-right' : ''))
// Étape en cours : aplat violet léger, comme les éléments actifs
const nowMark = 'tab-on'
</script>

<template>
  <section class="flex flex-col gap-3">
    <h3 class="flex gap-1.5 px-3 py-1.5 font-display text-sm font-bold uppercase tracking-[0.12em] text-white" :class="band">
      Côté {{ side === 'blue' ? 'bleu' : 'rouge' }} <span class="font-semibold text-white/75">· {{ label ?? (isUs ? 'Nous' : 'Eux') }}</span>
    </h3>

    <div class="flex gap-1" :class="side === 'red' && 'flex-row-reverse'">
      <div
        v-for="(b, i) in bans"
        :key="i"
        class="flex size-9 items-center justify-center overflow-hidden bg-zinc-900 font-display text-[11px] font-semibold text-zinc-500"
        :class="isCurrent('ban', i) && 'animate-pulse bg-amber-400/25 text-amber-200'"
        :title="b && b !== NO_BAN ? nameOf(b) : undefined"
      >
        <img v-if="b && b !== NO_BAN" :src="iconUrl(b)" :alt="nameOf(b)" class="size-full grayscale">
        <span v-else-if="b === NO_BAN">—</span>
        <span v-else>B{{ i + 1 }}</span>
      </div>
    </div>

    <ol class="flex flex-col gap-1.5">
      <li
        v-for="(p, i) in picks"
        :key="i"
        class="flex h-14 items-center gap-3 px-2"
        :class="[mirror, isCurrent('pick', i) ? nowMark : 'bg-zinc-900']"
      >
        <img v-if="p && p !== NO_BAN" :src="iconUrl(p)" :alt="nameOf(p)" class="size-11 shrink-0">
        <div v-else class="flex size-11 shrink-0 items-center justify-center text-zinc-500" :class="isCurrent('pick', i) ? 'bg-amber-400/30' : 'bg-zinc-800'">
          <span v-if="p === NO_BAN">—</span>
        </div>
        <span class="min-w-0 truncate font-display text-[15px] font-semibold uppercase tracking-wide" :class="p && p !== NO_BAN ? 'text-zinc-100' : 'text-zinc-600'">
          {{ p === NO_BAN ? 'Passé' : p ? nameOf(p) : `Pick ${i + 1}` }}
        </span>
        <!-- Rôle adverse : deviné en gris, fixé à la main en blanc ; le coach s'en sert -->
        <label v-if="p && p !== NO_BAN && roles" class="shrink-0" :class="side === 'red' ? 'mr-auto' : 'ml-auto'">
          <span class="sr-only">Rôle de {{ nameOf(p) }}</span>
          <select
            :value="forcedRoles?.[p] ?? ''"
            class="w-24 cursor-pointer bg-zinc-800 px-1.5 py-1 text-xs"
            :class="forcedRoles?.[p] ? 'text-zinc-100' : 'text-zinc-500'"
            :title="forcedRoles?.[p] ? 'Rôle fixé à la main' : 'Rôle deviné : choisis-le si le coach se trompe'"
            @change="emit('role', p, (($event.target as HTMLSelectElement).value || null) as Role | null)"
          >
            <option value="">{{ roles.get(p) ? `${PREP_ROLE_LABEL[roles.get(p)!]} ?` : 'Rôle ?' }}</option>
            <option v-for="r in ROLES" :key="r" :value="r">{{ PREP_ROLE_LABEL[r] }}</option>
          </select>
        </label>
      </li>
    </ol>
  </section>
</template>
