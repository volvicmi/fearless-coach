<script setup lang="ts">
const { data: me } = await useFetch<{ enabled: boolean, loggedIn: boolean }>('/api/auth/me', { key: 'me' })
// Déjà connecté (ou protection non configurée en local) : rien à faire ici.
if (!me.value?.enabled || me.value.loggedIn) await navigateTo('/', { replace: true })

const password = ref('')
const error = ref('')
const loading = ref(false)

async function submit() {
  loading.value = true
  error.value = ''
  try {
    await $fetch('/api/auth/login', { method: 'POST', body: { password: password.value } })
    // Rechargement complet : le serveur rend alors la page avec la session.
    await navigateTo('/', { external: true })
  }
  catch (e: any) {
    error.value = e?.data?.statusMessage ?? 'Connexion impossible'
    loading.value = false
  }
}
</script>

<template>
  <form class="mx-auto flex max-w-sm flex-col items-center gap-4 px-6 py-24 text-center" @submit.prevent="submit">
    <h1 class="font-display text-3xl font-extrabold uppercase tracking-wider">
      Fearless Coach
    </h1>
    <p class="text-sm text-zinc-400">
      Outil privé de l’équipe. Entre le mot de passe pour continuer.
    </p>
    <input
      v-model="password"
      type="password"
      autocomplete="current-password"
      placeholder="Mot de passe"
      class="w-full bg-zinc-900 px-4 py-2.5 text-sm outline-none focus:shadow-[inset_0_-2px_0_var(--color-amber-400)]"
      autofocus
    >
    <p v-if="error" class="w-full bg-zinc-900 px-4 py-2 text-sm text-red-400">
      {{ error }}
    </p>
    <button type="submit" class="btn-action w-full cursor-pointer px-6 py-2.5 font-display text-sm font-bold uppercase tracking-wider disabled:opacity-50" :disabled="loading || !password">
      Entrer
    </button>
  </form>
</template>
