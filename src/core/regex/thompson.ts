import { Automaton, EPSILON, State, Step, Transition } from '../types'
import { uid, renameSequential, dedupeTransitions } from '../automaton'
import { autoLayout } from '../layout'
import { RegexNode, alphabetOf, regexToString } from './parser'

/**
 * Construccion de Thompson: expresion regular -> AFN con transiciones epsilon.
 * Cada nodo del arbol produce un fragmento con UN estado de entrada y UNO de salida.
 */
export function thompson(node: RegexNode): { automaton: Automaton; steps: Step[] } {
  const states: State[] = []
  const transitions: Transition[] = []
  const steps: Step[] = []

  const newState = (): string => {
    const s: State = { id: uid('q'), label: `q${states.length}`, x: 0, y: 0, isInitial: false, isFinal: false }
    states.push(s)
    return s.id
  }
  const link = (from: string, to: string, symbol: string) => {
    transitions.push({ id: uid('t'), from, to, symbol })
  }
  const labelOf = (id: string) => states.find((s) => s.id === id)!.label

  function build(n: RegexNode): { start: string; accept: string } {
    switch (n.type) {
      case 'empty': {
        // Lenguaje vacio: dos estados sin ninguna transicion que los una.
        const s = newState()
        const f = newState()
        steps.push({
          title: `∅ (lenguaje vacio)`,
          body: `Se crean ${labelOf(s)} y ${labelOf(f)} **sin** transicion entre ellos: ninguna cadena llega al estado de aceptacion.`,
        })
        return { start: s, accept: f }
      }
      case 'eps': {
        const s = newState()
        const f = newState()
        link(s, f, EPSILON)
        steps.push({
          title: `ε (cadena vacia)`,
          body: `Fragmento basico: ${labelOf(s)} --${EPSILON}--> ${labelOf(f)}.`,
        })
        return { start: s, accept: f }
      }
      case 'sym': {
        const s = newState()
        const f = newState()
        link(s, f, n.value)
        steps.push({
          title: `Simbolo "${n.value}"`,
          body: `Fragmento basico: ${labelOf(s)} --${n.value}--> ${labelOf(f)}.`,
        })
        return { start: s, accept: f }
      }
      case 'concat': {
        const a = build(n.left)
        const b = build(n.right)
        link(a.accept, b.start, EPSILON)
        steps.push({
          title: `Concatenacion: ${regexToString(n.left)} · ${regexToString(n.right)}`,
          body: `Se enlaza la salida del primer fragmento con la entrada del segundo mediante ${EPSILON}: ${labelOf(a.accept)} --${EPSILON}--> ${labelOf(b.start)}.`,
        })
        return { start: a.start, accept: b.accept }
      }
      case 'union': {
        const a = build(n.left)
        const b = build(n.right)
        const s = newState()
        const f = newState()
        link(s, a.start, EPSILON)
        link(s, b.start, EPSILON)
        link(a.accept, f, EPSILON)
        link(b.accept, f, EPSILON)
        steps.push({
          title: `Union: ${regexToString(n.left)} | ${regexToString(n.right)}`,
          body: `Nuevo inicio ${labelOf(s)} con dos ${EPSILON} hacia cada alternativa, y nuevo fin ${labelOf(f)} al que ambas llegan con ${EPSILON}.`,
        })
        return { start: s, accept: f }
      }
      case 'star': {
        const a = build(n.child)
        const s = newState()
        const f = newState()
        link(s, a.start, EPSILON)
        link(s, f, EPSILON)
        link(a.accept, a.start, EPSILON)
        link(a.accept, f, EPSILON)
        steps.push({
          title: `Cerradura de Kleene: (${regexToString(n.child)})*`,
          body: `${labelOf(s)} --${EPSILON}--> ${labelOf(f)} permite cero repeticiones; ${labelOf(a.accept)} --${EPSILON}--> ${labelOf(a.start)} permite repetir.`,
        })
        return { start: s, accept: f }
      }
      case 'plus': {
        const a = build(n.child)
        const s = newState()
        const f = newState()
        link(s, a.start, EPSILON)
        link(a.accept, a.start, EPSILON)
        link(a.accept, f, EPSILON)
        steps.push({
          title: `Una o mas: (${regexToString(n.child)})+`,
          body: `Igual que la estrella pero SIN el atajo ${labelOf(s)} --${EPSILON}--> ${labelOf(f)}: obliga a al menos una repeticion.`,
        })
        return { start: s, accept: f }
      }
      case 'opt': {
        const a = build(n.child)
        const s = newState()
        const f = newState()
        link(s, a.start, EPSILON)
        link(s, f, EPSILON)
        link(a.accept, f, EPSILON)
        steps.push({
          title: `Opcional: (${regexToString(n.child)})?`,
          body: `Se agrega el atajo ${labelOf(s)} --${EPSILON}--> ${labelOf(f)} para permitir cero apariciones.`,
        })
        return { start: s, accept: f }
      }
      default:
        // {n,m} se expande antes, y ~ ∩ − se resuelven con operaciones sobre
        // AFD (ver regex/build.ts): Thompson solo ve los operadores clasicos.
        throw new Error(
          `El operador "${n.type}" no se construye con Thompson; debe resolverse antes en regex/build.ts.`,
        )
    }
  }

  const frag = build(node)
  states.find((s) => s.id === frag.start)!.isInitial = true
  states.find((s) => s.id === frag.accept)!.isFinal = true

  let automaton: Automaton = {
    name: 'AFN-ε (Thompson)',
    alphabet: alphabetOf(node),
    states,
    transitions,
  }
  automaton = autoLayout(renameSequential(dedupeTransitions(automaton)))

  return { automaton, steps }
}
