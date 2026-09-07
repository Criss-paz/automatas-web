import { Automaton, EPSILON, State, Transition } from './types'
import { uid, inferAlphabet } from './automaton'
import { autoLayout } from './layout'

/**
 * Lector de la especificacion formal (quintupla) escrita como texto.
 *
 * Acepta a proposito muchas formas distintas, porque cada libro y cada profesor
 * la escribe de una manera. Todas estas entradas son validas:
 *
 * 1) Por lineas (el orden no importa):
 *      Q = {q0, q1, q2}
 *      Sigma = {a, b}            (tambien "S", "Σ", "alfabeto")
 *      inicial = q0              (tambien "q0 =", "inicio", "start")
 *      F = {q2}                  (tambien "finales", "aceptacion")
 *      q0, a -> q1               (transiciones)
 *
 * 2) Transiciones en cualquiera de estos estilos:
 *      q0, a -> q1        q0 -a-> q1        q0 --a--> q1
 *      d(q0, a) = q1      δ(q0,a)=q1        q0 a q1
 *      q0 -> q1 [a]       q0 -> q1 : a
 *      q0, a|b -> q1      q0, {a,b} -> q1   (varios simbolos)
 *      q0, a -> q1, q2    q0, a -> {q1,q2}  (varios destinos: AFN)
 *      q0, a -> -         q0, a -> ∅        (sin destino)
 *
 * 3) Tabla de transiciones (como se dibuja en el cuaderno):
 *      δ    | a  | b
 *      ->q0 | q1 | q0
 *      *q1  | q1 | q2
 *
 * 4) JSON, para intercambiar con otras herramientas:
 *      {"alphabet":["a","b"],"initial":"q0","finals":["q1"],
 *       "transitions":[["q0","a","q1"]]}
 *
 * Marcas en el nombre de un estado: "->q0" o "→q0" lo hacen inicial,
 * "*q1" o "q1*" lo hacen final. Se pueden combinar: "->*q0".
 */
export interface FormalParseResult {
  ok: boolean
  automaton?: Automaton
  errors: string[]
  warnings: string[]
  /** Formato que se reconocio, para poder explicarlo al usuario. */
  format?: 'lineas' | 'tabla' | 'json'
}

const EPSILON_NAMES = /^(e|eps|epsilon|epsilón|lambda|l|λ|ε|vacia|vacío|vacio|_|-)$/i

const normalizeSymbol = (s: string): string => (EPSILON_NAMES.test(s.trim()) ? EPSILON : s.trim())

const inBraces = (s: string): string[] =>
  s
    .replace(/[{}]/g, ' ')
    .split(/[,;\s]+/)
    .map((x) => x.trim())
    .filter(Boolean)

/** Separa las marcas "->" (inicial) y "*" (final) del nombre de un estado. */
export function parseStateName(raw: string): { name: string; initial: boolean; final: boolean } {
  let s = raw.trim()
  let initial = false
  let final = false
  for (;;) {
    const before = s
    if (/^(->|=>|→|>)/.test(s)) {
      s = s.replace(/^(->|=>|→|>)/, '').trim()
      initial = true
    }
    if (/^[*+•]/.test(s)) {
      s = s.replace(/^[*+•]/, '').trim()
      final = true
    }
    if (/[*+•]$/.test(s)) {
      s = s.replace(/[*+•]$/, '').trim()
      final = true
    }
    // "(q1)" tambien se usa para marcar un estado final
    if (/^\(.+\)$/.test(s)) {
      s = s.slice(1, -1).trim()
      final = true
    }
    if (s === before) break
  }
  return { name: s, initial, final }
}

interface Collected {
  declaredStates: string[]
  alphabet: string[]
  initials: string[]
  finals: string[]
  transitions: Array<[string, string, string]>
  format: 'lineas' | 'tabla' | 'json'
}

export function parseFormal(text: string): FormalParseResult {
  const errors: string[] = []
  const warnings: string[] = []

  const trimmed = text.trim()
  if (!trimmed) return { ok: false, errors: ['La especificacion esta vacia.'], warnings }

  let data: Collected
  try {
    data = trimmed.startsWith('{') && trimmed.includes('"')
      ? collectFromJson(trimmed, warnings)
      : collectFromText(trimmed, warnings)
  } catch (e) {
    return { ok: false, errors: [(e as Error).message], warnings }
  }

  return assemble(data, errors, warnings)
}

