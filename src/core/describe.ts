import { Automaton } from './types'
import { coReachableStates, completeDFA, finalStates, inferAlphabet, isDeterministic, reachableStates } from './automaton'
import { subsetConstruction } from './algorithms/subset'
import { brzozowski } from './algorithms/brzozowski'
import { complement, product } from './algorithms/boolean'
import { accepts, checkEquivalence } from './algorithms/equivalence'
import { automatonToRegexString } from './algorithms/toRegex'
import { joinWord } from './automaton'
import * as B from './nl/builders'

/**
 * Describe EN ESPAÑOL el lenguaje que reconoce un automata.
 *
 * El metodo es honesto a proposito: en vez de inventar una frase, se prueba un
 * catalogo de propiedades conocidas (las mismas que sabe construir el
 * analizador de enunciados) y se comprueba por EQUIVALENCIA DE AUTOMATAS si el
 * lenguaje coincide con alguna, o con la interseccion de unas pocas.
 *
 *   - Si se demuestra la igualdad, la descripcion es exacta.
 *   - Si no, se devuelven las propiedades que si se demostraron ciertas
 *     ("toda cadena termina en b", "ninguna contiene aa"), que acotan el
 *     lenguaje aunque no lo determinen del todo.
 *
 * Asi nunca se afirma algo que no se haya verificado.
 */

export interface LanguageDescription {
  /** Frase que describe el lenguaje exactamente, si se pudo demostrar. */
  exact: string | null
  /** Propiedades demostradas (el lenguaje esta contenido en cada una). */
  facts: string[]
  /** Datos estructurales: alfabeto, finitud, longitudes, etc. */
  summary: string[]
  /** Expresion regular equivalente. */
  regex: string
  finite: boolean
  /** Si el lenguaje es finito, todas sus cadenas (hasta un tope). */
  words?: string[]
  accepted: string[]
  rejected: string[]
}

/** AFD completo y determinista: lo que exigen el producto y el complemento. */
function toDfa(a: Automaton, alphabet: string[]): Automaton {
  const con: Automaton = { ...a, alphabet }
  const det = isDeterministic(con) ? con : subsetConstruction(con).automaton
  return completeDFA({ ...det, alphabet }).automaton
}

/** ¿El automata no acepta ninguna cadena? */
function isEmptyLanguage(a: Automaton): boolean {
  const alcanzables = reachableStates(a)
  return !finalStates(a).some((s) => alcanzables.has(s.id))
}

/** ¿L(a) ⊆ L(b)? Se comprueba viendo que L(a) ∩ complemento(L(b)) sea vacio. */
function subsetOf(a: Automaton, b: Automaton, alphabet: string[]): boolean {
  return isEmptyLanguage(product(toDfa(a, alphabet), complement(toDfa(b, alphabet)), 'and'))
}

const sameLanguage = (a: Automaton, b: Automaton) => checkEquivalence(a, b).equivalent

/** Todas las cadenas aceptadas hasta cierta longitud (para medir "cuanto acepta"). */
function countUpTo(a: Automaton, alphabet: string[], maxLen: number): number {
  let total = 0
  let nivel: string[][] = [[]]
  for (let len = 0; len <= maxLen; len++) {
    if (len > 0) {
      const sig: string[][] = []
      for (const w of nivel) for (const s of alphabet) sig.push([...w, s])
      nivel = sig
    }
    for (const syms of nivel) if (accepts(a, joinWord(alphabet, syms))) total++
    if (nivel.length > 4000) break
  }
  return total
}

/** Enumera las cadenas del lenguaje cuando es finito. */
function enumerate(a: Automaton, alphabet: string[], tope = 24): { words: string[]; truncated: boolean } {
  const words: string[] = []
  let nivel: string[][] = [[]]
  // Un lenguaje finito no puede tener cadenas mas largas que su numero de estados.
  const maxLen = a.states.length + 1
  for (let len = 0; len <= maxLen; len++) {
    if (len > 0) {
      const sig: string[][] = []
      for (const w of nivel) for (const s of alphabet) sig.push([...w, s])
      nivel = sig
    }
    if (!nivel.length || nivel.length > 20000) break
    for (const syms of nivel) {
      const w = joinWord(alphabet, syms)
      if (accepts(a, w)) {
        if (words.length >= tope) return { words, truncated: true }
        words.push(w)
      }
    }
  }
  return { words, truncated: false }
}

/** ¿El lenguaje es finito? Lo es si ningun ciclo util es alcanzable. */
function isFinite(a: Automaton): boolean {
  const utiles = new Set([...reachableStates(a)].filter((id) => coReachableStates(a).has(id)))
  // Busqueda de ciclos restringida a los estados utiles.
  const color = new Map<string, number>() // 0 sin visitar, 1 en pila, 2 terminado
  const vecinos = (id: string) => a.transitions.filter((t) => t.from === id && utiles.has(t.to)).map((t) => t.to)
  let hayCiclo = false
  const visitar = (id: string) => {
    color.set(id, 1)
    for (const v of vecinos(id)) {
      const c = color.get(v) ?? 0
      if (c === 1) hayCiclo = true
      else if (c === 0) visitar(v)
    }
    color.set(id, 2)
  }
  for (const id of utiles) if ((color.get(id) ?? 0) === 0) visitar(id)
  return !hayCiclo
}

