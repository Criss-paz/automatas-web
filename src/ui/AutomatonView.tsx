import React, { useEffect, useMemo, useRef } from 'react'
import { Automaton, EPSILON } from '../core/types'
import { boundsOf } from '../core/layout'

export const R = 26

export interface AutomatonViewProps {
  automaton: Automaton
  /** Escala del dibujo. */
  scale?: number
  selectedState?: string | null
  selectedTransition?: string | null
  highlightStates?: string[]
  /**
   * Se usan eventos de PUNTERO, no de raton: asi el mismo codigo sirve para
   * raton, dedo y lapiz, que es lo que hace falta en telefonos y tablets.
   */
  onStateMouseDown?: (id: string, x: number, y: number, e: React.PointerEvent) => void
  onStateClick?: (id: string, e: React.PointerEvent) => void
  onTransitionClick?: (id: string, e: React.PointerEvent) => void
  onCanvasMouseDown?: (x: number, y: number, e: React.PointerEvent) => void
  onCanvasMouseMove?: (x: number, y: number, e: React.PointerEvent) => void
  onCanvasMouseUp?: (x: number, y: number, e: React.PointerEvent) => void
  /** Linea temporal mientras se dibuja una flecha. */
  pendingArrow?: { x1: number; y1: number; x2: number; y2: number } | null
  minHeight?: number
  className?: string
  /** Fuerza el tamaño del lienzo (modo dibujo) en vez de calcularlo del contenido. */
  fixedWidth?: number
  fixedHeight?: number
}

interface EdgeGroup {
  key: string
  from: string
  to: string
  labels: string[]
  ids: string[]
  /** true si tambien existe la arista contraria (hay que curvar). */
  bidirectional: boolean
}

function groupEdges(a: Automaton): EdgeGroup[] {
  const map = new Map<string, EdgeGroup>()
  for (const t of a.transitions) {
    const key = `${t.from}->${t.to}`
    let g = map.get(key)
    if (!g) {
      g = { key, from: t.from, to: t.to, labels: [], ids: [], bidirectional: false }
      map.set(key, g)
    }
    if (!g.labels.includes(t.symbol)) g.labels.push(t.symbol)
    g.ids.push(t.id)
  }
  for (const g of map.values()) {
    if (g.from !== g.to && map.has(`${g.to}->${g.from}`)) g.bidirectional = true
    // epsilon al final para que se lea "a, b, ε"
    g.labels.sort((x, y) => (x === EPSILON ? 1 : y === EPSILON ? -1 : x.localeCompare(y)))
  }
  return [...map.values()]
}

