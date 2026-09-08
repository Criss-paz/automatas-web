// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { createRoot, Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import Editor from './Editor'

/**
 * Pruebas de la interaccion por TOQUE del lienzo.
 *
 * Simulan la secuencia real de eventos de un dedo (pointerdown / pointermove /
 * pointerup con pointerType 'touch') sobre el SVG, que es justo lo que no se
 * podia comprobar con las pruebas de renderizado: aqui se verifica que tocar
 * crea estados, que dos toques crean una flecha y que arrastrar mueve el estado.
 */

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

/** Medidas del SVG en pantalla; jsdom no calcula diseño, hay que fijarlas. */
const RECT = { left: 20, top: 100, width: 470, height: 260 }
/** viewBox del lienzo del editor (ver W y H en Editor.tsx). */
const VB = { w: 940, h: 520 }

/** Pasa coordenadas del lienzo (viewBox) a coordenadas de pantalla. */
function toScreen(x: number, y: number) {
  return {
    clientX: RECT.left + (x / VB.w) * RECT.width,
    clientY: RECT.top + (y / VB.h) * RECT.height,
  }
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  window.localStorage.clear()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root.render(<Editor />)
  })
  stubGeometry()
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

/** jsdom no hace diseño: se fija el rectangulo del SVG a mano. */
function stubGeometry() {
  const svg = container.querySelector('svg.automaton-svg') as SVGSVGElement
  svg.getBoundingClientRect = () =>
    ({ ...RECT, right: RECT.left + RECT.width, bottom: RECT.top + RECT.height, x: RECT.left, y: RECT.top, toJSON: () => ({}) }) as DOMRect
}

const svgEl = () => container.querySelector('svg.automaton-svg') as SVGSVGElement

/** Dispara un evento de puntero tactil sobre el elemento indicado. */
function pointer(target: Element, type: 'pointerdown' | 'pointermove' | 'pointerup', x: number, y: number) {
  const { clientX, clientY } = toScreen(x, y)
  const ev = new window.MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY })
  // React lee estas propiedades del evento nativo.
  Object.defineProperty(ev, 'pointerId', { value: 1 })
  Object.defineProperty(ev, 'pointerType', { value: 'touch' })
  Object.defineProperty(ev, 'isPrimary', { value: true })
  act(() => {
    target.dispatchEvent(ev)
  })
}

/** Un toque completo: bajar y levantar el dedo en el mismo punto. */
function tap(target: Element, x: number, y: number) {
  pointer(target, 'pointerdown', x, y)
  pointer(target, 'pointerup', x, y)
}

/** Selecciona una herramienta por su etiqueta visible. */
function useTool(label: string) {
  const btn = [...container.querySelectorAll('button.tool')].find((b) => b.textContent?.includes(label))
  if (!btn) throw new Error(`no se encontro la herramienta "${label}"`)
  act(() => {
    btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  })
}

/** El grupo <g class="state"> que contiene al estado numero i. */
const stateGroups = () => [...container.querySelectorAll('g.state')]
/** El area de toque del estado i (el circulo grande transparente). */
const stateHit = (i: number) => stateGroups()[i].querySelector('.state-hit') as Element
const edgeCount = () => container.querySelectorAll('g.edge').length

describe('lienzo tactil: crear estados', () => {
  it('un toque en el lienzo vacio crea un estado', () => {
    useTool('Estado')
    tap(svgEl(), 200, 200)
    expect(stateGroups().length).toBe(1)
  })

  it('el estado queda donde se toco, no desplazado', () => {
    useTool('Estado')
    tap(svgEl(), 300, 250)
    const circle = stateGroups()[0].querySelector('.state-circle') as SVGCircleElement
    expect(Number(circle.getAttribute('cx'))).toBeCloseTo(300, 0)
    expect(Number(circle.getAttribute('cy'))).toBeCloseTo(250, 0)
  })

  it('varios toques crean varios estados', () => {
    useTool('Estado')
    tap(svgEl(), 200, 150)
    tap(svgEl(), 600, 150)
    expect(stateGroups().length).toBe(2)
  })
})

describe('lienzo tactil: dibujar una flecha', () => {
  beforeEach(() => {
    useTool('Estado')
    tap(svgEl(), 200, 150)
    tap(svgEl(), 600, 150)
    expect(stateGroups().length).toBe(2)
  })

  it('tocar origen y luego destino crea la transicion', () => {
    useTool('Flecha')
    tap(stateHit(0), 200, 150)
    tap(stateHit(1), 600, 150)
    expect(edgeCount()).toBe(1)
  })

  it('tocar dos veces el mismo estado crea un bucle', () => {
    useTool('Flecha')
    tap(stateHit(0), 200, 150)
    tap(stateHit(0), 200, 150)
    expect(edgeCount()).toBe(1)
  })
})

