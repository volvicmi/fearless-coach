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
  if (!confirm('Publier maintenant le résumé de la semaine sur ton salon Discord ?')) return
  notice.value = ''
  try {
    await $fetch('/api/planning/remind', { method: 'POST', body: {} })
    notice.value = 'Envoyé sur Discord ✓'
  }
  catch (e: any) {
    notice.value = e?.data?.statusMessage ?? 'Échec de l’envoi'
  }
}

const ROLE_SHORT: Record<string, string> = { top: 'TOP', jungle: 'JGL', mid: 'MID', adc: 'ADC', support: 'SUP' }
</script>

<template>
  <div v-if="data" class="flex flex-col gap-6" @keydown.esc="editing = null">
    <div class="flex flex-wrap items-end gap-4">
      <div>
        <h1 class="text-xl font-semibold">
          Planning
        </h1>
        <p class="text-sm text-zinc-400">
          Renseigne une fois ci-dessous les jours habituels de chaque joueur, puis clique sur un jour pour noter une exception.
        </p>
      </div>
      <div class="ml-auto flex items-center gap-2">
        <button type="button" class="cursor-pointer rounded-md border border-zinc-700 px-2.5 py-1 text-sm hover:bg-zinc-800" @click="goWeek(-1)">
          ←
        </button>
        <span class="w-44 text-center text-sm font-medium">Semaine du {{ label(data.week) }}</span>
        <button type="button" class="cursor-pointer rounded-md border border-zinc-700 px-2.5 py-1 text-sm hover:bg-zinc-800" @click="goWeek(1)">
          →
        </button>
        <button
          v-if="data.week !== mondayOf(new Date())"
          type="button"
          class="cursor-pointer px-2 text-xs text-zinc-400 hover:text-zinc-100"
          @click="navigateTo({ query: {} })"
        >
          Cette semaine
        </button>
      </div>
    </div>

    <p v-if="!data.players.length" class="text-sm text-zinc-500">
      Ajoute d’abord tes joueurs dans l’onglet <NuxtLink to="/team" class="text-amber-300 underline">Équipe</NuxtLink>.
    </p>

    <!-- Week grid -->
    <div v-else class="overflow-x-auto">
      <table class="w-full min-w-[760px] table-fixed border-separate border-spacing-1 text-sm">
        <thead>
          <tr>
            <th class="w-44" />
            <th
              v-for="(d, i) in data.days"
              :key="d"
              class="rounded-md py-1.5 text-center text-xs font-medium"
              :class="d === today ? 'bg-amber-400/15 text-amber-300' : 'text-zinc-400'"
            >
              {{ WEEKDAYS_FR[i] }} <span class="text-zinc-500">{{ label(d) }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in data.players" :key="p.id">
            <td class="pr-2">
              <span class="flex items-center gap-2">
                <span class="w-7 text-[10px] font-bold text-zinc-500">{{ ROLE_SHORT[p.role] }}</span>
                <span class="truncate">{{ p.name }}</span>
                <span v-if="p.status === 'sub'" class="rounded bg-zinc-800 px-1 text-[10px] uppercase text-zinc-400">remp.</span>
              </span>
            </td>
            <td v-for="d in data.days" :key="d" class="relative">
              <button
                type="button"
                class="flex h-10 w-full cursor-pointer items-center justify-center gap-1 rounded-md border text-xs transition-colors"
                :class="[
                  availabilityOn(p, d).available === true ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                  : availabilityOn(p, d).available === false ? 'border-red-500/40 bg-red-500/10 text-red-300'
                    : 'border-zinc-800 bg-zinc-900/40 text-zinc-600 hover:text-zinc-300',
                  editing?.playerId === p.id && editing.date === d && 'ring-2 ring-amber-400',
                ]"
                :title="availabilityOn(p, d).source === 'habit' ? 'Jour habituel' : availabilityOn(p, d).source === 'exception' ? 'Exception pour cette date' : 'Pas d’info'"
                @click="openCell(p, d)"
              >
                <template v-if="availabilityOn(p, d).available === true">✓ {{ availabilityOn(p, d).start }}</template>
                <template v-else-if="availabilityOn(p, d).available === false">✗</template>
                <template v-else>?</template>
                <span v-if="availabilityOn(p, d).source === 'exception'" class="size-1.5 rounded-full bg-amber-400" />
              </button>

              <!-- Cell editor -->
              <div
                v-if="editing?.playerId === p.id && editing.date === d"
                class="absolute left-1/2 top-11 z-20 flex w-48 -translate-x-1/2 flex-col gap-2 rounded-lg border border-zinc-700 bg-zinc-900 p-2 shadow-xl"
              >
                <div class="flex items-center gap-2">
                  <input v-model="editTime" type="time" class="flex-1 rounded border border-zinc-700 bg-zinc-950 px-1.5 py-0.5 text-xs">
                  <button type="button" class="cursor-pointer rounded bg-emerald-600 px-2 py-1 text-xs font-semibold hover:bg-emerald-500" @click="setDay(true)">
                    ✓ Dispo
                  </button>
                </div>
                <button type="button" class="cursor-pointer rounded bg-red-600/80 px-2 py-1 text-xs font-semibold hover:bg-red-500" @click="setDay(false)">
                  ✗ Pas dispo
                </button>
                <button
                  v-if="availabilityOn(p, d).source === 'exception'"
                  type="button"
                  class="cursor-pointer rounded px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                  @click="setDay(null)"
                >
                  ↺ Comme d’habitude
                </button>
              </div>
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td class="pr-2 pt-2 text-xs text-zinc-500">
              Cinq de départ
            </td>
            <td v-for="s in summaries" :key="s.date" class="pt-2">
              <div
                class="flex flex-col items-center rounded-md px-1 py-1.5 text-center text-xs"
                :class="s.fullRoster ? 'bg-emerald-500/20 text-emerald-300' : s.available.length >= starters - 1 && starters ? 'bg-amber-400/10 text-amber-300' : 'bg-zinc-900/60 text-zinc-500'"
                :title="s.missing.length ? `Manquants : ${s.missing.map(p => p.name).join(', ')}` : 'Tout le monde est dispo'"
              >
                <span class="font-semibold">{{ s.available.length }}/{{ starters }}</span>
                <span v-if="s.fullRoster && s.commonStart" class="text-[10px]">dès {{ s.commonStart }}</span>
                <span v-else-if="s.missing.length" class="max-w-full truncate text-[10px]">− {{ s.missing.map(p => p.name).join(', ') }}</span>
              </div>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>

    <!-- Usual days -->
    <section v-if="data.players.length" class="flex flex-col gap-2">
      <h2 class="font-semibold">
        Jours habituels <span class="text-sm font-normal text-zinc-500">· répétés chaque semaine, les exceptions ci-dessus priment</span>
      </h2>
      <div class="flex flex-col gap-1.5">
        <div v-for="p in data.players" :key="p.id" class="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-800 px-3 py-2">
          <span class="w-40 truncate text-sm">{{ p.name }}</span>
          <div v-for="(day, i) in WEEKDAYS_FR" :key="day" class="flex flex-col items-center gap-1">
            <button
              type="button"
              class="w-14 cursor-pointer rounded-md border py-1 text-xs"
              :class="p.habits[i] ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300' : 'border-zinc-800 text-zinc-500 hover:text-zinc-200'"
              @click="toggleHabit(p, i)"
            >
              {{ day }}
            </button>
            <input
              v-if="p.habits[i]"
              :value="p.habits[i]"
              type="time"
              class="w-14 rounded border border-zinc-800 bg-transparent px-0.5 text-center text-[10px] text-zinc-400"
              @change="setHabitTime(p, i, ($event.target as HTMLInputElement).value)"
            >
          </div>
        </div>
      </div>
    </section>

    <!-- Settings + Discord -->
    <section v-if="settings" class="grid gap-4 rounded-xl border border-zinc-800 p-4 lg:grid-cols-2">
      <div class="flex flex-col gap-3">
        <h2 class="font-semibold">
          Réglages
        </h2>
        <label class="flex items-center gap-3 text-sm">
          <span class="w-40 text-zinc-400">Heure par défaut</span>
          <input
            :value="settings.defaultTime"
            type="time"
            class="rounded border border-zinc-700 bg-zinc-900 px-2 py-1"
            @change="saveSettings({ defaultTime: ($event.target as HTMLInputElement).value })"
          >
        </label>
        <label class="flex items-center gap-3 text-sm">
          <span class="w-40 text-zinc-400">Lien dans le message</span>
          <input
            :value="settings.publicUrl"
            placeholder="Où les joueurs remplissent leurs dispos (optionnel)"
            class="flex-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1"
            @change="saveSettings({ publicUrl: ($event.target as HTMLInputElement).value })"
          >
        </label>
      </div>

      <div class="flex flex-col gap-3">
        <h2 class="font-semibold">
          Rappel Discord
        </h2>
        <form class="flex items-center gap-2 text-sm" @submit.prevent="saveSettings({ webhook })">
          <input
            v-model="webhook"
            type="password"
            autocomplete="off"
            :placeholder="settings.hasWebhook ? 'Webhook configuré ✓ (colles-en un nouveau pour le remplacer)' : 'URL du webhook Discord'"
            class="flex-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1"
          >
          <button class="cursor-pointer rounded-md border border-zinc-700 px-3 py-1 text-xs hover:bg-zinc-800">
            Enregistrer
          </button>
          <button v-if="settings.hasWebhook" type="button" class="cursor-pointer text-xs text-zinc-500 hover:text-red-400" @click="saveSettings({ webhook: '' })">
            Retirer
          </button>
        </form>
        <div class="flex flex-wrap items-center gap-2 text-sm">
          <span class="text-zinc-400">Publier le résumé de la semaine chaque</span>
          <select
            :value="settings.reminderDay"
            class="rounded border border-zinc-700 bg-zinc-900 px-2 py-1"
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
            class="rounded border border-zinc-700 bg-zinc-900 px-2 py-1"
            @change="saveSettings({ reminderHour: Number(($event.target as HTMLSelectElement).value) })"
          >
            <option v-for="h in 24" :key="h" :value="h - 1">
              {{ String(h - 1).padStart(2, '0') }}:00
            </option>
          </select>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <button type="button" class="cursor-pointer rounded-md border border-zinc-700 px-3 py-1 text-xs hover:bg-zinc-800" @click="showPreview">
            Aperçu du message
          </button>
          <button
            type="button"
            class="cursor-pointer rounded-md bg-indigo-500 px-3 py-1 text-xs font-semibold hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
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
        <pre v-if="preview" class="whitespace-pre-wrap rounded-md bg-zinc-900 p-3 text-xs text-zinc-300">{{ preview }}</pre>
      </div>
    </section>
  </div>
</template>
