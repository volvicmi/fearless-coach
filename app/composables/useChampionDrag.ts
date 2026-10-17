import { gsap } from 'gsap'
import { Draggable } from 'gsap/Draggable'
import type { Ref } from 'vue'
import type { Tier } from '#shared/types'

/** A tier row, or the champion list (drop there to take a champion out of the pool). */
export type DropTarget = Tier | 'remove'

const DRAG_THRESHOLD_PX = 5
/** Every zone while a drag is running */
const ZONE_ACTIVE = ['outline', 'outline-1', 'outline-dashed', 'outline-zinc-600']
/** The zone under the pointer */
const ZONE_HOVER = ['outline-2!', 'outline-solid!', 'outline-amber-400!', 'bg-amber-400/10']

/**
 * Drag champions onto drop zones inside `root`.
 * - Sources: `data-drag-champ="<champId>"`, plus `data-drag-from="<tier>"` when the champion is already in a row.
 * - Zones: `data-tier-drop="<tier|remove>"`; a row's champions sit inside its `[data-tier-items]` element.
 * In a row, a marker shows where the champion will land: `index` is its place in the row (0 = leftmost).
 * A floating copy of the icon follows the pointer (so it can leave scrollable lists); a plain click still works.
 */
export function useChampionDrag(
  root: Ref<HTMLElement | undefined>,
  onDrop: (champId: string, target: DropTarget, index?: number) => void,
) {
  let press: { x: number, y: number, el: HTMLElement } | null = null
  let hovered: HTMLElement | null = null
  let justDragged = false

  const zones = () => [...(root.value?.querySelectorAll<HTMLElement>('[data-tier-drop]') ?? [])]

  function zoneAt(x: number, y: number): HTMLElement | null {
    for (const el of document.elementsFromPoint(x, y)) {
      const zone = (el as HTMLElement).closest<HTMLElement>('[data-tier-drop]')
      if (zone && root.value?.contains(zone)) return zone
    }
    return null
  }

  function setHovered(zone: HTMLElement | null) {
    if (hovered === zone) return
    hovered?.classList.remove(...ZONE_HOVER)
    zone?.classList.add(...ZONE_HOVER)
    hovered = zone
  }

  /** Champions of a row in reading order, without the one being dragged. */
  const tilesOf = (zone: HTMLElement, source: HTMLElement) =>
    [...zone.querySelectorAll<HTMLElement>('[data-drag-champ]')].filter(t => t !== source)

  /** Where the pointer would insert in a row: count the tiles before it (earlier line, or same line and to the left). */
  function insertionIndex(tiles: HTMLElement[], x: number, y: number): number {
    let i = 0
    for (const t of tiles) {
      const r = t.getBoundingClientRect()
      const before = r.bottom < y || (y >= r.top && x > r.left + r.width / 2)
      if (!before) break
      i++
    }
    return i
  }

  function clearPress() {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', clearPress)
    press = null
  }

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0) return
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-drag-champ]')
    if (!el || !root.value?.contains(el)) return
    // Pressing on a champion (icon or name) must never start a text selection or a native image drag.
    e.preventDefault()
    press = { x: e.clientX, y: e.clientY, el }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', clearPress)
  }

  function onMove(e: PointerEvent) {
    if (!press || Math.hypot(e.clientX - press.x, e.clientY - press.y) < DRAG_THRESHOLD_PX) return
    const source = press.el
    clearPress()
    startDrag(source, e)
  }

  function startDrag(source: HTMLElement, e: PointerEvent) {
    const champId = source.dataset.dragChamp!
    const from = source.dataset.dragFrom as Tier | undefined
    const icon = source.querySelector('img') ?? source
    const rect = icon.getBoundingClientRect()
    const size = Math.max(rect.width, 56)
    // Current place of the champion in its own row, to skip drops that change nothing.
    const fromZone = source.closest<HTMLElement>('[data-tier-drop]')
    const fromIndex = fromZone ? [...fromZone.querySelectorAll('[data-drag-champ]')].indexOf(source) : -1

    // The copy is centred under the pointer and slightly bigger than the source.
    const ghost = icon.cloneNode(true) as HTMLElement
    Object.assign(ghost.style, {
      position: 'fixed',
      left: `${e.clientX - size / 2}px`,
      top: `${e.clientY - size / 2}px`,
      width: `${size}px`,
      height: `${size}px`,
      margin: '0',
      zIndex: '1000',
      pointerEvents: 'none',
      borderRadius: '10px',
      boxShadow: '0 12px 30px rgb(0 0 0 / 0.6), 0 0 0 2px rgb(251 191 36)',
    })
    document.body.appendChild(ghost)
    gsap.fromTo(ghost, { scale: 0.8, rotate: 0 }, { scale: 1.08, rotate: -4, duration: 0.15, ease: 'power2.out' })

    // Vertical bar showing where the champion will be inserted.
    const marker = document.createElement('div')
    Object.assign(marker.style, {
      position: 'fixed',
      width: '4px',
      borderRadius: '2px',
      background: 'rgb(251 191 36)',
      boxShadow: '0 0 8px rgb(251 191 36 / 0.8)',
      zIndex: '999',
      pointerEvents: 'none',
      display: 'none',
    })
    document.body.appendChild(marker)

    source.style.opacity = '0.25'
    document.body.style.cursor = 'grabbing'
    document.body.style.userSelect = 'none'
    window.getSelection()?.removeAllRanges()
    for (const z of zones()) z.classList.add(...ZONE_ACTIVE)

    let index: number | undefined
    function placeMarker(zone: HTMLElement | null, x: number, y: number) {
      index = undefined
      if (!zone || zone.dataset.tierDrop === 'remove') {
        marker.style.display = 'none'
        return
      }
      const tiles = tilesOf(zone, source)
      index = insertionIndex(tiles, x, y)
      const ref = tiles[index] ?? tiles[index - 1]
      const items = zone.querySelector<HTMLElement>('[data-tier-items]') ?? zone
      const r = ref?.getBoundingClientRect() ?? items.getBoundingClientRect()
      const height = ref ? r.height : 56
      const left = !ref ? r.left + 8 : tiles[index] ? r.left - 4 : r.right + 2
      Object.assign(marker.style, { display: 'block', left: `${left}px`, top: `${r.top + (ref ? 0 : 8)}px`, height: `${height}px` })
    }

    // Track the pointer ourselves: the drop goes where the highlight and the marker are.
    const track = (ev: PointerEvent) => {
      const zone = zoneAt(ev.clientX, ev.clientY)
      setHovered(zone)
      placeMarker(zone, ev.clientX, ev.clientY)
    }
    window.addEventListener('pointermove', track)
    track(e)

    const finish = () => {
      window.removeEventListener('pointermove', track)
      setHovered(null)
      marker.remove()
      for (const z of zones()) z.classList.remove(...ZONE_ACTIVE)
      source.style.opacity = ''
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.getSelection()?.removeAllRanges()
      justDragged = true
      setTimeout(() => (justDragged = false), 0)
    }

    const [draggable] = Draggable.create(ghost, {
      type: 'x,y',
      onRelease() {
        const target = hovered?.dataset.tierDrop as DropTarget | undefined
        const dropIndex = index
        finish()
        this.kill()

        const sameSpot = target === from && dropIndex === fromIndex
        const useful = target && !sameSpot && !(target === 'remove' && !from)
        if (useful) {
          // The row updates instantly: the copy just fades where it was dropped.
          gsap.to(ghost, { scale: 0.5, opacity: 0, rotate: 0, duration: 0.18, ease: 'power2.in', onComplete: () => ghost.remove() })
          onDrop(champId, target, target === 'remove' ? undefined : dropIndex)
        }
        else {
          // Dropped nowhere useful: fly back to where it came from.
          const back = icon.getBoundingClientRect()
          gsap.to(ghost, {
            x: back.left + back.width / 2 - e.clientX,
            y: back.top + back.height / 2 - e.clientY,
            scale: back.width / size,
            rotate: 0,
            duration: 0.25,
            ease: 'power2.out',
            onComplete: () => ghost.remove(),
          })
        }
      },
    })
    draggable!.startDrag(e)
  }

  /** A drag ends with a click on whatever is under the pointer: swallow it. */
  function onClickCapture(e: MouseEvent) {
    if (!justDragged) return
    e.stopPropagation()
    e.preventDefault()
  }

  onMounted(() => {
    gsap.registerPlugin(Draggable)
    root.value?.addEventListener('pointerdown', onPointerDown)
    root.value?.addEventListener('click', onClickCapture, true)
  })
  onBeforeUnmount(() => {
    clearPress()
    root.value?.removeEventListener('pointerdown', onPointerDown)
    root.value?.removeEventListener('click', onClickCapture, true)
  })
}
