import { Automaton } from '../types'
import { completeDFA, inferAlphabet, renameSequential } from '../automaton'
import { autoLayout } from '../layout'
import * as B from './builders'

/**
 * Analizador de enunciados en español.
 *
 * No es un modelo de lenguaje: es un catalogo de patrones. Cada condicion que
 * reconoce se convierte en un AFD (ver builders.ts) y las condiciones se
 * combinan por INTERSECCION, que es lo que significa "y" en un enunciado como
 * "cadenas sobre {a,b} que empiecen con a y terminen en b".
 *
 * Si una parte del enunciado no encaja con ningun patron, se avisa al usuario
 * en vez de inventar un resultado.
 */

export interface NLClause {
  /** Texto original del fragmento. */
  text: string
  /** Como lo interpreto el sistema. */
  reading: string
  negated: boolean
  automaton: Automaton
}

export interface NLResult {
  ok: boolean
  alphabet: string[]
  clauses: NLClause[]
  /** Fragmentos que no se pudieron interpretar. */
  unmatched: string[]
  automaton?: Automaton
  /** Explicacion global para mostrar al usuario. */
  notes: string[]
  error?: string
}

/** Quita tildes y pasa a minusculas. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

/** Elimina la declaracion del alfabeto para que no estorbe al separar condiciones. */
function stripAlphabetDeclaration(text: string): string {
  return normalize(text)
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/(?:el\s+)?alfabeto\s*(?:es|son|=|:)?\s*(?:[a-z0-9](?:\s*[,y]\s*[a-z0-9])*)/g, ' ')
    .replace(/\bsigma\s*=?/g, ' ')
}

const NUM_WORDS: Record<string, number> = {
  cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5,
  seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
}

function toNumber(tok: string): number | null {
  if (/^\d+$/.test(tok)) return parseInt(tok, 10)
  const n = NUM_WORDS[tok]
  return n === undefined ? null : n
}

/** Extrae el alfabeto del enunciado; si no se declara, se deduce de las palabras citadas. */
export function extractAlphabet(text: string): { alphabet: string[]; declared: boolean } {
  const t = normalize(text)

  // "sobre {a,b}", "alfabeto = {0,1}", "Σ={a,b}"
  const braces = t.match(/\{([^}]*)\}/)
  if (braces) {
    const syms = braces[1]
      .split(/[,;\s]+/)
      .map((x) => x.trim())
      .filter(Boolean)
    if (syms.length) return { alphabet: [...new Set(syms)].sort(), declared: true }
  }

  // "alfabeto a, b" / "sobre el alfabeto a y b" / "con los simbolos 0 y 1"
  const decl = t.match(/(?:alfabeto|simbolos?)\s*(?:es|son|=|:)?\s*([a-z0-9](?:\s*[,y]\s*[a-z0-9])*)/)
  if (decl) {
    const syms = decl[1].split(/[,\s]*(?:,|y)[,\s]*|\s+/).map((x) => x.trim()).filter(Boolean)
    if (syms.length >= 1 && syms.every((s) => s.length === 1)) {
      return { alphabet: [...new Set(syms)].sort(), declared: true }
    }
  }

  // Deducir de las palabras que aparecen tras los verbos clave.
  const found = new Set<string>()
  const re = /(?:empiec\w*|comienc\w*|inici\w*|termin\w*|finalic\w*|conteng\w*|contien\w*|subcadena|con)\s+(?:con|en|por|la|el|los|las)?\s*"?([a-z0-9]+)"?/g
  let m: RegExpExecArray | null
  while ((m = re.exec(t))) {
    for (const ch of m[1]) found.add(ch)
  }
  if (found.size) return { alphabet: [...found].sort(), declared: false }

  return { alphabet: ['a', 'b'], declared: false }
}

/** Separa el enunciado en condiciones ("y", ",", "ademas", "tambien"). */
function splitClauses(text: string): string[] {
  return stripAlphabetDeclaration(text)
    .replace(/\s+/g, ' ')
    .split(/\s*(?:,|;|\by\b|\bademas\b|\btambien\b|\bque ademas\b)\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1)
}

interface Pattern {
  re: RegExp
  build: (m: RegExpMatchArray, alphabet: string[]) => { automaton: Automaton; reading: string } | null
}

