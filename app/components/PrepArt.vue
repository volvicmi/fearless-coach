<script setup lang="ts">
const props = defineProps<{ id?: string | null, name: string, fallback?: string, eager?: boolean }>()
const failed = ref(false)
watch(() => props.id, () => { failed.value = false })
const src = computed(() => failed.value ? props.fallback : `https://ddragon.leagueoflegends.com/cdn/img/champion/loading/${encodeURIComponent(props.id ?? '')}_0.jpg`)
</script>

<template>
  <span class="prep-art">
    <img v-if="id && src" :src="src" :alt="name" :loading="eager ? 'eager' : 'lazy'" draggable="false" @error="failed = true">
    <span v-else aria-hidden="true">+</span>
  </span>
</template>
