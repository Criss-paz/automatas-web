import { Automaton, EPSILON, State, Step, Transition } from '../types'
import {
  epsilonClosure,
  finalStates,
  hasEpsilon,
  initialStates,
  labelOf,
  moveSet,
  orderLike,
  setLabel,
  uid,
} from '../automaton'
import { autoLayout } from '../layout'

export interface SubsetResult {
  automaton: Automaton
  steps: Step[]
  /** Para cada estado del AFD resultante: que conjunto de estados del AFN representa. */
  mapping: Array<{ dfaLabel: string; nfaSet: string[]; nfaLabel: string }>
}

/**
 * Construccion de subconjuntos (algoritmo de determinizacion).
 * Convierte un AFN, con o sin transiciones epsilon, en un AFD equivalente.
 * Incluye el estado vacio ∅ como estado trampa cuando hace falta, de modo que
 * el AFD resultante siempre queda completo.
 */
export function subsetConstruction(nfa: Automaton, opts: { name?: string; keepEmpty?: boolean } = {}): SubsetResult {
  const steps: Step[] = []
  const alphabet = [...nfa.alphabet]
  const inits = initialStates(nfa)

  if (inits.length === 0) {
    // Sin estados iniciales no se puede alcanzar nada: el lenguaje es vacio.
    // Se parte igualmente del subconjunto ∅, con lo que la construccion produce
    // el AFD minimo del lenguaje vacio (un unico estado trampa). Este caso
    // aparece de forma natural al invertir un automata que no tiene finales.
    steps.push({
      title: 'Caso especial · Lenguaje vacio',
      body:
        `El automata no tiene ningun estado inicial (esto ocurre al invertir un automata sin estados finales), ` +
        `asi que no acepta ninguna cadena. La construccion parte del subconjunto ∅ y da como resultado el AFD ` +
        `minimo del lenguaje vacio: un unico estado trampa, no final, con un bucle por cada simbolo.`,
    })
  }

  // --- Paso 1: clausuras epsilon de cada estado individual -------------------
  if (hasEpsilon(nfa)) {
    steps.push({
      title: 'Paso 1 · Clausura-ε de cada estado',
      body:
        `La **clausura-ε** de un estado q es el conjunto de estados a los que se llega desde q ` +
        `usando solo transiciones ${EPSILON} (incluido el propio q). Es lo que permite eliminar las transiciones vacias.`,
      table: {
        caption: 'Clausura-ε individual',
        headers: ['Estado q', 'clausura-ε(q)'],
        rows: nfa.states.map((s) => [s.label, setLabel(nfa, epsilonClosure(nfa, [s.id]))]),
      },
    })
  } else {
    steps.push({
      title: 'Paso 1 · Sin transiciones ε',
      body: `El automata no tiene transiciones ${EPSILON}, asi que la clausura-ε de cada estado es el propio estado y se puede pasar directo a la construccion de subconjuntos.`,
    })
  }

  // --- Paso 2: construccion de subconjuntos ---------------------------------
  const key = (ids: string[]) => orderLike(nfa, ids).join('|')
  const start = epsilonClosure(nfa, inits.map((s) => s.id))
  const initLabel =
    inits.length === 0 ? '∅' : inits.length === 1 ? inits[0].label : `{${inits.map((s) => s.label).join(', ')}}`

  const subsets: string[][] = [start]
  const index = new Map<string, number>([[key(start), 0]])
  const delta = new Map<string, number>() // "i:sym" -> indice destino
  const traceRows: string[][] = []

  const nameFor = (i: number) => String.fromCharCode(65 + i) // A, B, C, ...
  const dfaName = (i: number) => (subsets[i].length === 0 ? '∅' : i < 26 ? nameFor(i) : `S${i}`)

  for (let i = 0; i < subsets.length; i++) {
    const T = subsets[i]
    const row = [`${i === 0 ? '→' : ''}${dfaName(i)} = ${setLabel(nfa, T)}`]
    for (const sym of alphabet) {
      const target = epsilonClosure(nfa, moveSet(nfa, T, sym))
      const k = key(target)
      let j = index.get(k)
      if (j === undefined) {
        j = subsets.length
        subsets.push(target)
        index.set(k, j)
      }
      delta.set(`${i}:${sym}`, j)
      row.push(target.length === 0 ? '∅' : `${dfaName(j)} = ${setLabel(nfa, target)}`)
    }
    traceRows.push(row)
  }

  steps.push({
    title: 'Paso 2 · Tabla de subconjuntos',
    body:
      `Se parte del estado inicial **${dfaName(0)} = clausura-ε(${initLabel}) = ${setLabel(nfa, start)}**` +
      (inits.length > 1
        ? ` (el automata tiene ${inits.length} estados iniciales, asi que se parte de la clausura-ε de todos ellos a la vez). `
        : '. ') +
      `Para cada subconjunto T y cada simbolo a se calcula **clausura-ε(δ(T, a))**. ` +
      `Cada subconjunto nuevo que aparece se agrega a la tabla y se procesa a su vez, hasta que no surjan mas.`,
    table: {
      caption: 'Cada fila es un estado del AFD; cada celda, el subconjunto de estados del AFN al que se llega',
      headers: ['Subconjunto', ...alphabet],
      rows: traceRows,
    },
  })

  // --- Paso 3: armar el AFD -------------------------------------------------
  const nfaFinals = new Set(finalStates(nfa).map((s) => s.id))
  const keepEmpty = opts.keepEmpty ?? true
  const used = subsets.map((_, i) => keepEmpty || subsets[i].length > 0 || i === 0)

  const states: State[] = []
  const idOf = new Map<number, string>()
  subsets.forEach((sub, i) => {
    if (!used[i]) return
    const s: State = {
      id: uid('d'),
      label: dfaName(i),
      x: 0,
      y: 0,
      isInitial: i === 0,
      isFinal: sub.some((q) => nfaFinals.has(q)),
    }
    idOf.set(i, s.id)
    states.push(s)
  })

  const transitions: Transition[] = []
  subsets.forEach((_, i) => {
    if (!used[i]) return
    for (const sym of alphabet) {
      const j = delta.get(`${i}:${sym}`)!
      if (!used[j]) continue
      transitions.push({ id: uid('t'), from: idOf.get(i)!, to: idOf.get(j)!, symbol: sym })
    }
  })

  const automaton = autoLayout({
    name: opts.name ?? 'AFD (subconjuntos)',
    alphabet,
    states,
    transitions,
  })

  const mapping = subsets
    .map((sub, i) => ({ dfaLabel: dfaName(i), nfaSet: sub, nfaLabel: setLabel(nfa, sub) }))
    .filter((_, i) => used[i])

  const finalList = states.filter((s) => s.isFinal).map((s) => s.label)
  steps.push({
    title: 'Paso 3 · AFD resultante',
    body:
      `Un estado del AFD es **final** si su subconjunto contiene al menos un estado final del AFN ` +
      `(finales del AFN: ${finalStates(nfa).map((s) => s.label).join(', ') || 'ninguno'}).\n` +
      `Finales del AFD: ${finalList.join(', ') || 'ninguno'}. ` +
      `El estado ∅ (si aparece) es el estado trampa: una vez ahi, ninguna cadena es aceptada.`,
    table: {
      caption: 'Equivalencia estado del AFD ↔ subconjunto del AFN',
      headers: ['Estado AFD', 'Subconjunto del AFN', '¿Final?'],
      rows: mapping.map((m) => [
        m.dfaLabel,
        m.nfaLabel,
        m.nfaSet.some((q) => nfaFinals.has(q)) ? 'Si' : 'No',
      ]),
    },
    automaton,
  })

  return { automaton, steps, mapping }
}
