import { Automaton, EPSILON, State, Transition } from './types'

let counter = 0
export const uid = (p = 'id') => `${p}_${++counter}_${Math.random().toString(36).slice(2, 7)}`

export function emptyAutomaton(name = 'Automata'): Automaton {
  return { name, alphabet: [], states: [], transitions: [] }
}

export function initialState(a: Automaton): State | undefined {
  return a.states.find((s) => s.isInitial)
}

/**
 * Todos los estados iniciales. Un AFD tiene exactamente uno, pero el automata
 * invertido de Brzozowski puede tener varios (los finales del original), y la
 * determinizacion arranca desde la clausura-ε del conjunto completo.
 */
export function initialStates(a: Automaton): State[] {
  return a.states.filter((s) => s.isInitial)
}

export function finalStates(a: Automaton): State[] {
  return a.states.filter((s) => s.isFinal)
}

export function stateById(a: Automaton, id: string): State | undefined {
  return a.states.find((s) => s.id === id)
}

export function labelOf(a: Automaton, id: string): string {
  return stateById(a, id)?.label ?? '?'
}

/** delta(q, s) -> conjunto de estados destino (sin clausura). */
export function move(a: Automaton, from: string, symbol: string): string[] {
  const out: string[] = []
  for (const t of a.transitions) {
    if (t.from === from && t.symbol === symbol && !out.includes(t.to)) out.push(t.to)
  }
  return out
}

/** delta extendida a un conjunto de estados. */
export function moveSet(a: Automaton, set: string[], symbol: string): string[] {
  const out = new Set<string>()
  for (const q of set) for (const r of move(a, q, symbol)) out.add(r)
  return [...out]
}

/** Clausura-epsilon de un conjunto de estados (cierre transitivo por EPSILON). */
export function epsilonClosure(a: Automaton, set: string[]): string[] {
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
  return orderLike(a, [...seen])
}

/** Ordena ids segun el orden en a.states, para que las salidas sean estables. */
export function orderLike(a: Automaton, ids: string[]): string[] {
  const idx = new Map(a.states.map((s, i) => [s.id, i]))
  return [...ids].sort((x, y) => (idx.get(x) ?? 0) - (idx.get(y) ?? 0))
}

export function setLabel(a: Automaton, ids: string[]): string {
  if (ids.length === 0) return '∅'
  return '{' + orderLike(a, ids).map((i) => labelOf(a, i)).join(',') + '}'
}

export function hasEpsilon(a: Automaton): boolean {
  return a.transitions.some((t) => t.symbol === EPSILON)
}

/** Un AFD no tiene epsilon y tiene a lo sumo un destino por (estado, simbolo). */
export function isDeterministic(a: Automaton): boolean {
  if (hasEpsilon(a)) return false
  if (a.states.filter((s) => s.isInitial).length > 1) return false
  for (const s of a.states) {
    for (const sym of a.alphabet) {
      if (move(a, s.id, sym).length > 1) return false
    }
  }
  return true
}

/** Un AFD es completo si define exactamente una transicion por (estado, simbolo). */
export function isComplete(a: Automaton): boolean {
  return a.states.every((s) => a.alphabet.every((sym) => move(a, s.id, sym).length === 1))
}

/** Diagnostico legible de por que un automata no es AFD. */
export function determinismReport(a: Automaton): string[] {
  const msgs: string[] = []
  if (hasEpsilon(a)) msgs.push(`Tiene transiciones ${EPSILON} (vacias).`)
  for (const s of a.states) {
    for (const sym of a.alphabet) {
      const d = move(a, s.id, sym)
      if (d.length > 1) {
        msgs.push(
          `El estado ${s.label} tiene ${d.length} destinos con "${sym}": ${d.map((x) => labelOf(a, x)).join(', ')}.`,
        )
      }
    }
  }
  const init = a.states.filter((s) => s.isInitial)
  if (init.length === 0) msgs.push('No hay estado inicial definido.')
  if (init.length > 1) msgs.push(`Hay ${init.length} estados iniciales (un AFD admite solo uno).`)
  return msgs
}

