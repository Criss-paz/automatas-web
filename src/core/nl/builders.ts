import { Automaton, State, Transition } from '../types'
import { uid } from '../automaton'
import { autoLayout } from '../layout'
import { complement, product } from '../algorithms/boolean'

// Las operaciones booleanas viven en algorithms/boolean.ts porque tambien las
// usan el motor de expresiones regulares y la verificacion de equivalencia.
export { complement, product }

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

// ---------------------------------------------------------------------------
// Constructores adicionales
// ---------------------------------------------------------------------------

/** Lenguaje vacio: no acepta ninguna cadena (ni siquiera ε). */
export function emptyLanguage(alphabet: string[]): Automaton {
  return dfa('∅ (no acepta nada)', alphabet, 1, ['T'], [], () => 0)
}

/** Lenguaje que acepta EXACTAMENTE la cadena w (y ninguna otra). */
export function exactWord(alphabet: string[], w: string): Automaton {
  const n = w.length + 1
  const trap = n
  const labels = [...Array.from({ length: n }, (_, i) => `w${i}`), 'T']
  return dfa(`solo la cadena "${w === '' ? 'ε' : w}"`, alphabet, n + 1, labels, [n - 1], (i, sym) => {
    if (i === trap || i === n - 1) return trap
    return sym === w[i] ? i + 1 : trap
  })
}

/**
 * Lenguaje FINITO formado por la lista de palabras dada.
 * Se construye el trie (arbol de prefijos) de las palabras y se completa con
 * un estado trampa: es directamente el AFD del lenguaje.
 */
export function oneOfWords(alphabet: string[], words: string[]): Automaton {
  const uniq = [...new Set(words)]
  if (uniq.length === 0) return emptyLanguage(alphabet)
  if (uniq.length === 1) return exactWord(alphabet, uniq[0])

  interface Node { children: Map<string, number>; final: boolean }
  const nodes: Node[] = [{ children: new Map(), final: false }]
  for (const w of uniq) {
    let cur = 0
    for (const ch of w) {
      let nx = nodes[cur].children.get(ch)
      if (nx === undefined) {
        nodes.push({ children: new Map(), final: false })
        nx = nodes.length - 1
        nodes[cur].children.set(ch, nx)
      }
      cur = nx
    }
    nodes[cur].final = true
  }

  const trap = nodes.length
  const labels = [...nodes.map((_, i) => `t${i}`), 'T']
  const finals = nodes.map((nd, i) => (nd.final ? i : -1)).filter((i) => i >= 0)
  const show = uniq.map((w) => (w === '' ? 'ε' : w)).join(', ')
  return dfa(`solo las cadenas {${show}}`, alphabet, nodes.length + 1, labels, finals, (i, sym) =>
    i === trap ? trap : nodes[i].children.get(sym) ?? trap,
  )
}

/** Cadenas formadas UNICAMENTE con simbolos del subconjunto dado. */
export function onlySymbols(alphabet: string[], allowed: string[]): Automaton {
  const set = new Set(allowed)
  return dfa(`solo simbolos de {${allowed.join(', ')}}`, alphabet, 2, ['A', 'T'], [0], (i, sym) =>
    i === 1 || !set.has(sym) ? 1 : 0,
  )
}

/**
 * El k-esimo simbolo CONTANDO DESDE EL FINAL es "sym"
 * (k = 1 ultimo, k = 2 penultimo, k = 3 antepenultimo...).
 *
 * Se construye como AFN a proposito: es el ejemplo clasico de automata donde el
 * no determinismo "adivina" en que posicion empieza el sufijo, y su AFD
 * equivalente necesita 2^k estados. El solucionador lo determiniza despues.
 */
