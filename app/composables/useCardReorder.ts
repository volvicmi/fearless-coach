import { gsap } from 'gsap'

/**
 * Rangement de cartes à la main : la carte saisie suit le curseur,
 * sa place reste marquée dans la grille et les autres cartes glissent pour lui faire de la place.
 * - Cartes : éléments `[data-card-id]` dans `root`.
 * - `move(id, target)` réordonne la liste affichée ; `done()` enregistre l'ordre au lâcher.
 * Un clic simple (sans déplacement) ouvre toujours la carte.
 */
export function useCardReorder(root: Ref<HTMLElement | undefined>, move: (id: number, target: number) => void, done: () => void) {
  const dragging = ref<number | null>(null)
  let pending: { el: HTMLElement, id: number } | null = null
  let ghost: HTMLElement | null = null
  let start = { x: 0, y: 0 }
  let justDragged = false

  const cards = () => [...(root.value?.querySelectorAll<HTMLElement>('[data-card-id]') ?? [])]

  /** FLIP : mesure, réordonne, puis fait glisser chaque carte depuis son ancienne place. */
  async function flip(change: () => void) {
    const before = new Map(cards().map(el => [el.dataset.cardId, el.getBoundingClientRect()]))
    change()
    await nextTick()
    for (const el of cards()) {
      const r0 = before.get(el.dataset.cardId)
      if (!r0) continue
      const r1 = el.getBoundingClientRect()
      const dx = r0.left - r1.left, dy = r0.top - r1.top
      if (dx || dy) gsap.fromTo(el, { x: dx, y: dy }, { x: 0, y: 0, duration: 0.15, ease: 'power2.out', overwrite: true, clearProps: 'transform' })
    }
  }

  function lift() {
    const { el, id } = pending!
    const r = el.getBoundingClientRect()
    ghost = el.cloneNode(true) as HTMLElement
    Object.assign(ghost.style, { position: 'fixed', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, margin: '0', zIndex: '1000', pointerEvents: 'none' })
    document.body.appendChild(ghost)
    dragging.value = id
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'grabbing'
  }

  function onMove(e: PointerEvent) {
    if (!pending) return
    if (!ghost) {
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < 6) return
      lift()
    }
    gsap.set(ghost, { x: e.clientX - start.x, y: e.clientY - start.y })
    const under = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-card-id]')
    if (!under || !root.value?.contains(under) || gsap.isTweening(under)) return
    const target = Number(under.dataset.cardId)
    if (target !== pending.id) { const id = pending.id; void flip(() => move(id, target)) }
  }

  function stop() {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', stop)
    window.removeEventListener('pointercancel', stop)
    document.body.style.userSelect = ''
    document.body.style.cursor = ''
    pending = null
    if (!ghost) return
    ghost.remove()
    ghost = null
    dragging.value = null
    justDragged = true
    setTimeout(() => { justDragged = false }, 0)
    done()
  }

  function onDown(e: PointerEvent) {
    if (e.button !== 0 || pending) return
    // Boutons, champs et champions déplaçables gardent leur propre comportement.
    if ((e.target as HTMLElement).closest('button, input, textarea, select, [data-drag-champ]')) return
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-card-id]')
    if (!el) return
    pending = { el, id: Number(el.dataset.cardId) }
    start = { x: e.clientX, y: e.clientY }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
  }
  // Après un déplacement, le clic du lâcher n'ouvre pas la carte.
  function onClick(e: MouseEvent) { if (justDragged) { e.preventDefault(); e.stopPropagation(); justDragged = false } }
  const noNativeDrag = (e: DragEvent) => e.preventDefault()

  onMounted(() => {
    root.value?.addEventListener('pointerdown', onDown)
    root.value?.addEventListener('click', onClick, true)
    root.value?.addEventListener('dragstart', noNativeDrag)
  })
  onBeforeUnmount(() => {
    stop()
    root.value?.removeEventListener('pointerdown', onDown)
    root.value?.removeEventListener('click', onClick, true)
    root.value?.removeEventListener('dragstart', noNativeDrag)
  })
  return { dragging }
}