export default function AutomatonView(props: AutomatonViewProps) {
  const {
    automaton,
    scale = 1,
    selectedState,
    selectedTransition,
    highlightStates = [],
    pendingArrow,
    minHeight = 200,
    className,
  } = props

  const svgRef = useRef<SVGSVGElement>(null)
  const edges = useMemo(() => groupEdges(automaton), [automaton])
  const pos = useMemo(() => new Map(automaton.states.map((s) => [s.id, s])), [automaton])
  const auto = boundsOf(automaton)
  const width = props.fixedWidth ?? auto.width
  const height = props.fixedHeight ?? auto.height

  /**
   * Pasa coordenadas de pantalla a coordenadas del viewBox.
   *
   * Se usa la matriz del propio SVG (getScreenCTM) porque es la unica forma
   * correcta cuando la caja del elemento no guarda la misma proporcion que el
   * viewBox: en ese caso preserveAspectRatio escala el dibujo y lo centra
   * dejando bandas vacias, y una simple regla de tres sobre el rectangulo cae
   * desplazada, con lo que el dedo "no acierta" donde se ve el estado.
   *
   * Si el navegador no ofrece la matriz se usa la regla de tres como respaldo.
   */
  const toLocal = (e: { clientX: number; clientY: number }): { x: number; y: number } => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    try {
      const ctm = svg.getScreenCTM?.()
      if (ctm) {
        const pt = svg.createSVGPoint()
        pt.x = e.clientX
        pt.y = e.clientY
        const p = pt.matrixTransform(ctm.inverse())
        return { x: p.x, y: p.y }
      }
    } catch {
      /* sin matriz: se usa el respaldo de abajo */
    }
    const rect = svg.getBoundingClientRect()
    if (!rect.width || !rect.height) return { x: 0, y: 0 }
    return {
      x: ((e.clientX - rect.left) / rect.width) * width,
      y: ((e.clientY - rect.top) / rect.height) * Math.max(height, minHeight),
    }
  }

  /**
   * Red de seguridad para los navegadores moviles que ignoran touch-action en
   * elementos SVG y se quedan el gesto para desplazar la pagina: cancelando el
   * touchmove aqui, el arrastre con el dedo nunca se interrumpe.
   *
   * Solo se activa en el lienzo del editor (el unico que recibe
   * onCanvasMouseMove); en los diagramas de solo lectura la pagina tiene que
   * poder desplazarse con el dedo encima.
   */
  const interactive = !!props.onCanvasMouseMove
  useEffect(() => {
    const svg = svgRef.current
    if (!svg || !interactive) return
    const stop = (ev: TouchEvent) => ev.preventDefault()
    svg.addEventListener('touchmove', stop, { passive: false })
    return () => svg.removeEventListener('touchmove', stop)
  }, [interactive])

  const renderEdge = (g: EdgeGroup) => {
    const from = pos.get(g.from)
    const to = pos.get(g.to)
    if (!from || !to) return null
    const label = g.labels.join(', ')
    const isSel = g.ids.some((id) => id === selectedTransition)
    const cls = 'edge' + (isSel ? ' edge-selected' : '')
    const onClick = props.onTransitionClick
      ? (e: React.PointerEvent) => props.onTransitionClick!(g.ids[0], e)
      : undefined

    // --- bucle sobre si mismo ---
    if (g.from === g.to) {
      const d = `M ${from.x - 13} ${from.y - R + 3}
                 C ${from.x - 46} ${from.y - R - 52}, ${from.x + 46} ${from.y - R - 52}, ${from.x + 13} ${from.y - R + 3}`
      return (
        <g key={g.key} className={cls} onPointerUp={onClick}>
          <path d={d} fill="none" markerEnd="url(#arrow)" />
          <path d={d} fill="none" className="edge-hit" />
          <text x={from.x} y={from.y - R - 40} textAnchor="middle" className="edge-label">
            {label}
          </text>
        </g>
      )
    }

    // --- arista entre dos estados ---
    const dx = to.x - from.x
    const dy = to.y - from.y
    const dist = Math.hypot(dx, dy) || 1
    const ux = dx / dist
    const uy = dy / dist

    // Desplazamiento perpendicular para separar ida y vuelta.
    const bend = g.bidirectional ? 30 : 0
    const nx = -uy
    const ny = ux
    const mx = (from.x + to.x) / 2 + nx * bend
    const my = (from.y + to.y) / 2 + ny * bend

    // Puntos de salida/llegada en el borde del circulo, apuntando al control.
    const a1x = from.x + ((mx - from.x) / Math.hypot(mx - from.x, my - from.y || 1)) * R
    const a1y = from.y + ((my - from.y) / Math.hypot(mx - from.x, my - from.y || 1)) * R
    const a2x = to.x - ((to.x - mx) / Math.hypot(to.x - mx, to.y - my || 1)) * (R + 6)
    const a2y = to.y - ((to.y - my) / Math.hypot(to.x - mx, to.y - my || 1)) * (R + 6)

    const d = bend
      ? `M ${a1x} ${a1y} Q ${mx} ${my} ${a2x} ${a2y}`
      : `M ${from.x + ux * R} ${from.y + uy * R} L ${to.x - ux * (R + 6)} ${to.y - uy * (R + 6)}`

    const lx = bend ? (from.x + to.x) / 2 + nx * (bend * 0.75) : (from.x + to.x) / 2 + nx * 14
    const ly = bend ? (from.y + to.y) / 2 + ny * (bend * 0.75) : (from.y + to.y) / 2 + ny * 14

    return (
      <g key={g.key} className={cls} onPointerUp={onClick}>
        <path d={d} fill="none" markerEnd="url(#arrow)" />
        <path d={d} fill="none" className="edge-hit" />
        <text x={lx} y={ly - 6} textAnchor="middle" className="edge-label">
          {label}
        </text>
      </g>
    )
  }

  return (
    <svg
      ref={svgRef}
      className={'automaton-svg ' + (className ?? '')}
      viewBox={`0 0 ${width} ${Math.max(height, minHeight)}`}
      style={{ width: '100%', height: 'auto', maxHeight: `${Math.max(height, minHeight) * scale}px` }}
      onPointerDown={(e) => {
        // Solo el lienzo vacio captura el puntero; los estados necesitan recibir
        // su propio pointerup para completar las herramientas por toques.
        if (props.onCanvasMouseDown && e.target === e.currentTarget) e.currentTarget.setPointerCapture?.(e.pointerId)
        const p = toLocal(e)
        props.onCanvasMouseDown?.(p.x, p.y, e)
      }}
      onPointerMove={(e) => {
        const p = toLocal(e)
        props.onCanvasMouseMove?.(p.x, p.y, e)
      }}
      onPointerUp={(e) => {
        const p = toLocal(e)
        props.onCanvasMouseUp?.(p.x, p.y, e)
      }}
      onPointerCancel={(e) => {
        const p = toLocal(e)
        props.onCanvasMouseUp?.(p.x, p.y, e)
      }}
    >
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" className="arrowhead" />
        </marker>
      </defs>

      {edges.map(renderEdge)}

      {pendingArrow && (
        <line
          x1={pendingArrow.x1}
          y1={pendingArrow.y1}
          x2={pendingArrow.x2}
          y2={pendingArrow.y2}
          className="pending-arrow"
          markerEnd="url(#arrow)"
        />
      )}

      {automaton.states.map((s) => {
        const sel = s.id === selectedState
        const hi = highlightStates.includes(s.id)
        return (
          <g
            key={s.id}
            className={'state' + (sel ? ' state-selected' : '') + (hi ? ' state-highlight' : '')}
            onPointerDown={(e) => {
              const p = toLocal(e)
              props.onStateMouseDown?.(s.id, p.x, p.y, e)
            }}
          >
            <circle cx={s.x} cy={s.y} r={R + 13} className="state-hit" />
            {s.isInitial && (
              <g className="initial-marker">
                <line x1={s.x - R - 34} y1={s.y} x2={s.x - R - 4} y2={s.y} markerEnd="url(#arrow)" />
                <text x={s.x - R - 38} y={s.y - 8} textAnchor="end" className="initial-label">
                  inicio
                </text>
              </g>
            )}
            <circle cx={s.x} cy={s.y} r={R} className="state-circle" />
            {s.isFinal && <circle cx={s.x} cy={s.y} r={R - 5} className="state-circle state-inner" />}
            <text x={s.x} y={s.y + 5} textAnchor="middle" className="state-label">
              {s.label.length > 7 ? s.label.slice(0, 6) + '…' : s.label}
            </text>
            {s.label.length > 7 && <title>{s.label}</title>}
          </g>
        )
      })}
    </svg>
  )
}
