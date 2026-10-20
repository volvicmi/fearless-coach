<script setup lang="ts">
import { WEEKDAYS_FR, addDays, availabilityOn, fromIsoDate, mondayOf, summarizeDay, toIsoDate } from '#shared/planning'
import type { PlanningPlayer, PlanningWeek } from '#shared/planning'

const route = useRoute()
const week = computed(() => (typeof route.query.week === 'string' ? route.query.week : mondayOf(new Date())))
const { data, refresh } = await useFetch<PlanningWeek>('/api/planning', { query: { week } })

interface Settings { defaultTime: string, publicUrl: string, hasWebhook: boolean, reminderDay: string, reminderHour: number, lastReminder: string }
const { data: settings, refresh: refreshSettings } = await useFetch<Settings>('/api/planning/settings')

const today = toIsoDate(new Date())
const goWeek = (offset: number) => navigateTo({ query: { week: addDays(week.value, offset * 7) } })
const label = (iso: string) => fromIsoDate(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
const summaries = computed(() => (data.value ? data.value.days.map(d => summarizeDay(data.value!.players, d)) : []))
const starters = computed(() => data.value?.players.filter(p => p.status === 'starter').length ?? 0)

// ---------- one cell: availability on a date ----------
const editing = ref<{ playerId: number, date: string } | null>(null)
const editTime = ref('21:00')

function openCell(p: PlanningPlayer, date: string) {
  if (editing.value?.playerId === p.id && editing.value.date === date) {
    editing.value = null
    return
  }
  editing.value = { playerId: p.id, date }
  editTime.value = availabilityOn(p, date).start ?? data.value!.defaultTime
}

async function setDay(available: boolean | null) {
  const e = editing.value!
  await $fetch(`/api/planning/days/${e.playerId}`, { method: 'PUT', body: { date: e.date, available, start: editTime.value } })
  editing.value = null
  await refresh()
}

// ---------- habits: usual days ----------
async function toggleHabit(p: PlanningPlayer, weekday: number) {
  const start = p.habits[weekday] ? null : data.value!.defaultTime
  await $fetch(`/api/planning/habits/${p.id}`, { method: 'PUT', body: { weekday, start } })
  await refresh()
}

async function setHabitTime(p: PlanningPlayer, weekday: number, start: string) {
  if (!start) return
  await $fetch(`/api/planning/habits/${p.id}`, { method: 'PUT', body: { weekday, start } })
  await refresh()
}

// ---------- settings + Discord ----------
const webhook = ref('')
const notice = ref('')
const preview = ref('')

async function saveSettings(body: Record<string, unknown>) {
  notice.value = ''
  try {
    await $fetch('/api/planning/settings', { method: 'PUT', body })
    await Promise.all([refreshSettings(), refresh()])
    if ('webhook' in body) webhook.value = ''
  }
  catch (e: any) {
    notice.value = e?.data?.statusMessage ?? 'Échec de l’enregistrement'
  }
}

async function showPreview() {
  preview.value = (await $fetch<{ message: string }>('/api/planning/preview')).message
}

async function sendNow() {
  if (!(await askConfirm('Publier maintenant le résumé de la semaine sur ton salon Discord ?', { confirmLabel: 'Publier' }))) return
  notice.value = ''
  try {
    await $fetch('/api/planning/remind', { method: 'POST', body: {} })
    notice.value = 'Envoyé sur Discord ✓'
  }
  catch (e: any) {
    notice.value = e?.data?.statusMessage ?? 'Échec de l’envoi'
  }
}

// Fenêtres secondaires : la page principale ne montre que la semaine
const habitsOpen = ref(false)
const settingsOpen = ref(false)

const ROLE_SHORT: Record<string, string> = { top: 'TOP', jungle: 'JGL', mid: 'MID', adc: 'ADC', support: 'SUP' }
</script>

<template>
  <div v-if="data" class="flex flex-col gap-5" @keydown.esc="editing = null">
    <!-- En-tête : titre, semaine, accès aux réglages -->
    <div class="flex flex-wrap items-end gap-4">
      <div>
        <h1 class="text-3xl font-bold">
          Planning
        </h1>
        <p class="text-sm text-zinc-400">
          Clique sur une case pour noter une dispo ou une absence ce jour-là.
        </p>
      </div>
      <div class="ml-auto flex flex-wrap items-center gap-2">
        <div class="flex items-center bg-zinc-900">
          <button type="button" class="px-3 py-2 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100" aria-label="Semaine précédente" @click="goWeek(-1)">
            ←
          </button>
          <span class="w-40 text-center font-display text-sm font-semibold uppercase tracking-wider">Semaine du {{ label(data.week) }}</span>
          <button type="button" class="px-3 py-2 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100" aria-label="Semaine suivante" @click="goWeek(1)">
            →
          </button>
        </div>
        <button
          v-if="data.week !== mondayOf(new Date())"
          type="button"
          class="px-2 py-2 text-xs text-zinc-400 hover:text-zinc-100"
          @click="navigateTo({ query: {} })"
        >
          Cette semaine
        </button>
        <button v-if="data.players.length" type="button" class="btn-action text-sm" @click="habitsOpen = true">
          Jours habituels
        </button>
        <button type="button" class="bg-zinc-800 px-4 py-2 font-display text-sm font-semibold uppercase tracking-wider transition-colors hover:bg-zinc-700" @click="settingsOpen = true">
          Réglages &amp; Discord
        </button>
      </div>
    </div>

    <p v-if="!data.players.length" class="text-sm text-zinc-500">
      Ajoute d’abord tes joueurs dans l’onglet <NuxtLink to="/team" class="text-amber-300 underline">Équipe</NuxtLink>.
    </p>

    <!-- Semaine : en tête de colonne, l'état du cinq de départ ; dessous, une ligne par joueur -->
    <div v-else class="overflow-x-auto">
      <table class="w-full min-w-[820px] table-fixed border-separate border-spacing-1.5 text-sm">
        <thead>
          <tr>
            <th class="w-44" />
            <th v-for="(s, i) in summaries" :key="s.date" class="align-top font-normal">
              <div
                class="flex flex-col items-center gap-0.5 px-1 py-2.5 text-center"
                :class="s.fullRoster ? 'bg-emerald-500/15' : s.available.length >= starters - 1 && starters ? 'bg-amber-400/10' : 'bg-zinc-900'"
                :title="s.missing.length ? `Manquants : ${s.missing.map(p => p.name).join(', ')}` : 'Tout le monde est dispo'"
              >
                <span class="font-display text-xs font-semibold uppercase tracking-wider" :class="s.date === today ? 'text-amber-300' : 'text-zinc-400'">
                  {{ WEEKDAYS_FR[i] }} {{ label(s.date) }}
                </span>
                <span
                  class="font-display text-2xl font-bold leading-tight tabular-nums"
                  :class="s.fullRoster ? 'text-emerald-300' : s.available.length >= starters - 1 && starters ? 'text-amber-200' : 'text-zinc-500'"
                >{{ s.available.length }}/{{ starters }}</span>
                <span class="h-4 max-w-full truncate text-[11px]" :class="s.fullRoster ? 'text-emerald-300/80' : 'text-zinc-500'">
                  <template v-if="s.fullRoster && s.commonStart">Scrim dès {{ s.commonStart }}</template>
                  <template v-else-if="s.missing.length">Manque {{ s.missing.map(p => p.name).join(', ') }}</template>
                </span>
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in data.players" :key="p.id">
            <td class="pr-2">
              <span class="flex items-center gap-2">
                <span class="w-8 font-display text-[11px] font-bold tracking-wider text-zinc-500">{{ ROLE_SHORT[p.role] }}</span>
                <span class="truncate font-medium">{{ p.name }}</span>
                <span v-if="p.status === 'sub'" class="bg-zinc-800 px-1 text-[10px] uppercase text-zinc-400">remp.</span>
              </span>
            </td>
            <td v-for="d in data.days" :key="d" class="relative">
              <button
                type="button"
                class="flex h-11 w-full items-center justify-center gap-1.5 text-xs font-medium transition-colors"
                :class="editing?.playerId === p.id && editing.date === d
                  ? 'tab-on'
                  : availabilityOn(p, d).available === true ? 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25' : availabilityOn(p, d).available === false ? 'bg-red-500/10 text-red-300 hover:bg-red-500/20' : 'bg-zinc-900 text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300'"
                :title="availabilityOn(p, d).source === 'habit' ? 'Jour habituel' : availabilityOn(p, d).source === 'exception' ? 'Exception pour cette date' : 'Pas d’info'"
                @click="openCell(p, d)"
              >
                <template v-if="availabilityOn(p, d).available === true">✓ {{ availabilityOn(p, d).start }}</template>
                <template v-else-if="availabilityOn(p, d).available === false">✗ Absent</template>
                <template v-else>–</template>
                <span v-if="availabilityOn(p, d).source === 'exception'" class="size-1.5 rounded-full bg-amber-400" title="Exception pour cette date" />
              </button>

              <!-- Éditeur d'une case -->
              <div
                v-if="editing?.playerId === p.id && editing.date === d"
                class="absolute left-1/2 top-12 z-20 flex w-52 -translate-x-1/2 flex-col gap-2 bg-zinc-800 p-3 shadow-xl shadow-black/50"
              >
                <div class="flex items-center gap-2">
                  <input v-model="editTime" type="time" class="flex-1 bg-zinc-900 px-2 py-1 text-xs">
                  <button type="button" class="bg-emerald-600 px-2.5 py-1 text-xs font-semibold transition-colors hover:bg-emerald-500" @click="setDay(true)">
                    ✓ Dispo
                  </button>
                </div>
                <button type="button" class="bg-red-600/80 px-2.5 py-1 text-xs font-semibold transition-colors hover:bg-red-500" @click="setDay(false)">
                  ✗ Pas dispo
                </button>
                <button
                  v-if="availabilityOn(p, d).source === 'exception'"
                  type="button"
                  class="px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100"
                  @click="setDay(null)"
                >
                  ↺ Comme d’habitude
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <p class="mt-2 flex flex-wrap gap-4 text-[11px] text-zinc-500">
        <span><span class="text-emerald-300">✓</span> dispo (heure de début)</span>
        <span><span class="text-red-300">✗</span> absent</span>
        <span>– pas d’info</span>
        <span class="flex items-center gap-1.5"><span class="size-1.5 rounded-full bg-amber-400" /> exception pour cette date</span>
      </p>
    </div>

    <!-- Jours habituels (fenêtre) -->
    <AppModal v-model="habitsOpen" title="Jours habituels" wide>
      <p class="-mt-2 text-sm text-zinc-400">
        Répétés chaque semaine. Clique sur un jour pour l’activer, puis ajuste l’heure. Une exception notée dans la semaine passe devant.
      </p>
      <div class="flex flex-col gap-1.5">
        <div class="grid grid-cols-[10rem_repeat(7,minmax(0,1fr))] gap-1.5 px-3 font-display text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          <span />
          <span v-for="day in WEEKDAYS_FR" :key="day" class="text-center">{{ day }}</span>
        </div>
        <div v-for="p in data.players" :key="p.id" class="grid grid-cols-[10rem_repeat(7,minmax(0,1fr))] items-start gap-1.5 bg-zinc-950/60 px-3 py-2.5">
          <span class="flex h-8 items-center gap-2 truncate text-sm">
            <span class="w-8 font-display text-[11px] font-bold tracking-wider text-zinc-500">{{ ROLE_SHORT[p.role] }}</span>{{ p.name }}
          </span>
          <div v-for="(day, i) in WEEKDAYS_FR" :key="day" class="flex flex-col items-center gap-1">
            <button
              type="button"
              class="h-8 w-full text-xs font-medium transition-colors"
              :class="p.habits[i] ? 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30' : 'bg-zinc-800 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-200'"
              :aria-pressed="!!p.habits[i]"
              @click="toggleHabit(p, i)"
            >
              {{ p.habits[i] ? '✓' : day }}
            </button>
            <input
              v-if="p.habits[i]"
              :value="p.habits[i]"
              type="time"
              class="w-full bg-transparent text-center text-[11px] text-zinc-400"
              @change="setHabitTime(p, i, ($event.target as HTMLInputElement).value)"
            >
          </div>
        </div>
      </div>
    </AppModal>

    <!-- Réglages + Discord (fenêtre) -->
    <AppModal v-if="settings" v-model="settingsOpen" title="Réglages & Discord">
      <div class="flex flex-col gap-3">
        <h3 class="font-display text-sm font-bold uppercase tracking-wider text-zinc-400">
          Réglages
        </h3>
        <label class="flex items-center gap-3 text-sm">
          <span class="w-40 text-zinc-400">Heure par défaut</span>
          <input
            :value="settings.defaultTime"
            type="time"
            class="bg-zinc-800 px-2 py-1.5"
            @change="saveSettings({ defaultTime: ($event.target as HTMLInputElement).value })"
          >
        </label>
        <label class="flex items-center gap-3 text-sm">
          <span class="w-40 shrink-0 text-zinc-400">Lien dans le message</span>
          <input
            :value="settings.publicUrl"
            placeholder="Où les joueurs remplissent leurs dispos (optionnel)"
            class="min-w-0 flex-1 bg-zinc-800 px-2 py-1.5"
            @change="saveSettings({ publicUrl: ($event.target as HTMLInputElement).value })"
          >
        </label>
      </div>

      <div class="flex flex-col gap-3">
        <h3 class="font-display text-sm font-bold uppercase tracking-wider text-zinc-400">
          Rappel Discord
        </h3>
        <form class="flex items-center gap-2 text-sm" @submit.prevent="saveSettings({ webhook })">
          <input
            v-model="webhook"
            type="password"
            autocomplete="off"
            :placeholder="settings.hasWebhook ? 'Webhook configuré ✓ (colles-en un nouveau pour le remplacer)' : 'URL du webhook Discord'"
            class="min-w-0 flex-1 bg-zinc-800 px-2 py-1.5"
          >
          <button class="bg-zinc-800 px-3 py-1.5 font-display text-xs font-semibold uppercase tracking-wider transition-colors hover:bg-zinc-700">
            Enregistrer
          </button>
          <button v-if="settings.hasWebhook" type="button" class="text-xs text-zinc-500 hover:text-red-400" @click="saveSettings({ webhook: '' })">
            Retirer
          </button>
        </form>
        <div class="flex flex-wrap items-center gap-2 text-sm">
          <span class="text-zinc-400">Publier le résumé de la semaine chaque</span>
          <select
            :value="settings.reminderDay"
            class="bg-zinc-800 px-2 py-1.5"
            @change="saveSettings({ reminderDay: ($event.target as HTMLSelectElement).value })"
          >
            <option value="off">
              — désactivé —
            </option>
            <option value="sunday">
              dimanche (semaine suivante)
            </option>
            <option value="monday">
              lundi (semaine en cours)
            </option>
          </select>
          <span class="text-zinc-400">à</span>
          <select
            :value="settings.reminderHour"
            class="bg-zinc-800 px-2 py-1.5"
            @change="saveSettings({ reminderHour: Number(($event.target as HTMLSelectElement).value) })"
          >
            <option v-for="h in 24" :key="h" :value="h - 1">
              {{ String(h - 1).padStart(2, '0') }}:00
            </option>
          </select>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <button type="button" class="bg-zinc-800 px-3 py-1.5 font-display text-xs font-semibold uppercase tracking-wider transition-colors hover:bg-zinc-700" @click="showPreview">
            Aperçu du message
          </button>
          <button
            type="button"
            class="btn-action text-xs disabled:cursor-not-allowed disabled:opacity-40"
            :disabled="!settings.hasWebhook"
            @click="sendNow"
          >
            Envoyer maintenant
          </button>
          <span v-if="notice" class="text-xs text-amber-300">{{ notice }}</span>
        </div>
        <p class="text-[11px] text-zinc-500">
          Envoyé automatiquement tant que l’app tourne.<template v-if="settings.lastReminder"> Dernier rappel automatique : semaine du {{ label(settings.lastReminder) }}.</template>
        </p>
        <pre v-if="preview" class="whitespace-pre-wrap bg-zinc-950 p-3 text-xs text-zinc-300">{{ preview }}</pre>
      </div>
    </AppModal>
  </div>
</template>