// ---------------------------------------------------------------------------
// JSON
// ---------------------------------------------------------------------------

function collectFromJson(text: string, warnings: string[]): Collected {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (e) {
    throw new Error(`El texto empieza como JSON pero no se pudo leer: ${(e as Error).message}`)
  }
  const o = raw as Record<string, unknown>
  const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : [])

  const initials = [
    ...arr(o.initials ?? o.iniciales),
    ...(typeof o.initial === 'string' ? [o.initial] : []),
    ...(typeof o.inicial === 'string' ? [o.inicial] : []),
    ...(typeof o.start === 'string' ? [o.start] : []),
  ]

  const transitions: Array<[string, string, string]> = []
  const rawT = o.transitions ?? o.transiciones ?? o.delta
  if (Array.isArray(rawT)) {
    for (const t of rawT) {
      if (Array.isArray(t) && t.length >= 3) {
        transitions.push([String(t[0]), normalizeSymbol(String(t[1])), String(t[2])])
      } else if (t && typeof t === 'object') {
        const r = t as Record<string, unknown>
        const from = String(r.from ?? r.origen ?? r.desde ?? '')
        const sym = normalizeSymbol(String(r.symbol ?? r.simbolo ?? r.input ?? ''))
        const to = r.to ?? r.destino ?? r.hacia
        for (const dest of Array.isArray(to) ? to : [to]) {
          if (from && dest !== undefined) transitions.push([from, sym, String(dest)])
        }
      }
    }
  } else {
    warnings.push('El JSON no traia una lista "transitions": el automata quedara sin transiciones.')
  }

  return {
    declaredStates: arr(o.states ?? o.estados ?? o.Q),
    alphabet: arr(o.alphabet ?? o.alfabeto ?? o.sigma ?? o.Sigma).map(normalizeSymbol),
    initials,
    finals: arr(o.finals ?? o.finales ?? o.accepting ?? o.F),
    transitions,
    format: 'json',
  }
}

// ---------------------------------------------------------------------------
// Texto: declaraciones, transiciones sueltas y tablas
// ---------------------------------------------------------------------------

/**
 * ¿La linea es una fila de tabla ("a | b | c")?
 *
 * Primero se quitan los bordes de las tablas estilo markdown ("| a | b |"),
 * porque si no la marca "->q0" de la primera celda se confundiria con la flecha
 * de una transicion. Despues de eso, una transicion con varios simbolos
 * ("q0, a|b -> q1") se distingue porque lleva flecha tras la primera barra.
 */
function looksLikeTableRow(line: string): boolean {
  if (!line.includes('|')) return false
  const core = line.replace(/^\s*\|/, '').replace(/\|\s*$/, '')
  if (!core.includes('|')) return false
  if (/->|=>|→/.test(core.slice(core.indexOf('|') + 1))) return false
  return true
}

