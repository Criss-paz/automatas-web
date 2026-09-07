import { Automaton, State, Transition } from '../types'
import { uid, initialState, move } from '../automaton'
import { autoLayout } from '../layout'

/**
 * Constructores de AFD basicos y operaciones booleanas entre ellos.
 * Los usa el analizador de lenguaje natural: cada condicion de la frase
 * ("que termine en ab", "con numero par de a") se convierte en un AFD y
 * despues se combinan por interseccion.
 */

function dfa(name: string, alphabet: string[], n: number, labels: string[], finals: number[], delta: (i: number, sym: string) => number): Automaton {
  const states: State[] = Array.from({ length: n }, (_, i) => ({
    id: uid('n'),
    label: labels[i] ?? `q${i}`,
    x: 0,
    y: 0,
    isInitial: i === 0,
    isFinal: finals.includes(i),
  }))
  const transitions: Transition[] = []
  for (let i = 0; i < n; i++) {
    for (const sym of alphabet) {
      transitions.push({ id: uid('t'), from: states[i].id, to: states[delta(i, sym)].id, symbol: sym })
    }
  }
  return autoLayout({ name, alphabet, states, transitions })
}

/** Σ* : acepta cualquier cadena. */
export function anyString(alphabet: string[]): Automaton {
  return dfa('Σ*', alphabet, 1, ['q0'], [0], () => 0)
}

/** Cadenas que EMPIEZAN con la palabra w. */
export function startsWith(alphabet: string[], w: string): Automaton {
  const n = w.length + 1
  const trap = n // estado trampa
  const labels = [...Array.from({ length: n }, (_, i) => `p${i}`), 'T']
  return dfa(`empieza con "${w}"`, alphabet, n + 1, labels, [n - 1], (i, sym) => {
    if (i === trap) return trap
    if (i === n - 1) return n - 1 // ya cumplio el prefijo: acepta el resto
    return sym === w[i] ? i + 1 : trap
  })
}

/** Funcion de fallo de KMP: base del automata de busqueda de subcadena. */
function kmpFail(w: string): number[] {
  const fail = new Array(w.length).fill(0)
  let k = 0
  for (let i = 1; i < w.length; i++) {
    while (k > 0 && w[i] !== w[k]) k = fail[k - 1]
    if (w[i] === w[k]) k++
    fail[i] = k
  }
  return fail
}

/** Estado siguiente del automata de Knuth-Morris-Pratt. */
function kmpNext(w: string, fail: number[], i: number, sym: string): number {
  let k = i
  while (k > 0 && sym !== w[k]) k = fail[k - 1]
  if (sym === w[k]) k++
  return k
}

/** Cadenas que TERMINAN en la palabra w. */
export function endsWith(alphabet: string[], w: string): Automaton {
  const fail = kmpFail(w)
  const n = w.length + 1
  const labels = Array.from({ length: n }, (_, i) => `e${i}`)
  return dfa(`termina en "${w}"`, alphabet, n, labels, [w.length], (i, sym) =>
    kmpNext(w, fail, i === w.length ? fail[w.length - 1] : i, sym),
  )
}

/** Cadenas que CONTIENEN la subcadena w (estado final absorbente). */
export function contains(alphabet: string[], w: string): Automaton {
  const fail = kmpFail(w)
  const n = w.length + 1
  const labels = Array.from({ length: n }, (_, i) => `c${i}`)
  return dfa(`contiene "${w}"`, alphabet, n, labels, [w.length], (i, sym) =>
    i === w.length ? w.length : kmpNext(w, fail, i, sym),
  )
}

/** Cadenas donde la cantidad de "sym" es congruente con r modulo m. */
export function countMod(alphabet: string[], sym: string, r: number, m: number): Automaton {
  const labels = Array.from({ length: m }, (_, i) => `${sym}≡${i}`)
  return dfa(`cantidad de "${sym}" ≡ ${r} (mod ${m})`, alphabet, m, labels, [((r % m) + m) % m], (i, s) =>
    s === sym ? (i + 1) % m : i,
  )
}

/** Cadenas con al menos n apariciones de "sym". */
export function countAtLeast(alphabet: string[], sym: string, n: number): Automaton {
  const labels = Array.from({ length: n + 1 }, (_, i) => `${sym}${i}`)
  return dfa(`al menos ${n} "${sym}"`, alphabet, n + 1, labels, [n], (i, s) =>
    s === sym ? Math.min(i + 1, n) : i,
  )
}

/** Cadenas con exactamente n apariciones de "sym". */
export function countExactly(alphabet: string[], sym: string, n: number): Automaton {
  const labels = [...Array.from({ length: n + 1 }, (_, i) => `${sym}${i}`), 'T']
  return dfa(`exactamente ${n} "${sym}"`, alphabet, n + 2, labels, [n], (i, s) => {
    if (i === n + 1) return n + 1
    return s === sym ? i + 1 : i
  })
}

/** Cadenas cuya longitud es congruente con r modulo m. */
export function lengthMod(alphabet: string[], r: number, m: number): Automaton {
  const labels = Array.from({ length: m }, (_, i) => `L${i}`)
  return dfa(`longitud ≡ ${r} (mod ${m})`, alphabet, m, labels, [((r % m) + m) % m], (i) => (i + 1) % m)
}

/** Cadenas de longitud al menos n. */
export function lengthAtLeast(alphabet: string[], n: number): Automaton {
  const labels = Array.from({ length: n + 1 }, (_, i) => `L${i}`)
  return dfa(`longitud ≥ ${n}`, alphabet, n + 1, labels, [n], (i) => Math.min(i + 1, n))
}

/** Cadenas de longitud a lo sumo n. */
export function lengthAtMost(alphabet: string[], n: number): Automaton {
  const labels = [...Array.from({ length: n + 1 }, (_, i) => `L${i}`), 'T']
  return dfa(
    `longitud ≤ ${n}`,
    alphabet,
    n + 2,
    labels,
    Array.from({ length: n + 1 }, (_, i) => i),
    (i) => Math.min(i + 1, n + 1),
  )
}

/** Cadenas de longitud exactamente n. */
export function lengthExactly(alphabet: string[], n: number): Automaton {
  const labels = [...Array.from({ length: n + 1 }, (_, i) => `L${i}`), 'T']
  return dfa(`longitud = ${n}`, alphabet, n + 2, labels, [n], (i) => Math.min(i + 1, n + 1))
}

/**
 * Numeros en base |Σ| (leidos de izquierda a derecha) divisibles entre k.
 * Con Σ = {0,1} son los binarios multiplos de k.
 */
export function divisibleBy(alphabet: string[], k: number): Automaton {
  const base = alphabet.length
  const digit = new Map(alphabet.map((s, i) => [s, i]))
  const labels = Array.from({ length: k }, (_, i) => `r${i}`)
  return dfa(`multiplo de ${k} en base ${base}`, alphabet, k, labels, [0], (i, sym) => (i * base + digit.get(sym)!) % k)
}

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
