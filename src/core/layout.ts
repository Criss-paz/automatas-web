import { Automaton } from './types'
import { initialStates } from './automaton'

/**
 * Coloca los estados automaticamente en capas por distancia (BFS) desde el inicial.
 * Se usa cuando el automata lo genera un algoritmo y no lo dibujo el usuario.
 */
export function autoLayout(a: Automaton, opts: { dx?: number; dy?: number; x0?: number; y0?: number } = {}): Automaton {
  const dx = opts.dx ?? 170
  const dy = opts.dy ?? 130
  const x0 = opts.x0 ?? 110
  const y0 = opts.y0 ?? 110

  const depth = new Map<string, number>()
  const queue: string[] = []

  for (const init of initialStates(a)) {
    depth.set(init.id, 0)
    queue.push(init.id)
  }
  while (queue.length) {
    const q = queue.shift()!
    const d = depth.get(q)!
    for (const t of a.transitions) {
      if (t.from === q && !depth.has(t.to)) {
        depth.set(t.to, d + 1)
        queue.push(t.to)
      }
    }
  }
  // Los no alcanzados van a una capa extra al final.
  let maxD = 0
  for (const d of depth.values()) maxD = Math.max(maxD, d)
  for (const s of a.states) if (!depth.has(s.id)) depth.set(s.id, maxD + 1)

  // Agrupa por capa conservando el orden original dentro de cada una.
  const layers = new Map<number, string[]>()
  for (const s of a.states) {
    const d = depth.get(s.id)!
    if (!layers.has(d)) layers.set(d, [])
    layers.get(d)!.push(s.id)
  }

  const pos = new Map<string, { x: number; y: number }>()
  const maxCol = Math.max(...[...layers.values()].map((l) => l.length), 1)
  for (const [d, ids] of [...layers.entries()].sort((p, q) => p[0] - q[0])) {
    const offset = ((maxCol - ids.length) * dy) / 2
    ids.forEach((id, i) => pos.set(id, { x: x0 + d * dx, y: y0 + offset + i * dy }))
  }

  return { ...a, states: a.states.map((s) => ({ ...s, ...pos.get(s.id)! })) }
}

/** Dimensiones del lienzo necesarias para dibujar el automata. */
export function boundsOf(a: Automaton, pad = 90): { width: number; height: number } {
  let w = 0
  let h = 0
  for (const s of a.states) {
    w = Math.max(w, s.x)
    h = Math.max(h, s.y)
  }
  return { width: Math.max(w + pad, 320), height: Math.max(h + pad, 220) }
}
