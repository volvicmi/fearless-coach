<script setup lang="ts">
/**
 * Synchro en direct avec drafter.lol : un favori à glisser dans la barre du navigateur.
 * Lancé dans l'onglet drafter.lol, il relit les cases de la draft toutes les 400 ms et envoie chaque changement
 * à notre serveur (route /api/sync/<jeton>), qui remplit la game du même numéro.
 */
const props = defineProps<{ seriesId: number }>()
const open = ref(false)
const token = ref('')
const error = ref('')

async function load(renew = false) {
  error.value = ''
  try { token.value = (await $fetch<{ token: string }>(`/api/series/${props.seriesId}/sync`, { query: renew ? { renew: 1 } : {} })).token }
  catch { error.value = 'Impossible de créer le lien de synchro.' }
}
async function toggle() {
  open.value = !open.value
  if (open.value && !token.value) await load()
}

// Lit les cases de drafter.lol : bans en icône /champions/<clé Riot>-128.webp, picks en splash /splashes/<nom>-1280.webp,
// « None » pour une étape passée. Bans rouges en miroir (R1 à droite).
const SCRIPT = `(()=>{if(window.__fcSync){alert('Sync Coach tourne déjà dans cet onglet');return}
const U=__URL__;let last='';
const key=el=>{for(const i of el.querySelectorAll('img')){let m=i.src.match(/champions\\/(\\d+)-/);if(m)return m[1];m=i.src.match(/splashes\\/([a-z0-9]+)-\\d+/i);if(m)return m[1]}return /^none$/i.test(el.innerText.trim())?'none':null};
const read=(sel,by,rev)=>[...document.querySelectorAll(sel)].map(el=>({el,r:el.getBoundingClientRect()})).sort((a,b)=>rev?b.r[by]-a.r[by]:a.r[by]-b.r[by]).map(x=>key(x.el));
const b=document.createElement('div');b.textContent='Sync Coach…';b.style.cssText='position:fixed;z-index:2147483647;left:8px;bottom:8px;background:#6d28d9;color:#fff;font:600 12px sans-serif;padding:5px 9px;border-radius:4px;pointer-events:none';document.body.appendChild(b);
const ok=t=>{b.style.background='#15803d';b.textContent=t};const ko=t=>{b.style.background='#b91c1c';b.textContent=t};
window.__fcSync=setInterval(()=>{const s={game:Number(new URLSearchParams(location.search).get('game')||1),blue:{bans:read('.blue-ban','left'),picks:read('.blue-pick','top')},red:{bans:read('.red-ban','left',true),picks:read('.red-pick','top')}};
const j=JSON.stringify(s);if(j===last)return;last=j;
fetch(U,{method:'POST',headers:{'Content-Type':'text/plain'},body:j}).then(r=>r.json().then(d=>r.ok?ok('Sync Coach ✓ G'+d.game+' · '+d.steps+'/20'):(ko('Sync Coach : '+(d.statusMessage||d.message||r.status)),last=''))).catch(()=>{ko('Sync Coach : hors ligne');last=''})},400)})()`

const bookmarklet = computed(() => {
  if (!import.meta.client || !token.value) return ''
  const url = JSON.stringify(`${location.origin}/api/sync/${token.value}`)
  return `javascript:${encodeURIComponent(SCRIPT.replace('__URL__', url).replace(/\n/g, ''))}`
})
</script>

<template>
  <div class="relative">
    <button type="button" class="cursor-pointer bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800" :class="open && 'tab-on'" @click="toggle">
      Sync drafter.lol
    </button>
    <div v-if="open" class="absolute right-0 top-full z-20 mt-1 flex w-96 flex-col gap-3 bg-zinc-900 p-4 text-sm shadow-xl">
      <p class="text-zinc-300">
        Remplit cette série en direct depuis drafter.lol : chaque ban et pick arrive ici tout seul.
      </p>
      <ol class="list-decimal space-y-1 pl-5 text-zinc-400">
        <li>Glisse ce bouton dans ta barre de favoris (une seule fois par série).</li>
        <li>Ouvre la draft sur drafter.lol (joueur ou spectateur), puis clique sur le favori.</li>
        <li>Un badge vert en bas à gauche de drafter.lol confirme la synchro. La game N de drafter.lol remplit notre G N.</li>
      </ol>
      <p v-if="error" class="text-red-300">{{ error }}</p>
      <a v-else-if="bookmarklet" :href="bookmarklet" class="btn-action self-start px-4 py-2 font-display text-sm font-bold uppercase tracking-wider" title="Glisse-moi dans la barre de favoris" @click.prevent>
        Sync Coach
      </a>
      <p v-else class="text-zinc-500">Préparation du lien…</p>
      <button type="button" class="cursor-pointer self-start text-xs text-zinc-500 hover:text-zinc-300" @click="load(true)">
        Nouveau lien (l'ancien favori ne marchera plus)
      </button>
    </div>
  </div>
</template>