const PATTERNS: Pattern[] = [
  // --- todas las cadenas ---------------------------------------------------
  {
    re: /\b(?:todas las cadenas|cualquier cadena|cualquier palabra|sigma\s*\*|todo el lenguaje)\b/,
    build: (_m, alpha) => ({ automaton: B.anyString(alpha), reading: 'cualquier cadena sobre Σ (Σ*)' }),
  },
  // --- empieza con ---------------------------------------------------------
  {
    re: /\b(?:empie[czs]\w*|comien[czs]\w*|inici\w*|principi\w*)\s+(?:con|en|por)\s+(?:la\s+|el\s+)?(?:letra\s+|simbolo\s+|subcadena\s+|cadena\s+)?"?([a-z0-9]+)"?/,
    build: (m, alpha) => ({ automaton: B.startsWith(alpha, m[1]), reading: `empieza con "${m[1]}"` }),
  },
  // --- termina en ----------------------------------------------------------
  {
    re: /\b(?:termin\w*|finali[czs]\w*|acab\w*)\s+(?:en|con|por)\s+(?:la\s+|el\s+)?(?:letra\s+|simbolo\s+|subcadena\s+|cadena\s+)?"?([a-z0-9]+)"?/,
    build: (m, alpha) => ({ automaton: B.endsWith(alpha, m[1]), reading: `termina en "${m[1]}"` }),
  },
  // --- cantidad par / impar de un simbolo ----------------------------------
  {
    re: /\b(?:numero|cantidad|numeros?)\s+(par|impar)\s+de\s+"?([a-z0-9])"?/,
    build: (m, alpha) => ({
      automaton: B.countMod(alpha, m[2], m[1] === 'par' ? 0 : 1, 2),
      reading: `cantidad ${m[1]} de "${m[2]}"`,
    }),
  },
  {
    re: /\b(?:numero|cantidad)\s+de\s+"?([a-z0-9])"?\s+(?:es\s+)?(par|impar)/,
    build: (m, alpha) => ({
      automaton: B.countMod(alpha, m[1], m[2] === 'par' ? 0 : 1, 2),
      reading: `cantidad ${m[2]} de "${m[1]}"`,
    }),
  },
  // --- cantidad multiplo de k de un simbolo -------------------------------
  {
    re: /\b(?:numero|cantidad)\s+de\s+"?([a-z0-9])"?\s+(?:sea\s+)?multiplo\s+de\s+(\d+)/,
    build: (m, alpha) => ({
      automaton: B.countMod(alpha, m[1], 0, parseInt(m[2], 10)),
      reading: `la cantidad de "${m[1]}" es multiplo de ${m[2]}`,
    }),
  },
  // --- al menos / exactamente n apariciones de un simbolo ------------------
  {
    re: /\b(?:al menos|minimo|por lo menos)\s+(\d+|un|una|uno|dos|tres|cuatro|cinco)\s+"?([a-z0-9])"?/,
    build: (m, alpha) => {
      const n = toNumber(m[1])
      return n === null ? null : { automaton: B.countAtLeast(alpha, m[2], n), reading: `al menos ${n} "${m[2]}"` }
    },
  },
  {
    re: /\bexactamente\s+(\d+|un|una|uno|dos|tres|cuatro|cinco)\s+"?([a-z0-9])"?(?!\w)/,
    build: (m, alpha) => {
      const n = toNumber(m[1])
      return n === null ? null : { automaton: B.countExactly(alpha, m[2], n), reading: `exactamente ${n} "${m[2]}"` }
    },
  },
  // --- longitud ------------------------------------------------------------
  {
    re: /\blongitud\s+(?:sea\s+|es\s+)?(par|impar)/,
    build: (m, alpha) => ({
      automaton: B.lengthMod(alpha, m[1] === 'par' ? 0 : 1, 2),
      reading: `longitud ${m[1]}`,
    }),
  },
  {
    re: /\blongitud\s+(?:sea\s+|es\s+)?multiplo\s+de\s+(\d+)/,
    build: (m, alpha) => ({
      automaton: B.lengthMod(alpha, 0, parseInt(m[1], 10)),
      reading: `longitud multiplo de ${m[1]}`,
    }),
  },
  {
    re: /\blongitud\s+(?:de\s+)?(?:al menos|minima|minimo|mayor o igual a|>=)\s+(\d+|un|una|dos|tres|cuatro|cinco)/,
    build: (m, alpha) => {
      const n = toNumber(m[1])
      return n === null ? null : { automaton: B.lengthAtLeast(alpha, n), reading: `longitud ≥ ${n}` }
    },
  },
  {
    re: /\blongitud\s+(?:de\s+)?(?:a lo sumo|a lo mas|maxima|maximo|menor o igual a|<=)\s+(\d+|un|una|dos|tres|cuatro|cinco)/,
    build: (m, alpha) => {
      const n = toNumber(m[1])
      return n === null ? null : { automaton: B.lengthAtMost(alpha, n), reading: `longitud ≤ ${n}` }
    },
  },
  {
    re: /\blongitud\s+(?:sea\s+|es\s+|de\s+)?(?:exactamente\s+|igual a\s+)?(\d+)(?!\s*\))/,
    build: (m, alpha) => ({
      automaton: B.lengthExactly(alpha, parseInt(m[1], 10)),
      reading: `longitud exactamente ${m[1]}`,
    }),
  },
  // --- multiplos en binario ------------------------------------------------
  {
    re: /\b(?:multiplos?|divisibles?)\s+(?:de|entre|por)\s+(\d+)/,
    build: (m, alpha) => ({
      automaton: B.divisibleBy(alpha, parseInt(m[1], 10)),
      reading: `numero en base ${alpha.length} multiplo de ${m[1]} (leido de izquierda a derecha)`,
    }),
  },
  // --- contiene (va al final: es el patron mas general) --------------------
  {
    re: /\b(?:conteng\w*|contien\w*|inclu\w*|teng\w*|hay|aparece|posea\w*)\s+(?:la\s+|el\s+|los\s+|las\s+)?(?:subcadena\s+|cadena\s+|secuencia\s+|letra\s+|simbolo\s+)?"?([a-z0-9]+)"?/,
    build: (m, alpha) => ({ automaton: B.contains(alpha, m[1]), reading: `contiene "${m[1]}"` }),
  },
]