// ---------------------------------------------------------------------------
// Catalogo de propiedades candidatas
// ---------------------------------------------------------------------------

interface Candidate {
  texto: string
  automaton: Automaton
}

/** Todas las palabras de longitud exacta n sobre el alfabeto. */
function wordsOfLength(alphabet: string[], n: number): string[] {
  let out: string[] = ['']
  for (let i = 0; i < n; i++) {
    const sig: string[] = []
    for (const w of out) for (const s of alphabet) sig.push(w + s)
    out = sig
  }
  return out
}

function catalog(alphabet: string[]): Candidate[] {
  const c: Candidate[] = []
  const add = (texto: string, automaton: Automaton) => c.push({ texto, automaton })
  const simple = alphabet.every((s) => s.length === 1)

  // Propiedades de un solo simbolo.
  for (const s of alphabet) {
    add(`empieza con "${s}"`, B.startsWith(alphabet, s))
    add(`termina en "${s}"`, B.endsWith(alphabet, s))
    add(`contiene al menos una "${s}"`, B.contains(alphabet, s))
    add(`no contiene ninguna "${s}"`, B.countAtMost(alphabet, s, 0))
    add(`tiene una cantidad par de "${s}"`, B.countMod(alphabet, s, 0, 2))
    add(`tiene una cantidad impar de "${s}"`, B.countMod(alphabet, s, 1, 2))
    add(`la cantidad de "${s}" es multiplo de 3`, B.countMod(alphabet, s, 0, 3))
    add(`el penultimo simbolo es "${s}"`, B.symbolFromEnd(alphabet, s, 2))
  }

  // Palabras cortas como prefijo, sufijo o subcadena.
  if (simple && alphabet.length <= 4) {
    for (const n of [2, 3]) {
      const palabras = wordsOfLength(alphabet, n)
      if (palabras.length > 40) continue
      for (const w of palabras) {
        add(`empieza con "${w}"`, B.startsWith(alphabet, w))
        add(`termina en "${w}"`, B.endsWith(alphabet, w))
        add(`contiene la subcadena "${w}"`, B.contains(alphabet, w))
        add(`no contiene la subcadena "${w}"`, B.substringAtMost(alphabet, w, 0))
        if (n === 2) add(`contiene a lo sumo una vez la subcadena "${w}"`, B.substringAtMost(alphabet, w, 1))
      }
    }
    // Orden entre parejas de simbolos repetidos: "todo 00 va antes que todo 11".
    for (const s of alphabet) {
      for (const t of alphabet) {
        if (s === t) continue
        add(
          `toda pareja "${s}${s}" aparece antes que cualquier pareja "${t}${t}"`,
          B.allBefore(alphabet, s + s, t + t),
        )
      }
    }
  }

  // Subconjuntos propios del alfabeto.
  if (alphabet.length > 1 && alphabet.length <= 4) {
    for (const s of alphabet) {
      const resto = alphabet.filter((x) => x !== s)
      add(`solo usa los simbolos {${resto.join(', ')}}`, B.onlySymbols(alphabet, resto))
      add(`solo usa el simbolo "${s}"`, B.onlySymbols(alphabet, [s]))
    }
  }

  // Longitud.
  add('tiene longitud par', B.lengthMod(alphabet, 0, 2))
  add('tiene longitud impar', B.lengthMod(alphabet, 1, 2))
  add('tiene longitud multiplo de 3', B.lengthMod(alphabet, 0, 3))
  for (const n of [1, 2, 3]) {
    add(`tiene longitud al menos ${n}`, B.lengthAtLeast(alphabet, n))
    add(`tiene longitud a lo sumo ${n}`, B.lengthAtMost(alphabet, n))
    add(`tiene longitud exactamente ${n}`, B.lengthExactly(alphabet, n))
  }
  add('es la cadena vacia', B.lengthExactly(alphabet, 0))

  // Forma global.
  add('nunca tiene dos simbolos iguales seguidos', B.noRepeatedAdjacent(alphabet))
  if (alphabet.length > 1) add('empieza y termina con el mismo simbolo', B.startsAndEndsSame(alphabet))

  return c
}

// ---------------------------------------------------------------------------
// Descripcion
// ---------------------------------------------------------------------------

