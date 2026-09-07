import { Automaton, State, Step, Transition } from '../types'
import {
  cloneAutomaton,
  completeDFA,
  inferAlphabet,
  move,
  removeUnreachable,
  transitionTable,
  uid,
} from '../automaton'
import { autoLayout } from '../layout'

export interface MinimizeResult {
  automaton: Automaton
  steps: Step[]
  classes: string[][]
}

/**
 * Minimizacion por tabla de estados distinguibles (metodo de Moore / table-filling).
 * Se ofrece como segundo metodo, en paralelo a Brzozowski, para poder contrastar
 * que ambos llegan al mismo numero de estados.
 */
export function minimizeTableFilling(input: Automaton): MinimizeResult {
  const steps: Step[] = []
  const alphabet = inferAlphabet(input)

  // --- Paso 1: quitar inalcanzables y completar ----------------------------
  const trimmed = removeUnreachable({ ...cloneAutomaton(input), alphabet })
  const completed = completeDFA(trimmed.automaton)
  const A = autoLayout(completed.automaton)

  steps.push({
    title: 'Paso 1 · Preparar el AFD',
    bullets: [
      trimmed.removed.length
        ? `Se eliminan los estados inalcanzables: ${trimmed.removed.join(', ')}.`
        : 'No hay estados inalcanzables.',
      completed.added
        ? `El AFD estaba incompleto: se agrega el estado trampa ${completed.trapLabel} para que δ este definida en todos los casos.`
        : 'El AFD ya era completo (δ definida para todo par estado-simbolo).',
    ],
    table: { caption: 'Tabla de transiciones preparada', ...transitionTable(A) },
    automaton: A,
  })

  const states = A.states
  const n = states.length
  const idx = new Map(states.map((s, i) => [s.id, i]))
  const go = (i: number, sym: string): number => {
    const d = move(A, states[i].id, sym)
    return d.length ? idx.get(d[0])! : i
  }

  // marked[i][j] con i > j
  const marked: boolean[][] = Array.from({ length: n }, () => Array(n).fill(false))
  const reason: string[][] = Array.from({ length: n }, () => Array(n).fill(''))

  // --- Paso 2: marca inicial (final vs no final) ---------------------------
  let initialMarks = 0
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < i; j++) {
      if (states[i].isFinal !== states[j].isFinal) {
        marked[i][j] = true
        reason[i][j] = 'X₀'
        initialMarks++
      }
    }
  }
  steps.push({
    title: 'Paso 2 · Marca inicial: finales contra no finales',
    body:
      `Un estado final y uno no final **nunca** pueden ser equivalentes: la cadena vacia ya los distingue. ` +
      `Se marcan los ${initialMarks} par(es) de ese tipo con **X₀**.`,
    table: pairTable(states, marked, reason),
  })

  // --- Paso 3: rondas de propagacion ---------------------------------------
  let round = 0
  for (;;) {
    round++
    let changed = 0
    const roundReason: Array<[number, number, string]> = []
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < i; j++) {
        if (marked[i][j]) continue
        for (const sym of alphabet) {
          const a = go(i, sym)
          const b = go(j, sym)
          if (a === b) continue
          const hi = Math.max(a, b)
          const lo = Math.min(a, b)
          if (marked[hi][lo]) {
            marked[i][j] = true
            reason[i][j] = `X${round}`
            roundReason.push([i, j, sym])
            changed++
            break
          }
        }
      }
    }
    if (changed === 0) {
      steps.push({
        title: `Paso 3.${round} · Ronda ${round}: sin cambios`,
        body: `Ninguna pareja nueva se pudo marcar. El proceso termina: los pares que quedaron **sin marcar** son estados equivalentes.`,
        table: pairTable(states, marked, reason),
      })
      break
    }
    steps.push({
      title: `Paso 3.${round} · Ronda ${round}: propagacion`,
      body:
        `Se marca el par (p, q) si existe un simbolo a tal que (δ(p,a), δ(q,a)) ya esta marcado: ` +
        `esa a los lleva a estados que sabemos distinguibles, asi que p y q tambien lo son.`,
      bullets: roundReason.map(
        ([i, j, sym]) =>
          `(${states[i].label}, ${states[j].label}) se marca con "${sym}": lleva a (${states[go(i, sym)].label}, ${states[go(j, sym)].label}), ya marcado.`,
      ),
      table: pairTable(states, marked, reason),
    })
  }

  // --- Paso 4: clases de equivalencia --------------------------------------
  const parent = Array.from({ length: n }, (_, i) => i)
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])))
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < i; j++) {
      if (!marked[i][j]) parent[find(i)] = find(j)
    }
  }
  const groups = new Map<number, number[]>()
  for (let i = 0; i < n; i++) {
    const r = find(i)
    if (!groups.has(r)) groups.set(r, [])
    groups.get(r)!.push(i)
  }
  const classes = [...groups.values()]
  // La clase del estado inicial va primero.
  classes.sort((g, h) => {
    const gi = g.some((i) => states[i].isInitial) ? -1 : 0
    const hi = h.some((i) => states[i].isInitial) ? -1 : 0
    return gi - hi || g[0] - h[0]
  })

  const newStates: State[] = classes.map((g, k) => ({
    id: uid('m'),
    label: classes.length === n ? states[g[0]].label : `C${k}`,
    x: 0,
    y: 0,
    isInitial: g.some((i) => states[i].isInitial),
    isFinal: g.some((i) => states[i].isFinal),
  }))
  const classOf = new Map<number, number>()
  classes.forEach((g, k) => g.forEach((i) => classOf.set(i, k)))

  const transitions: Transition[] = []
  classes.forEach((g, k) => {
    for (const sym of alphabet) {
      const dest = classOf.get(go(g[0], sym))!
      transitions.push({ id: uid('t'), from: newStates[k].id, to: newStates[dest].id, symbol: sym })
    }
  })

  const min = autoLayout({ name: 'AFD minimo (tabla)', alphabet, states: newStates, transitions })

  steps.push({
    title: 'Paso 4 · Fusionar los estados equivalentes',
    body:
      `Cada grupo de estados mutuamente no marcados forma una clase de equivalencia y se convierte en **un solo estado** del AFD minimo. ` +
      `Estados: ${n} → **${classes.length}**.`,
    table: {
      caption: 'Clases de equivalencia',
      headers: ['Clase', 'Estados originales', '¿Inicial?', '¿Final?'],
      rows: classes.map((g, k) => [
        newStates[k].label,
        '{' + g.map((i) => states[i].label).join(', ') + '}',
        newStates[k].isInitial ? 'Si' : '',
        newStates[k].isFinal ? 'Si' : '',
      ]),
    },
    automaton: min,
  })

  return {
    automaton: min,
    steps,
    classes: classes.map((g) => g.map((i) => states[i].label)),
  }
}

/** Tabla triangular de pares: filas q1..qn-1, columnas q0..qn-2. */
function pairTable(
  states: State[],
  marked: boolean[][],
  reason: string[][],
): { headers: string[]; rows: string[][]; caption: string } {
  const n = states.length
  const headers = ['', ...states.slice(0, n - 1).map((s) => s.label)]
  const rows: string[][] = []
  for (let i = 1; i < n; i++) {
    const row = [states[i].label]
    for (let j = 0; j < n - 1; j++) {
      if (j >= i) row.push('')
      else row.push(marked[i][j] ? reason[i][j] || 'X' : '—')
    }
    rows.push(row)
  }
  return { headers, rows, caption: 'X = par distinguible · — = par todavia equivalente' }
}