export function symbolFromEnd(alphabet: string[], sym: string, k: number): Automaton {
  const states: State[] = Array.from({ length: k + 1 }, (_, i) => ({
    id: uid('n'),
    label: `s${i}`,
    x: 0,
    y: 0,
    isInitial: i === 0,
    isFinal: i === k,
  }))
  const transitions: Transition[] = []
  // El estado inicial consume cualquier prefijo.
  for (const s of alphabet) {
    transitions.push({ id: uid('t'), from: states[0].id, to: states[0].id, symbol: s })
  }
  // "Adivina" que aqui empieza el sufijo de longitud k.
  transitions.push({ id: uid('t'), from: states[0].id, to: states[1].id, symbol: sym })
  // Los k-1 simbolos restantes pueden ser cualquiera.
  for (let i = 1; i < k; i++) {
    for (const s of alphabet) {
      transitions.push({ id: uid('t'), from: states[i].id, to: states[i + 1].id, symbol: s })
    }
  }
  const orden = k === 1 ? 'ultimo' : k === 2 ? 'penultimo' : k === 3 ? 'antepenultimo' : `${k}º desde el final`
  return autoLayout({ name: `el ${orden} simbolo es "${sym}"`, alphabet, states, transitions })
}

/** El k-esimo simbolo contando DESDE EL INICIO (k = 1 el primero) es "sym". */
export function symbolFromStart(alphabet: string[], sym: string, k: number): Automaton {
  const acc = k
  const trap = k + 1
  const labels = [...Array.from({ length: k }, (_, i) => `p${i}`), 'A', 'T']
  return dfa(`el simbolo ${k}º es "${sym}"`, alphabet, k + 2, labels, [acc], (i, s) => {
    if (i === acc) return acc
    if (i === trap) return trap
    if (i < k - 1) return i + 1
    return s === sym ? acc : trap
  })
}

/** Cadenas con a lo sumo n apariciones de "sym". */
export function countAtMost(alphabet: string[], sym: string, n: number): Automaton {
  const labels = [...Array.from({ length: n + 1 }, (_, i) => `${sym}${i}`), 'T']
  return dfa(
    `a lo sumo ${n} "${sym}"`,
    alphabet,
    n + 2,
    labels,
    Array.from({ length: n + 1 }, (_, i) => i),
    (i, s) => (i === n + 1 ? n + 1 : s === sym ? i + 1 : i),
  )
}

/** Cadenas de longitud entre lo y hi (ambos inclusive). */
export function lengthBetween(alphabet: string[], lo: number, hi: number): Automaton {
  const labels = [...Array.from({ length: hi + 1 }, (_, i) => `L${i}`), 'T']
  const finals: number[] = []
  for (let i = lo; i <= hi; i++) finals.push(i)
  return dfa(`longitud entre ${lo} y ${hi}`, alphabet, hi + 2, labels, finals, (i) => Math.min(i + 1, hi + 1))
}

/** Cadenas sin dos simbolos iguales consecutivos (simbolos alternados). */
export function noRepeatedAdjacent(alphabet: string[]): Automaton {
  const n = alphabet.length + 2 // inicial + uno por simbolo + trampa
  const trap = n - 1
  const labels = ['q0', ...alphabet.map((s) => `q${s}`), 'T']
  const finals = Array.from({ length: alphabet.length + 1 }, (_, i) => i)
  return dfa('sin simbolos iguales consecutivos', alphabet, n, labels, finals, (i, sym) => {
    if (i === trap) return trap
    const idx = alphabet.indexOf(sym) + 1
    if (i === 0) return idx // primer simbolo: siempre se puede
    return i === idx ? trap : idx // repetir el mismo simbolo es lo prohibido
  })
}

/** Cadenas que empiezan y terminan con el MISMO simbolo (union sobre Σ). */
export function startsAndEndsSame(alphabet: string[]): Automaton {
  let acc: Automaton | null = null
  for (const s of alphabet) {
    const both = product(startsWith(alphabet, s), endsWith(alphabet, s), 'and', `empieza y termina con "${s}"`)
    acc = acc === null ? both : product(acc, both, 'or')
  }
  return acc === null ? anyString(alphabet) : { ...acc, name: 'empieza y termina con el mismo simbolo' }
}