describe('lienzo tactil: mover un estado', () => {
  beforeEach(() => {
    useTool('Estado')
    tap(svgEl(), 200, 150)
  })

  it('arrastrar el estado lo mueve a la nueva posicion', () => {
    useTool('Mover')
    const hit = stateHit(0)
    pointer(hit, 'pointerdown', 200, 150)
    pointer(svgEl(), 'pointermove', 500, 300)
    pointer(svgEl(), 'pointerup', 500, 300)

    const circle = stateGroups()[0].querySelector('.state-circle') as SVGCircleElement
    expect(Number(circle.getAttribute('cx'))).toBeCloseTo(500, 0)
    expect(Number(circle.getAttribute('cy'))).toBeCloseTo(300, 0)
  })

  it('el estado no salta al empezar el arrastre desde un borde', () => {
    useTool('Mover')
    const hit = stateHit(0)
    // El dedo baja descentrado respecto del centro del estado.
    pointer(hit, 'pointerdown', 215, 160)
    pointer(svgEl(), 'pointermove', 215, 160)

    const circle = stateGroups()[0].querySelector('.state-circle') as SVGCircleElement
    // Sin mover el dedo, el estado debe seguir exactamente donde estaba.
    expect(Number(circle.getAttribute('cx'))).toBeCloseTo(200, 0)
    expect(Number(circle.getAttribute('cy'))).toBeCloseTo(150, 0)
  })
})

describe('lienzo tactil: marcar inicial y final', () => {
  beforeEach(() => {
    useTool('Estado')
    tap(svgEl(), 200, 150)
    tap(svgEl(), 600, 150)
  })

  it('la herramienta Final pone el doble circulo', () => {
    useTool('Final')
    tap(stateHit(1), 600, 150)
    expect(stateGroups()[1].querySelectorAll('.state-circle').length).toBe(2)
  })

  it('la herramienta Borrar elimina el estado tocado', () => {
    useTool('Borrar')
    tap(stateHit(1), 600, 150)
    expect(stateGroups().length).toBe(1)
  })
})

describe('lienzo en pantalla de telefono', () => {
  /** Vuelve a montar el editor simulando el ancho de un telefono. */
  function renderAt(width: number) {
    act(() => root.unmount())
    Object.defineProperty(window, 'innerWidth', { value: width, configurable: true })
    root = createRoot(container)
    act(() => {
      root.render(<Editor />)
    })
    stubGeometry()
  }

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true })
  })

  it('usa un sistema de coordenadas mas pequeño para que los estados se vean grandes', () => {
    renderAt(390)
    const vb = svgEl().getAttribute('viewBox')!
    const [, , w] = vb.split(/\s+/).map(Number)
    expect(w).toBeLessThan(940)
    // El lienzo ocupa el ancho disponible: nunca se fija un ancho mayor que la
    // pantalla, porque con touch-action: none no habria forma de desplazarlo.
    expect(svgEl().style.width).toBe('100%')
  })

  it('sigue creando estados y flechas con el dedo', () => {
    renderAt(390)
    const vbW = Number(svgEl().getAttribute('viewBox')!.split(/\s+/)[2])
    const vbH = Number(svgEl().getAttribute('viewBox')!.split(/\s+/)[3])
    // Coordenadas dentro del nuevo viewBox, mas pequeño que el de escritorio.
    const p1 = { x: vbW * 0.25, y: vbH * 0.4 }
    const p2 = { x: vbW * 0.75, y: vbH * 0.4 }

    useTool('Estado')
    pointerAt(svgEl(), 'pointerdown', p1, vbW, vbH)
    pointerAt(svgEl(), 'pointerup', p1, vbW, vbH)
    pointerAt(svgEl(), 'pointerdown', p2, vbW, vbH)
    pointerAt(svgEl(), 'pointerup', p2, vbW, vbH)
    expect(stateGroups().length).toBe(2)

    useTool('Flecha')
    pointerAt(stateHit(0), 'pointerdown', p1, vbW, vbH)
    pointerAt(stateHit(0), 'pointerup', p1, vbW, vbH)
    pointerAt(stateHit(1), 'pointerdown', p2, vbW, vbH)
    pointerAt(stateHit(1), 'pointerup', p2, vbW, vbH)
    expect(edgeCount()).toBe(1)
  })

  /** Como pointer(), pero convirtiendo con el viewBox que toque. */
  function pointerAt(
    target: Element,
    type: 'pointerdown' | 'pointermove' | 'pointerup',
    p: { x: number; y: number },
    vbW: number,
    vbH: number,
  ) {
    const clientX = RECT.left + (p.x / vbW) * RECT.width
    const clientY = RECT.top + (p.y / vbH) * RECT.height
    const ev = new window.MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY })
    Object.defineProperty(ev, 'pointerId', { value: 1 })
    Object.defineProperty(ev, 'pointerType', { value: 'touch' })
    act(() => {
      target.dispatchEvent(ev)
    })
  }
})