function collectFromText(text: string, warnings: string[]): Collected {
  const declaredStates: string[] = []
  const alphabet: string[] = []
  const initials: string[] = []
  const finals: string[] = []
  const transitions: Array<[string, string, string]> = []
  let usedTable = false

  const lines = text
    .split('\n')
    .map((l, idx) => ({ n: idx + 1, text: l.replace(/^﻿/, '').trim() }))
    .filter((l) => l.text && !l.text.startsWith('#') && !l.text.startsWith('//'))

  /** Filas de tabla pendientes de interpretar (la primera es el encabezado). */
  const tableRows: Array<{ n: number; cells: string[] }> = []

  for (const line of lines) {
    const l = line.text
    const low = l.toLowerCase()

    // --- declaraciones ---------------------------------------------------
    if (/^(q|estados|states)\s*[:=]/i.test(l)) {
      for (const raw of inBraces(afterAssign(l))) {
        const p = parseStateName(raw)
        if (!declaredStates.includes(p.name)) declaredStates.push(p.name)
        if (p.initial) initials.push(p.name)
        if (p.final) finals.push(p.name)
      }
      continue
    }
    if (/^(s|sigma|σ|alfabeto|alphabet|simbolos|entradas)\s*[:=]/i.test(l)) {
      for (const s of inBraces(afterAssign(l))) {
        const sym = normalizeSymbol(s)
        if (sym !== EPSILON && !alphabet.includes(sym)) alphabet.push(sym)
      }
      continue
    }
    if (/^(inicial(es)?|inicio|q0|estado inicial|start|initial)\s*[:=]/i.test(low)) {
      for (const s of inBraces(afterAssign(l))) initials.push(parseStateName(s).name)
      continue
    }
    if (/^(f|finales?|aceptacion|aceptación|estados finales|accepting|final states)\s*[:=]/i.test(low)) {
      for (const s of inBraces(afterAssign(l))) finals.push(parseStateName(s).name)
      continue
    }
    // Encabezado suelto "delta:" / "transiciones:"
    if (/^(δ|d|delta|transiciones|transitions|funcion de transicion)\s*[:=]?\s*$/i.test(low)) continue

    // --- tabla de transiciones -------------------------------------------
    if (looksLikeTableRow(l)) {
      // Se descartan las lineas de separacion tipo |---|---|
      if (/^[\s|:-]+$/.test(l)) continue
      tableRows.push({ n: line.n, cells: l.split('|').map((c) => c.trim()) })
      continue
    }

    // --- transiciones sueltas --------------------------------------------
    const parsed = parseTransitionLine(l)
    if (parsed) {
      for (const sym of parsed.symbols) {
        for (const to of parsed.targets) transitions.push([parsed.from, sym, to])
      }
      initials.push(...parsed.initialMarks)
      finals.push(...parsed.finalMarks)
      continue
    }

    warnings.push(`Linea ${line.n}: no se entendio "${l}" y se ignoro.`)
  }

  if (tableRows.length) {
    usedTable = true
    readTable(tableRows, { declaredStates, alphabet, initials, finals, transitions }, warnings)
  }

  return { declaredStates, alphabet, initials, finals, transitions, format: usedTable ? 'tabla' : 'lineas' }
}

const afterAssign = (line: string): string => line.slice(line.search(/[:=]/) + 1)

/** Divide la lista de simbolos de una transicion: "a|b", "{a,b}", "a". */
function splitSymbols(raw: string): string[] {
  const inner = raw.replace(/[{}]/g, ' ').trim()
  const parts = inner.split(/\s*[|,;]\s*|\s+/).map((x) => x.trim()).filter(Boolean)
  return (parts.length ? parts : [inner]).map(normalizeSymbol)
}

/** Divide la lista de destinos: "q1", "q1,q2", "{q1,q2}", "-" (ninguno). */
function splitTargets(raw: string): Array<{ name: string; initial: boolean; final: boolean }> {
  const s = raw.trim()
  if (s === '' || s === '-' || s === '∅' || s === '{}' || /^(ninguno|nada|vacio|vacío|muerto|trampa)$/i.test(s)) return []
  return inBraces(s).map(parseStateName)
}

export interface ParsedTransition {
  from: string
  symbols: string[]
  targets: string[]
  /** Estados que en esta linea venian marcados con "->" (inicial). */
  initialMarks: string[]
  /** Estados que en esta linea venian marcados con "*" (final). */
  finalMarks: string[]
}

