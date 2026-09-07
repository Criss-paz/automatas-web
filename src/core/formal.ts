import { Automaton, EPSILON, State, Transition } from './types'
import { uid, inferAlphabet } from './automaton'
import { autoLayout } from './layout'

/**
 * Lector de la especificacion formal (quintupla) escrita como texto.
 *
 * Formato aceptado (el orden de las lineas no importa):
 *
 *   Q = {q0, q1, q2}
 *   S = {a, b}                 (tambien "Sigma", "alfabeto")
 *   inicial = q0               (tambien "q0 =", "inicio")
 *   F = {q2}                   (tambien "finales")
 *   q0, a -> q1                (transiciones: origen, simbolo -> destino)
 *   q0, b -> q0
 *   q1, e -> q2                (usar e, eps o ε para transicion vacia)
 */
export interface FormalParseResult {
  ok: boolean
  automaton?: Automaton
  errors: string[]
  warnings: string[]
}

const inBraces = (s: string): string[] =>
  s
    .replace(/[{}]/g, '')
    .split(/[,;\s]+/)
    .map((x) => x.trim())
    .filter(Boolean)

export function parseFormal(text: string): FormalParseResult {
  const errors: string[] = []
  const warnings: string[] = []

  let declaredStates: string[] = []
  let alphabet: string[] = []
  let initial = ''
  let finals: string[] = []
  const rawTransitions: Array<[string, string, string]> = []

  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && !l.startsWith('//'))

  for (const line of lines) {
    const low = line.toLowerCase()

    if (/^(q|estados)\s*[:=]/i.test(line)) {
      declaredStates = inBraces(line.split(/[:=]/).slice(1).join('='))
      continue
    }
    if (/^(s|sigma|σ|alfabeto)\s*[:=]/i.test(line)) {
      alphabet = inBraces(line.split(/[:=]/).slice(1).join('='))
      continue
    }
    if (/^(inicial|inicio|q0|estado inicial|start)\s*[:=]/i.test(low)) {
      initial = inBraces(line.split(/[:=]/).slice(1).join('='))[0] ?? ''
      continue
    }
    if (/^(f|finales|final|aceptacion|estados finales)\s*[:=]/i.test(low)) {
      finals = inBraces(line.split(/[:=]/).slice(1).join('='))
      continue
    }
    if (/^(δ|d|delta|transiciones)\s*[:=]?\s*$/i.test(low)) continue

    // Transiciones: "q0, a -> q1" | "q0 a q1" | "q0 -a-> q1"
    const m =
      line.match(/^(\S+)\s*[,;]\s*(\S+)\s*(?:->|=>|→|:)\s*(.+)$/) ||
      line.match(/^(\S+)\s*-\s*(\S+)\s*->\s*(.+)$/) ||
      line.match(/^(\S+)\s+(\S+)\s+(\S+)$/)

    if (m) {
      const from = m[1].trim()
      let sym = m[2].trim()
      if (/^(e|eps|epsilon|lambda|l|vacia|_)$/i.test(sym)) sym = EPSILON
      for (const to of m[3].split(/[,;|]/).map((x) => x.trim()).filter(Boolean)) {
        rawTransitions.push([from, sym, to.replace(/[{}]/g, '')])
      }
      continue
    }

    warnings.push(`No se entendio la linea: "${line}" (se ignoro).`)
  }

  // Estados: los declarados mas los que aparezcan en las transiciones.
  const stateNames = [...declaredStates]
  const addState = (n: string) => {
    if (n && !stateNames.includes(n)) stateNames.push(n)
  }
  if (initial) addState(initial)
  for (const [f, , t] of rawTransitions) {
    addState(f)
    addState(t)
  }
  for (const f of finals) addState(f)

  if (stateNames.length === 0) errors.push('No se declaro ningun estado ni ninguna transicion.')
  if (!initial) {
    if (stateNames.length) {
      initial = stateNames[0]
      warnings.push(`No se indico el estado inicial; se tomo el primero: ${initial}.`)
    } else {
      errors.push('No se indico el estado inicial (escribe por ejemplo "inicial = q0").')
    }
  }
  if (finals.length === 0) warnings.push('No se declararon estados finales: el automata no aceptara ninguna cadena.')

  for (const f of finals) {
    if (!stateNames.includes(f)) errors.push(`El estado final "${f}" no existe.`)
  }

  if (errors.length) return { ok: false, errors, warnings }

  const states: State[] = stateNames.map((n) => ({
    id: uid('f'),
    label: n,
    x: 0,
    y: 0,
    isInitial: n === initial,
    isFinal: finals.includes(n),
  }))
  const byName = new Map(states.map((s) => [s.label, s]))

  const transitions: Transition[] = rawTransitions.map(([f, sym, t]) => ({
    id: uid('t'),
    from: byName.get(f)!.id,
    to: byName.get(t)!.id,
    symbol: sym,
  }))

  let automaton: Automaton = { name: 'Automata (especificacion formal)', alphabet, states, transitions }
  automaton.alphabet = alphabet.length ? alphabet.filter((s) => s !== EPSILON) : inferAlphabet(automaton)

  const declaredSet = new Set(automaton.alphabet)
  for (const t of transitions) {
    if (t.symbol !== EPSILON && !declaredSet.has(t.symbol)) {
      warnings.push(`El simbolo "${t.symbol}" se usa en una transicion pero no estaba en el alfabeto; se agrego.`)
      automaton.alphabet.push(t.symbol)
      declaredSet.add(t.symbol)
    }
  }
  automaton.alphabet.sort()

  return { ok: true, automaton: autoLayout(automaton), errors, warnings }
}

/** Serializa un automata al mismo formato de texto (para exportar / editar). */
export function toFormal(a: Automaton): string {
  const lines = [
    `Q = {${a.states.map((s) => s.label).join(', ')}}`,
    `Sigma = {${a.alphabet.join(', ')}}`,
    `inicial = ${a.states.find((s) => s.isInitial)?.label ?? ''}`,
    `F = {${a.states.filter((s) => s.isFinal).map((s) => s.label).join(', ')}}`,
    'delta:',
  ]
  const lab = (id: string) => a.states.find((s) => s.id === id)?.label ?? '?'
  for (const t of a.transitions) lines.push(`${lab(t.from)}, ${t.symbol} -> ${lab(t.to)}`)
  return lines.join('\n')
}
