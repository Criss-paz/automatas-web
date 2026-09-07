import { Automaton, State, Transition } from '../types'
import { uid, initialState, move } from '../automaton'
import { autoLayout } from '../layout'

/**
 * Operaciones booleanas sobre automatas: complemento, interseccion y union.
 *
 * Son la base de varias partes del sistema: combinar las condiciones de un
 * enunciado, resolver los operadores extendidos de las expresiones regulares
 * (~, &&, -) y verificar equivalencias. Todas trabajan sobre AFD COMPLETOS,
 * porque el complemento solo es correcto cuando delta esta definida siempre.
 */

/** Complemento de un AFD COMPLETO: se invierten los estados finales. */
export function complement(a: Automaton, name?: string): Automaton {
  return {
    ...a,
    name: name ?? `complemento de ${a.name}`,
    states: a.states.map((s) => ({ ...s, isFinal: !s.isFinal })),
    transitions: a.transitions.map((t) => ({ ...t })),
  }
}

/**
 * Producto de dos AFD completos.
 * mode 'and' -> interseccion (final si ambos lo son)
 * mode 'or'  -> union        (final si alguno lo es)
 * Solo se generan los pares alcanzables.
 */
export function product(a: Automaton, b: Automaton, mode: 'and' | 'or', name?: string): Automaton {
  const alphabet = [...new Set([...a.alphabet, ...b.alphabet])].sort()
  const ia = initialState(a)
  const ib = initialState(b)
  if (!ia || !ib) return a

  const finA = (id: string) => !!a.states.find((s) => s.id === id)?.isFinal
  const finB = (id: string) => !!b.states.find((s) => s.id === id)?.isFinal
  const labA = (id: string) => a.states.find((s) => s.id === id)!.label
  const labB = (id: string) => b.states.find((s) => s.id === id)!.label

  const states: State[] = []
  const transitions: Transition[] = []
  const index = new Map<string, State>()

  const getState = (p: string, q: string): State => {
    const k = `${p}|${q}`
    let s = index.get(k)
    if (!s) {
      s = {
        id: uid('pr'),
        label: `(${labA(p)},${labB(q)})`,
        x: 0,
        y: 0,
        isInitial: states.length === 0,
        isFinal: mode === 'and' ? finA(p) && finB(q) : finA(p) || finB(q),
      }
      index.set(k, s)
      states.push(s)
    }
    return s
  }

  const queue: Array<[string, string]> = [[ia.id, ib.id]]
  getState(ia.id, ib.id)
  const visited = new Set<string>([`${ia.id}|${ib.id}`])

  while (queue.length) {
    const [p, q] = queue.shift()!
    const from = getState(p, q)
    for (const sym of alphabet) {
      const np = move(a, p, sym)[0]
      const nq = move(b, q, sym)[0]
      if (np === undefined || nq === undefined) continue // AFD incompleto: se ignora
      const to = getState(np, nq)
      transitions.push({ id: uid('t'), from: from.id, to: to.id, symbol: sym })
      const k = `${np}|${nq}`
      if (!visited.has(k)) {
        visited.add(k)
        queue.push([np, nq])
      }
    }
  }

  return autoLayout({
    name: name ?? `${a.name} ${mode === 'and' ? '∩' : '∪'} ${b.name}`,
    alphabet,
    states,
    transitions,
  })
}
