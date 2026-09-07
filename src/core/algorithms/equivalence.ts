import { Automaton, EPSILON, Step } from '../types'
import {
  cloneAutomaton,
  completeDFA,
  inferAlphabet,
  initialState,
  initialStates,
  isDeterministic,
  move,
  joinWord,
  removeUnreachable,
  tokenizeWord,
  transitionTable,
} from '../automaton'
import { subsetConstruction } from './subset'

export interface EquivalenceResult {
  equivalent: boolean
  /** Cadena mas corta aceptada por uno y rechazada por el otro (si no son equivalentes). */
  counterexample?: { word: string; acceptedBy: string; rejectedBy: string }
  steps: Step[]
}

/**
 * Verificacion de equivalencia de dos automatas por CONSTRUCCION DEL PRODUCTO.
 *
 * Se recorre en anchura el automata producto A x B partiendo del par de estados
 * iniciales. Si se alcanza un par (p, q) donde uno es final y el otro no, esa es
 * la prueba de que NO son equivalentes, y el camino recorrido es la cadena
 * contraejemplo mas corta. Si se agota el recorrido sin encontrar ese par,
 * los dos automatas aceptan exactamente el mismo lenguaje.
 */
export function checkEquivalence(
  a1: Automaton,
  a2: Automaton,
  names: [string, string] = ['Automata 1', 'Automata 2'],
): EquivalenceResult {
  const steps: Step[] = []
  const alphabet = [...new Set([...inferAlphabet(a1), ...inferAlphabet(a2)])].sort()

  // --- Paso 1: llevar ambos a AFD completo ---------------------------------
  const prep = (a: Automaton, name: string): Automaton => {
    let x: Automaton = { ...cloneAutomaton(a, name), alphabet }
    if (!isDeterministic(x)) {
      x = subsetConstruction(x, { name: `${name} determinizado` }).automaton
      x.alphabet = alphabet
    }
    x = removeUnreachable(x).automaton
    x = completeDFA(x).automaton
    x.alphabet = alphabet
    return x
  }

  const A = prep(a1, names[0])
  const B = prep(a2, names[1])

  steps.push({
    title: 'Paso 1 · Preparar los dos automatas',
    body:
      `Se unifica el alfabeto de ambos: Σ = {${alphabet.join(', ')}}. ` +
      `Si alguno era un AFN se determiniza, y a los dos se les agrega estado trampa donde falte una transicion, ` +
      `para que δ este definida siempre y el recorrido en paralelo no se atore.`,
    table: { caption: `${names[0]} preparado`, ...transitionTable(A) },
    automaton: A,
  })
  steps.push({
    title: 'Paso 1b · Segundo automata preparado',
    table: { caption: `${names[1]} preparado`, ...transitionTable(B) },
    automaton: B,
  })

  const iA = initialState(A)
  const iB = initialState(B)
  if (!iA || !iB) {
    steps.push({
      title: 'Error',
      body: 'Alguno de los dos automatas no tiene estado inicial definido; no se puede comparar.',
    })
    return { equivalent: false, steps }
  }

  const labA = (id: string) => A.states.find((s) => s.id === id)!.label
  const labB = (id: string) => B.states.find((s) => s.id === id)!.label
  const finA = (id: string) => A.states.find((s) => s.id === id)!.isFinal
  const finB = (id: string) => B.states.find((s) => s.id === id)!.isFinal
  const goA = (id: string, sym: string) => move(A, id, sym)[0]
  const goB = (id: string, sym: string) => move(B, id, sym)[0]

  // --- Paso 2: recorrido del producto --------------------------------------
  interface Node {
    p: string
    q: string
    /** Simbolos leidos para llegar aqui; se unen al final para formar la cadena. */
    syms: string[]
  }
  const start: Node = { p: iA.id, q: iB.id, syms: [] }
  const seen = new Set<string>([`${start.p}|${start.q}`])
  const queue: Node[] = [start]
  const rows: string[][] = []
  let bad: Node | null = null

  while (queue.length) {
    const node = queue.shift()!
    const fa = finA(node.p)
    const fb = finB(node.q)
    const pairName = `(${labA(node.p)}, ${labB(node.q)})`
    const status = fa === fb ? (fa ? 'ambos finales ✓' : 'ninguno final ✓') : '¡DIFIEREN! ✗'
    const nodeWord = joinWord(alphabet, node.syms)
    const row = [nodeWord === '' ? 'ε' : nodeWord, pairName, status]

    if (fa !== fb) {
      rows.push(row)
      bad = node
      break
    }

    for (const sym of alphabet) {
      const np = goA(node.p, sym)
      const nq = goB(node.q, sym)
      const k = `${np}|${nq}`
      row.push(`${sym} → (${labA(np)}, ${labB(nq)})`)
      if (!seen.has(k)) {
        seen.add(k)
        queue.push({ p: np, q: nq, syms: [...node.syms, sym] })
      }
    }
    rows.push(row)
  }

  steps.push({
    title: 'Paso 2 · Recorrido en paralelo (automata producto)',
    body:
      `Se parte del par de estados iniciales **(${labA(iA.id)}, ${labB(iB.id)})** y se avanza en los dos automatas a la vez con cada simbolo. ` +
      `Cada par visitado se registra una sola vez. Se comprueba en cada par que **ambos estados coincidan** en ser finales o no serlo.`,
    table: {
      caption: 'Recorrido BFS del producto: cadena leida, par alcanzado y comprobacion',
      headers: ['Cadena', 'Par (A, B)', 'Comprobacion', ...alphabet.map((s) => `con ${s}`)],
      rows,
    },
  })

  // --- Paso 3: conclusion ---------------------------------------------------
  if (bad) {
    const badWord = joinWord(alphabet, bad.syms)
    const w = badWord === '' ? 'ε (cadena vacia)' : badWord
    const acceptedBy = finA(bad.p) ? names[0] : names[1]
    const rejectedBy = finA(bad.p) ? names[1] : names[0]
    steps.push({
      title: 'Paso 3 · Conclusion: NO son equivalentes',
      body:
        `Se alcanzo el par (${labA(bad.p)}, ${labB(bad.q)}) donde uno es final y el otro no. ` +
        `La cadena **"${w}"** es un **contraejemplo**: **${acceptedBy}** la acepta y **${rejectedBy}** la rechaza. ` +
        `Basta una sola cadena con distinto veredicto para probar que los lenguajes son distintos.`,
      bullets: [
        `Contraejemplo mas corto: "${w}"`,
        `La acepta: ${acceptedBy}`,
        `La rechaza: ${rejectedBy}`,
      ],
    })
    return {
      equivalent: false,
      counterexample: { word: badWord, acceptedBy, rejectedBy },
      steps,
    }
  }

  steps.push({
    title: 'Paso 3 · Conclusion: SI son equivalentes',
    body:
      `Se recorrieron los ${seen.size} pares alcanzables sin encontrar ninguno en el que un automata acepte y el otro no. ` +
      `Como el recorrido cubre **todas** las cadenas posibles (cada cadena lleva a exactamente un par), ` +
      `los dos automatas aceptan el mismo lenguaje: **L(${names[0]}) = L(${names[1]})**.`,
    bullets: [
      `Pares alcanzables revisados: ${seen.size}`,
      'Ningun par con veredicto distinto ⇒ no existe cadena que los distinga.',
    ],
  })
  return { equivalent: true, steps }
}