/** Reconoce una transicion escrita en cualquiera de los estilos admitidos. */
export function parseTransitionLine(line: string): ParsedTransition | null {
  const l = line.trim()

  // d(q0, a) = q1   /   δ(q0,a) -> q1
  let m = l.match(/^[δdfDF]?\s*\(\s*([^,;()]+)\s*[,;]\s*([^)]*)\)\s*(?:=|->|=>|→|:)\s*(.+)$/)
  if (m) return make(m[1], m[2], m[3])

  // q0 -> q1 [a]   /   q0 -> q1 : a   /   q0 -> q1 con a
  m = l.match(/^([^->=→\[\]:]+?)\s*(?:->|=>|→)\s*([^\[\]:]+?)\s*(?:\[([^\]]*)\]|:\s*(.+)|con\s+(.+))$/i)
  if (m) return make(m[1], m[3] ?? m[4] ?? m[5] ?? '', m[2])

  // q0, a -> q1   /   q0 ; a => q1
  m = l.match(/^(.+?)\s*[,;]\s*(.+?)\s*(?:->|=>|→|:)\s*(.+)$/)
  if (m) return make(m[1], m[2], m[3])

  // q0 -a-> q1   /   q0 --a--> q1   /   q0 —a→ q1
  m = l.match(/^(.+?)\s*-{1,2}\s*([^->]*?)\s*-{0,2}(?:->|→)\s*(.+)$/)
  if (m) return make(m[1], m[2], m[3])

  // q0 a q1  (tres campos separados por espacios)
  m = l.match(/^(\S+)\s+(\S+)\s+(\S+)$/)
  if (m) return make(m[1], m[2], m[3])

  return null

  function make(fromRaw: string, symRaw: string, toRaw: string): ParsedTransition | null {
    const from = parseStateName(fromRaw)
    if (!from.name) return null
    const symbols = splitSymbols(symRaw)
    if (!symbols.length) return null
    const targets = splitTargets(toRaw)
    // Las marcas valen en los dos lados: "*q2, # -> q2" hace final a q2.
    return {
      from: from.name,
      symbols,
      targets: targets.map((t) => t.name),
      initialMarks: [...(from.initial ? [from.name] : []), ...targets.filter((t) => t.initial).map((t) => t.name)],
      finalMarks: [...(from.final ? [from.name] : []), ...targets.filter((t) => t.final).map((t) => t.name)],
    }
  }
}

