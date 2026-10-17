<script setup lang="ts">
import { NO_BAN, slotsOf } from '#shared/draft'
import type { DraftStep, Side } from '#shared/draft'

const props = defineProps<{
  side: Side
  isUs: boolean
  actions: string[]
  current?: DraftStep
  iconUrl: (id: string) => string
  nameOf: (id: string) => string
}>()

const bans = computed(() => slotsOf(props.actions, props.side, 'ban'))
const picks = computed(() => slotsOf(props.actions, props.side, 'pick'))
const isCurrent = (type: 'ban' | 'pick', slot: number) =>
  props.current?.side === props.side && props.current.type === type && props.current.slot === slot
const accent = computed(() => (props.side === 'blue' ? 'text-side-blue' : 'text-side-red'))
const ring = computed(() => (props.side === 'blue' ? 'ring-side-blue' : 'ring-side-red'))
</script>

<template>
  <section class="flex flex-col gap-3">
    <h3 class="text-sm font-semibold uppercase tracking-wider" :class="accent">
      {{ side }} side <span class="text-zinc-400 normal-case">· {{ isUs ? 'Us' : 'Them' }}</span>
    </h3>

    <div class="flex gap-1">
      <div
        v-for="(b, i) in bans"
        :key="i"
        class="flex size-9 items-center justify-center overflow-hidden rounded bg-zinc-900 text-[10px] text-zinc-500"
        :class="isCurrent('ban', i) && ['ring-2', ring, 'animate-pulse']"
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
        class="flex h-14 items-center gap-3 rounded-md bg-zinc-900 px-2"
        :class="isCurrent('pick', i) && ['ring-2', ring]"
      >
        <img v-if="p" :src="iconUrl(p)" :alt="nameOf(p)" class="size-11 rounded">
        <div v-else class="size-11 rounded bg-zinc-800" />
        <span class="text-sm" :class="p ? 'text-zinc-100' : 'text-zinc-500'">
          {{ p ? nameOf(p) : `Pick ${i + 1}` }}
        </span>
      </li>
    </ol>
  </section>
</template>