/**
 * Comprobacion adicional por fuerza bruta: prueba todas las cadenas hasta cierta
 * longitud en ambos automatas. No demuestra la equivalencia por si sola, pero
 * sirve como verificacion independiente del resultado del producto.
 */
export function bruteForceCompare(
  a1: Automaton,
  a2: Automaton,
  maxLen = 6,
): { tested: number; mismatches: Array<{ word: string; r1: boolean; r2: boolean }>; rows: string[][] } {
  const alphabet = [...new Set([...inferAlphabet(a1), ...inferAlphabet(a2)])].sort()
  const mismatches: Array<{ word: string; r1: boolean; r2: boolean }> = []
  const rows: string[][] = []
  // Se generan como listas de simbolos y se unen al final: con simbolos de
  // varios caracteres concatenar sin separador seria ambiguo.
  let words: string[][] = [[]]
  let tested = 0

  for (let len = 0; len <= maxLen; len++) {
    if (len > 0) {
      const next: string[][] = []
      for (const w of words) for (const s of alphabet) next.push([...w, s])
      words = next
    }
    if (words.length > 4000) break
    for (const syms of words) {
      const w = joinWord(alphabet, syms)
      tested++
      const r1 = accepts(a1, w)
      const r2 = accepts(a2, w)
      if (r1 !== r2) mismatches.push({ word: w, r1, r2 })
      if (rows.length < 40) {
        rows.push([w === '' ? 'ε' : w, r1 ? 'acepta' : 'rechaza', r2 ? 'acepta' : 'rechaza', r1 === r2 ? '✓' : '✗'])
      }
    }
  }
  return { tested, mismatches, rows }
}

/** Simulacion de una cadena sobre un automata cualquiera (AFD o AFN con ε). */
export function accepts(a: Automaton, word: string): boolean {
  const { accepted } = simulate(a, word)
  return accepted
}

export interface SimulationResult {
  accepted: boolean
  /** Filas: [posicion, simbolo leido, conjunto de estados actuales] */
  rows: string[][]
  message: string
}

/** Simula la lectura de una cadena y devuelve el rastro paso a paso. */
export function simulate(a: Automaton, word: string): SimulationResult {
  const inits = initialStates(a)
  if (inits.length === 0) return { accepted: false, rows: [], message: 'El automata no tiene estado inicial.' }

  const closure = (set: string[]): string[] => {
    const seen = new Set(set)
    const stack = [...set]
    while (stack.length) {
      const q = stack.pop()!
      for (const r of move(a, q, EPSILON)) {
        if (!seen.has(r)) {
          seen.add(r)
          stack.push(r)
        }
      }
    }
    return [...seen]
  }
  const lab = (id: string) => a.states.find((s) => s.id === id)?.label ?? '?'
  const show = (set: string[]) => (set.length ? '{' + set.map(lab).join(', ') + '}' : '∅ (bloqueado)')

  let current = closure(inits.map((s) => s.id))
  const rows: string[][] = [['0', '—', show(current), 'estado inicial + clausura-ε']]

  // La cadena se parte en simbolos del alfabeto: con simbolos de varios
  // caracteres no basta con recorrerla caracter a caracter.
  const { tokens, error } = tokenizeWord(a.alphabet, word)
  if (error) return { accepted: false, rows, message: error }

  for (let i = 0; i < tokens.length; i++) {
    const sym = tokens[i]
    const next = closure(current.flatMap((q) => move(a, q, sym)))
    rows.push([String(i + 1), sym, show(next), next.length === 0 ? 'no hay transicion: se rechaza' : ''])
    current = next
    if (current.length === 0) break
  }

  const finals = current.filter((q) => a.states.find((s) => s.id === q)?.isFinal)
  const accepted = finals.length > 0
  return {
    accepted,
    rows,
    message: accepted
      ? `ACEPTADA: al terminar la cadena se esta en ${show(finals)}, que contiene estado(s) final(es).`
      : `RECHAZADA: al terminar la cadena se esta en ${show(current)}, sin ningun estado final.`,
  }
}