/** Interpreta una tabla de transiciones: la primera fila son los simbolos. */
function readTable(
  rows: Array<{ n: number; cells: string[] }>,
  out: {
    declaredStates: string[]
    alphabet: string[]
    initials: string[]
    finals: string[]
    transitions: Array<[string, string, string]>
  },
  warnings: string[],
) {
  // Las tablas escritas con | al principio y al final dejan celdas vacias.
  const clean = rows.map((r) => {
    const cells = [...r.cells]
    if (cells[0] === '') cells.shift()
    if (cells[cells.length - 1] === '') cells.pop()
    return { n: r.n, cells }
  })

  const header = clean[0]
  const symbols = header.cells.slice(1).map(normalizeSymbol).filter(Boolean)
  if (!symbols.length) {
    warnings.push(`Linea ${header.n}: la primera fila de la tabla deberia listar los simbolos del alfabeto.`)
    return
  }
  for (const s of symbols) {
    if (s !== EPSILON && !out.alphabet.includes(s)) out.alphabet.push(s)
  }

  for (const row of clean.slice(1)) {
    const st = parseStateName(row.cells[0] ?? '')
    if (!st.name) continue
    if (!out.declaredStates.includes(st.name)) out.declaredStates.push(st.name)
    if (st.initial) out.initials.push(st.name)
    if (st.final) out.finals.push(st.name)

    for (let k = 0; k < symbols.length; k++) {
      const cell = row.cells[k + 1]
      if (cell === undefined) continue
      for (const to of splitTargets(cell)) {
        out.transitions.push([st.name, symbols[k], to.name])
        if (to.initial) out.initials.push(to.name)
        if (to.final) out.finals.push(to.name)
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Montaje del automata
// ---------------------------------------------------------------------------

function assemble(data: Collected, errors: string[], warnings: string[]): FormalParseResult {
  const { declaredStates, transitions, format } = data
  const initials = [...new Set(data.initials)]
  const finals = [...new Set(data.finals)]

  const stateNames = [...declaredStates]
  const addState = (n: string) => {
    if (n && !stateNames.includes(n)) stateNames.push(n)
  }
  for (const q of initials) addState(q)
  for (const [f, , t] of transitions) {
    addState(f)
    addState(t)
  }
  for (const f of finals) addState(f)

  if (stateNames.length === 0) {
    errors.push('No se declaro ningun estado ni ninguna transicion.')
    return { ok: false, errors, warnings, format }
  }

  if (initials.length === 0) {
    initials.push(stateNames[0])
    warnings.push(`No se indico el estado inicial; se tomo el primero que aparece: ${stateNames[0]}.`)
  }
  if (initials.length > 1) {
    warnings.push(
      `Hay ${initials.length} estados iniciales (${initials.join(', ')}). Un AFD admite solo uno, ` +
        `asi que el automata se tratara como AFN; la determinizacion parte del conjunto de todos ellos.`,
    )
  }
  if (finals.length === 0) {
    warnings.push('No se declararon estados finales: tal como esta, el automata no acepta ninguna cadena.')
  }

  for (const f of finals) {
    if (!stateNames.includes(f)) errors.push(`El estado final "${f}" no aparece en ninguna parte.`)
  }
  if (errors.length) return { ok: false, errors, warnings, format }

  const states: State[] = stateNames.map((n) => ({
    id: uid('f'),
    label: n,
    x: 0,
    y: 0,
    isInitial: initials.includes(n),
    isFinal: finals.includes(n),
  }))
  const byName = new Map(states.map((s) => [s.label, s]))

  // Se descartan transiciones repetidas: el mismo (origen, simbolo, destino).
  const seen = new Set<string>()
  const built: Transition[] = []
  for (const [f, sym, t] of transitions) {
    const key = `${f}|${sym}|${t}`
    if (seen.has(key)) continue
    seen.add(key)
    built.push({ id: uid('t'), from: byName.get(f)!.id, to: byName.get(t)!.id, symbol: sym })
  }

  const automaton: Automaton = {
    name: 'Automata (especificacion formal)',
    alphabet: data.alphabet.filter((s) => s !== EPSILON),
    states,
    transitions: built,
  }
  if (!automaton.alphabet.length) automaton.alphabet = inferAlphabet(automaton)

  const declaredSet = new Set(automaton.alphabet)
  const added: string[] = []
  for (const t of built) {
    if (t.symbol !== EPSILON && !declaredSet.has(t.symbol)) {
      added.push(t.symbol)
      automaton.alphabet.push(t.symbol)
      declaredSet.add(t.symbol)
    }
  }
  if (added.length) {
    warnings.push(
      `Estos simbolos se usan en las transiciones pero no estaban en el alfabeto, asi que se agregaron: ${[...new Set(added)]
        .map((s) => `"${s}"`)
        .join(', ')}.`,
    )
  }

  const sinUso = automaton.alphabet.filter((s) => !built.some((t) => t.symbol === s))
  if (sinUso.length) {
    warnings.push(
      `Los simbolos ${sinUso.map((s) => `"${s}"`).join(', ')} estan declarados pero no aparecen en ninguna transicion: ` +
        `las cadenas que los usen se rechazaran.`,
    )
  }

  automaton.alphabet.sort()
  return { ok: true, automaton: autoLayout(automaton), errors, warnings, format }
}

// ---------------------------------------------------------------------------
// Salida
// ---------------------------------------------------------------------------

/** Serializa un automata al formato de texto por lineas (para exportar / editar). */
export function toFormal(a: Automaton): string {
  const lab = (id: string) => a.states.find((s) => s.id === id)?.label ?? '?'
  const initials = a.states.filter((s) => s.isInitial).map((s) => s.label)
  const lines = [
    `Q = {${a.states.map((s) => s.label).join(', ')}}`,
    `Sigma = {${a.alphabet.join(', ')}}`,
    `inicial = ${initials.join(', ')}`,
    `F = {${a.states.filter((s) => s.isFinal).map((s) => s.label).join(', ')}}`,
    'delta:',
  ]
  for (const t of a.transitions) lines.push(`${lab(t.from)}, ${t.symbol} -> ${lab(t.to)}`)
  return lines.join('\n')
}

/** Serializa a JSON, para intercambiar el automata con otras herramientas. */
export function toJson(a: Automaton): string {
  const lab = (id: string) => a.states.find((s) => s.id === id)?.label ?? '?'
  return JSON.stringify(
    {
      states: a.states.map((s) => s.label),
      alphabet: a.alphabet,
      initial: a.states.find((s) => s.isInitial)?.label ?? null,
      initials: a.states.filter((s) => s.isInitial).map((s) => s.label),
      finals: a.states.filter((s) => s.isFinal).map((s) => s.label),
      transitions: a.transitions.map((t) => [lab(t.from), t.symbol, lab(t.to)]),
    },
    null,
    2,
  )
}
