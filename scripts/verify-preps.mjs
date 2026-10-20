import assert from 'node:assert/strict'

// À lancer uniquement contre un serveur local et une base de test isolée.
const base = process.argv[2] ?? 'http://127.0.0.1:3012'
assert.equal(new URL(base).hostname, '127.0.0.1', 'Utiliser une instance de test locale')
const keep = process.argv.includes('--keep')
let prepId
async function api(path, method = 'GET', body, expected = 200) {
  const res = await fetch(`${base}/api${path}`, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
  assert.equal(res.status, expected, `${method} ${path} : ${await res.clone().text()}`)
  return res.status === 204 ? undefined : res.json()
}
const slots = Array.from({ length: 20 }, () => [])
const pickSteps = [6, 9, 10, 17, 18]
;[['Ornn', 'Malphite'], ['JarvanIV', 'Sejuani'], ['Orianna', 'Syndra'], ['Jhin', 'Ashe'], ['Nautilus', 'Rell']].forEach((c, i) => { slots[pickSteps[i]] = c })
;['Yasuo', 'Zed', 'Yone', 'Akali', 'Leblanc'].forEach((c, i) => { slots[[0, 2, 4, 13, 15][i]] = [c] })
const roles = ['top', 'jungle', 'mid', 'adc', 'support']
const combos = [{ id: 'test-bot', a: { pick: 3, champion: 'Ashe' }, b: { pick: 4, champion: 'Rell' } }, { id: 'test-top', a: { pick: 0, champion: 'Ornn' }, b: { pick: 1, champion: 'JarvanIV' } }]
try {
  const old = (await api('/preps')).find(p => p.name === '[test] Ancienne préparation')
  if (old) {
    const { scenarios } = await api(`/preps/${old.id}`)
    assert.equal(scenarios[0].slots[6][0], 'Jhin')
    assert.equal(scenarios[0].pickRoles[0], 'adc')
    assert.deepEqual(scenarios[0].combos, [])
    assert.equal(scenarios[0].notes, '[test] Notes conservées')
    console.log('✓ Migration additive : ordre B1 ADC, notes et options conservés')
  }
  prepId = (await api('/preps', 'POST', { name: '[test] Galerie V2', opponent: '[test] QA' })).id
  const scenario = (await api(`/preps/${prepId}`)).scenarios[0]
  const path = `/scenarios/${scenario.id}`
  await api(path, 'PUT', { name: '[test] Composition complète', slots, pickRoles: roles, combos, notes: '[test] Plan de jeu' })
  let saved = (await api(`/preps/${prepId}`)).scenarios[0]
  assert.deepEqual(saved.slots, slots)
  assert.deepEqual(saved.pickRoles, roles)
  assert.deepEqual(saved.combos, combos)
  const copy = await api(`/preps/${prepId}/scenarios`, 'POST', { copyFrom: scenario.id })
  assert.deepEqual(copy.combos, combos)
  assert.deepEqual(copy.pickRoles, roles)
  assert.deepEqual(copy.slots, slots)
  await api(`/scenarios/${copy.id}`, 'DELETE')
  console.log('✓ Sauvegarde, relecture et duplication des alternatives, rôles et combos')
  for (const patch of [
    { pickRoles: ['top', 'top', 'mid', 'adc', 'support'] },
    { combos: [{ ...combos[0], b: { pick: 3, champion: 'Rell' } }] },
    { combos: [{ ...combos[0], b: { pick: 4, champion: 'Inconnu' } }] },
    { combos: [...combos, { id: 'reverse', a: combos[0].b, b: combos[0].a }] },
    { combos: Array.from({ length: 61 }, (_, i) => ({ ...combos[0], id: `test-${i}` })) },
    { slots: slots.map((s, i) => i === 6 ? ['Ornn', 'Malphite', 'Shen', 'Gnar', 'Camille', 'Gwen', 'Jax'] : s) },
  ]) {
    await api(path, 'PUT', { name: '[test] Ne doit pas être écrit', ...patch }, 400)
    saved = (await api(`/preps/${prepId}`)).scenarios[0]
    assert.equal(saved.name, '[test] Composition complète')
    assert.deepEqual(saved.combos, combos)
    assert.deepEqual(saved.slots, slots)
  }
  console.log('✓ Entrées invalides refusées et sauvegardes atomiques')
  console.log(`✓ Parcours navigateur : ${base}/prep/${prepId}?s=${scenario.id}`)
}
finally {
  if (prepId && !keep) await api(`/preps/${prepId}`, 'DELETE')
}