/** Estados alcanzables desde los iniciales. */
export function reachableStates(a: Automaton): Set<string> {
  const inits = initialStates(a)
  const seen = new Set<string>()
  if (inits.length === 0) return seen
  const stack = inits.map((s) => s.id)
  for (const id of stack) seen.add(id)
  while (stack.length) {
    const q = stack.pop()!
    for (const t of a.transitions) {
      if (t.from === q && !seen.has(t.to)) {
        seen.add(t.to)
        stack.push(t.to)
      }
    }
  }
  return seen
}

/** Elimina estados inalcanzables desde el inicial. */
export function removeUnreachable(a: Automaton): { automaton: Automaton; removed: string[] } {
  const keep = reachableStates(a)
  const removed = a.states.filter((s) => !keep.has(s.id)).map((s) => s.label)
  return {
    automaton: {
      ...a,
      states: a.states.filter((s) => keep.has(s.id)),
      transitions: a.transitions.filter((t) => keep.has(t.from) && keep.has(t.to)),
    },
    removed,
  }
}

/** Estados desde los que NO se puede llegar a un final (estados muertos). */
export function coReachableStates(a: Automaton): Set<string> {
  const seen = new Set(finalStates(a).map((s) => s.id))
  let changed = true
  while (changed) {
    changed = false
    for (const t of a.transitions) {
      if (seen.has(t.to) && !seen.has(t.from)) {
        seen.add(t.from)
        changed = true
      }
    }
  }
  return seen
}

/** Completa un AFD agregando estado trampa donde falten transiciones. */
export function completeDFA(a: Automaton): { automaton: Automaton; added: boolean; trapLabel: string } {
  const missing: Array<[string, string]> = []
  for (const s of a.states) {
    for (const sym of a.alphabet) {
      if (move(a, s.id, sym).length === 0) missing.push([s.id, sym])
    }
  }
  if (missing.length === 0) return { automaton: a, added: false, trapLabel: '' }

  const used = new Set(a.states.map((s) => s.label))
  let trapLabel = 'T'
  let n = 1
  while (used.has(trapLabel)) trapLabel = `T${n++}`

  const trap: State = {
    id: uid('trap'),
    label: trapLabel,
    x: 0,
    y: 0,
    isInitial: a.states.length === 0,
    isFinal: false,
  }
  const transitions = [...a.transitions]
  for (const [from, sym] of missing) transitions.push({ id: uid('t'), from, to: trap.id, symbol: sym })
  for (const sym of a.alphabet) transitions.push({ id: uid('t'), from: trap.id, to: trap.id, symbol: sym })

  return { automaton: { ...a, states: [...a.states, trap], transitions }, added: true, trapLabel }
}

/**
 * Invierte el automata: voltea todas las flechas, los finales pasan a iniciales
 * y el inicial pasa a final.
 *
 * Cuando hay varios estados finales el reverso queda con VARIOS estados
 * iniciales. Se dejan asi a proposito, en vez de unirlos a un inicial nuevo con
 * transiciones ε: ese estado postizo no pertenece al automata original y haria
 * que la determinizacion distinguiera subconjuntos que solo se diferencian en
 * el, rompiendo la garantia de minimalidad de Brzozowski. La determinizacion
 * arranca desde la clausura-ε del conjunto de todos los iniciales.
 */
export function reverseAutomaton(a: Automaton, name = 'Reverso'): Automaton {
  const states: State[] = a.states.map((s) => ({ ...s, isInitial: false, isFinal: false }))
  const byId = new Map(states.map((s) => [s.id, s]))

  for (const q of initialStates(a)) byId.get(q.id)!.isFinal = true
  for (const f of finalStates(a)) byId.get(f.id)!.isInitial = true

  const transitions: Transition[] = a.transitions.map((t) => ({
    id: uid('t'),
    from: t.to,
    to: t.from,
    symbol: t.symbol,
  }))

  return { name, alphabet: [...a.alphabet], states, transitions }
}

/** Renombra los estados a q0, q1, ... dejando el inicial como q0. */
export function renameSequential(a: Automaton, prefix = 'q'): Automaton {
  const init = initialState(a)
  const ordered = init ? [init, ...a.states.filter((s) => s.id !== init.id)] : [...a.states]
  const map = new Map<string, string>()
  ordered.forEach((s, i) => map.set(s.id, `${prefix}${i}`))
  return { ...a, states: a.states.map((s) => ({ ...s, label: map.get(s.id)! })) }
}