/** Detecta negacion en el fragmento ("que no contengan..."). */
function isNegated(clause: string): boolean {
  return /\bno\b/.test(clause) && !/\bno\s+vacia\b/.test(clause)
}

export function parseStatement(text: string): NLResult {
  const notes: string[] = []
  const { alphabet, declared } = extractAlphabet(text)
  if (!declared) {
    notes.push(
      `No se declaro el alfabeto explicitamente, asi que se dedujo Σ = {${alphabet.join(', ')}} a partir del enunciado. ` +
        `Se puede indicar de forma explicita escribiendo por ejemplo "sobre {a,b}".`,
    )
  }

  const raw = splitClauses(text)
  const clauses: NLClause[] = []
  const unmatched: string[] = []

  for (const frag of raw) {
    // Se descartan trozos sin contenido semantico.
    if (/^(cadenas?|palabras?|las cadenas|el lenguaje|de cadenas|sobre|el alfabeto|conjunto)/.test(frag) && frag.length < 22) {
      continue
    }
    let matched = false
    for (const p of PATTERNS) {
      const m = frag.match(p.re)
      if (!m) continue
      const built = p.build(m, alphabet)
      if (!built) continue
      const negated = isNegated(frag)
      const complete = completeDFA(built.automaton).automaton
      clauses.push({
        text: frag,
        reading: negated ? `NO ${built.reading}` : built.reading,
        negated,
        automaton: negated ? B.complement(complete, `no ${built.automaton.name}`) : complete,
      })
      matched = true
      break
    }
    if (!matched && /[a-z]{3}/.test(frag)) unmatched.push(frag)
  }

  if (clauses.length === 0) {
    return {
      ok: false,
      alphabet,
      clauses: [],
      unmatched,
      notes,
      error:
        'No se reconocio ninguna condicion en el enunciado. Se pueden usar frases como "cadenas sobre {a,b} que empiecen con a y terminen en bb", ' +
        '"con numero par de a", "de longitud impar", "que no contengan aa", "binarios multiplos de 3". ' +
        'Tambien se puede describir el lenguaje con una expresion regular en la pestaña correspondiente.',
    }
  }

  if (unmatched.length) {
    notes.push(
      `No se pudieron interpretar estos fragmentos y se ignoraron: ${unmatched.map((u) => `"${u}"`).join(', ')}. ` +
        `El automata resultante solo refleja las condiciones que si se entendieron.`,
    )
  }

  let automaton = clauses[0].automaton
  for (let i = 1; i < clauses.length; i++) {
    automaton = B.product(automaton, clauses[i].automaton, 'and')
  }
  automaton = autoLayout(renameSequential({ ...automaton, name: 'Automata del enunciado', alphabet: inferAlphabet(automaton) }))

  if (clauses.length > 1) {
    notes.push(
      `Se combinaron ${clauses.length} condiciones por interseccion (construccion del producto): una cadena se acepta solo si cumple todas.`,
    )
  }

  return { ok: true, alphabet, clauses, unmatched, automaton, notes }
}