export function describeLanguage(original: Automaton): LanguageDescription {
  const alphabet = inferAlphabet(original)
  const L = brzozowski(toDfa(original, alphabet)).automaton
  const regex = automatonToRegexString(L)

  const vacio = isEmptyLanguage(L)
  const universal = !vacio && sameLanguage(L, B.anyString(alphabet))
  const finito = isFinite(L)

  const summary: string[] = [`El alfabeto es Σ = {${alphabet.join(', ')}}.`]

  if (vacio) {
    return {
      exact: 'el lenguaje vacio: no acepta ninguna cadena (L = ∅)',
      facts: [],
      summary,
      regex,
      finite: true,
      words: [],
      accepted: [],
      rejected: [''],
    }
  }

  if (universal) {
    return {
      exact: `absolutamente todas las cadenas sobre Σ, incluida la vacia (L = Σ*)`,
      facts: [],
      summary,
      regex,
      finite: false,
      accepted: [],
      rejected: [],
    }
  }

  // Muestras del lenguaje, para acompañar cualquier descripcion.
  const muestra = enumerate(L, alphabet, 12)
  const rechazadas: string[] = []
  for (let n = 0; n <= 4 && rechazadas.length < 6; n++) {
    for (const w of wordsOfLength(alphabet, n)) {
      if (rechazadas.length >= 6) break
      if (!accepts(L, w)) rechazadas.push(w === '' ? 'ε' : w)
    }
  }

  summary.push(
    finito
      ? `El lenguaje es **finito**.`
      : `El lenguaje es **infinito**: acepta cadenas tan largas como se quiera.`,
  )
  summary.push(accepts(L, '') ? 'La cadena vacia ε **si** pertenece al lenguaje.' : 'La cadena vacia ε **no** pertenece al lenguaje.')
  summary.push(`Su AFD minimo tiene ${L.states.length} estado(s).`)

  // Un lenguaje finito se describe enumerandolo: es la descripcion mas exacta.
  if (finito) {
    const todas = enumerate(L, alphabet, 24)
    if (!todas.truncated) {
      const lista = todas.words.map((w) => (w === '' ? 'ε' : `"${w}"`)).join(', ')
      return {
        exact: `exactamente estas ${todas.words.length} cadenas y ninguna mas: {${lista}}`,
        facts: [],
        summary,
        regex,
        finite: true,
        words: todas.words,
        accepted: todas.words.slice(0, 10).map((w) => (w === '' ? 'ε' : w)),
        rejected: rechazadas,
      }
    }
  }

  // --- busqueda de una descripcion exacta en el catalogo --------------------
  const candidatos = catalog(alphabet).filter((c) => subsetOf(L, c.automaton, alphabet))

  // Primero, ¿alguna propiedad sola ya es exactamente el lenguaje?
  for (const c of candidatos) {
    if (sameLanguage(L, c.automaton)) {
      return {
        exact: `las cadenas sobre Σ tales que ${c.texto}`,
        facts: [],
        summary,
        regex,
        finite: finito,
        accepted: muestra.words.slice(0, 10).map((w) => (w === '' ? 'ε' : w)),
        rejected: rechazadas,
      }
    }
  }

  // Si no, se combinan por interseccion de forma voraz: en cada paso se añade
  // la propiedad que mas recorta el lenguaje sin dejar de contenerlo.
  const elegidas: Candidate[] = []
  let actual = toDfa(B.anyString(alphabet), alphabet)
  let tamActual = countUpTo(actual, alphabet, 6)
  const objetivo = countUpTo(L, alphabet, 6)

  while (elegidas.length < 4 && tamActual > objetivo) {
    let mejor: Candidate | null = null
    let mejorTam = tamActual
    let mejorAut: Automaton | null = null
    for (const c of candidatos) {
      if (elegidas.includes(c)) continue
      const inter = product(actual, toDfa(c.automaton, alphabet), 'and')
      const tam = countUpTo(inter, alphabet, 6)
      if (tam < mejorTam) {
        mejorTam = tam
        mejor = c
        mejorAut = inter
      }
    }
    if (!mejor || !mejorAut) break
    elegidas.push(mejor)
    actual = mejorAut
    tamActual = mejorTam
    if (sameLanguage(actual, L)) break
  }

  const facts = (elegidas.length ? elegidas : candidatos.slice(0, 6)).map((c) => c.texto)

  if (elegidas.length && sameLanguage(actual, L)) {
    return {
      exact: `las cadenas sobre Σ que cumplen todo esto a la vez: ${facts.join('; ')}`,
      facts: [],
      summary,
      regex,
      finite: finito,
      accepted: muestra.words.slice(0, 10).map((w) => (w === '' ? 'ε' : w)),
      rejected: rechazadas,
    }
  }

  // No se encontro una frase exacta: se devuelven las propiedades demostradas.
  return {
    exact: null,
    facts,
    summary,
    regex,
    finite: finito,
    accepted: muestra.words.slice(0, 10).map((w) => (w === '' ? 'ε' : w)),
    rejected: rechazadas,
  }
}