/** Deduplica transiciones identicas. */
export function dedupeTransitions(a: Automaton): Automaton {
  const seen = new Set<string>()
  const transitions = a.transitions.filter((t) => {
    const k = `${t.from}|${t.symbol}|${t.to}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  return { ...a, transitions }
}

/** Alfabeto deducido de las transiciones (sin epsilon), unido al declarado. */
export function inferAlphabet(a: Automaton): string[] {
  const set = new Set(a.alphabet)
  for (const t of a.transitions) if (t.symbol !== EPSILON) set.add(t.symbol)
  return [...set].sort()
}

/** Tabla de transiciones lista para mostrar en pantalla. */
export function transitionTable(a: Automaton): { headers: string[]; rows: string[][] } {
  const syms = [...a.alphabet]
  if (hasEpsilon(a)) syms.push(EPSILON)
  const headers = ['δ', ...syms]
  const rows = a.states.map((s) => {
    const mark = (s.isInitial ? '→' : '') + (s.isFinal ? '*' : '')
    const row = [mark + s.label]
    for (const sym of syms) {
      const d = move(a, s.id, sym)
      row.push(d.length ? d.map((x) => labelOf(a, x)).join(', ') : '∅')
    }
    return row
  })
  return { headers, rows }
}

export function cloneAutomaton(a: Automaton, name?: string): Automaton {
  return {
    name: name ?? a.name,
    alphabet: [...a.alphabet],
    states: a.states.map((s) => ({ ...s })),
    transitions: a.transitions.map((t) => ({ ...t })),
  }
}

// ---------------------------------------------------------------------------
// Alfabetos con simbolos de mas de un caracter
// ---------------------------------------------------------------------------

/**
 * Un alfabeto es "simple" si todos sus simbolos ocupan un solo caracter. En ese
 * caso una cadena se lee caracter a caracter, que es el caso habitual (a, b, 0, 1).
 */
export function isSimpleAlphabet(alphabet: string[]): boolean {
  return alphabet.every((s) => [...s].length === 1)
}

/**
 * Une una lista de simbolos en una cadena legible. Con simbolos de varios
 * caracteres hace falta un separador para que la cadena se pueda volver a leer:
 * "id num id" en vez de "idnumid".
 */
export function joinWord(alphabet: string[], symbols: string[]): string {
  return symbols.join(isSimpleAlphabet(alphabet) ? '' : ' ')
}

export interface TokenizeResult {
  tokens: string[]
  /** Mensaje de error si la cadena no se pudo leer con este alfabeto. */
  error?: string
}

/**
 * Parte una cadena en simbolos del alfabeto.
 *
 * Con alfabeto simple es partir por caracteres. Con simbolos largos se toma
 * siempre el simbolo mas largo que encaje (maximal munch) y se permiten
 * espacios o comas como separadores explicitos, que es como se escriben estas
 * cadenas a mano.
 */
export function tokenizeWord(alphabet: string[], word: string): TokenizeResult {
  if (word === '') return { tokens: [] }

  if (isSimpleAlphabet(alphabet)) {
    const tokens = [...word]
    const bad = tokens.findIndex((c) => !alphabet.includes(c))
    if (bad >= 0) {
      return {
        tokens: tokens.slice(0, bad),
        error: `El simbolo "${tokens[bad]}" (posicion ${bad + 1}) no pertenece al alfabeto Σ = {${alphabet.join(', ')}}.`,
      }
    }
    return { tokens }
  }

  // Los mas largos primero: asi "ab" gana sobre "a" cuando ambos existen.
  const sorted = [...alphabet].sort((x, y) => y.length - x.length)
  const tokens: string[] = []
  let i = 0
  while (i < word.length) {
    if (/[\s,;]/.test(word[i])) {
      i++
      continue
    }
    const hit = sorted.find((s) => word.startsWith(s, i))
    if (!hit) {
      return {
        tokens,
        error:
          `No se pudo leer la cadena a partir de la posicion ${i + 1} ("${word.slice(i, i + 8)}"). ` +
          `El alfabeto es Σ = {${alphabet.join(', ')}}; como tiene simbolos de varios caracteres, ` +
          `puedes separarlos con espacios.`,
      }
    }
    tokens.push(hit)
    i += hit.length
  }
  return { tokens }
}
