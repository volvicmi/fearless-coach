<script setup lang="ts">
import { NO_BAN, slotsOf } from '#shared/draft'
import type { DraftStep, Side } from '#shared/draft'

const props = defineProps<{
  side: Side
  isUs: boolean
  /** Remplace « Nous » / « Eux » (par exemple le nom d'un joueur en duel) */
  label?: string
  actions: string[]
  current?: DraftStep
  iconUrl: (id: string) => string
  nameOf: (id: string) => string
}>()

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
        <img v-if="p" :src="iconUrl(p)" :alt="nameOf(p)" class="size-11">
        <div v-else class="size-11" :class="isCurrent('pick', i) ? 'bg-amber-400/30' : 'bg-zinc-800'" />
        <span class="font-display text-[15px] font-semibold uppercase tracking-wide" :class="p ? 'text-zinc-100' : 'text-zinc-600'">
          {{ p ? nameOf(p) : `Pick ${i + 1}` }}
        </span>
      </li>
    </ol>
  </section>
</template>
