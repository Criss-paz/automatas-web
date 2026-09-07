import { Automaton } from '../types'
import { completeDFA, inferAlphabet, isDeterministic, renameSequential } from '../automaton'
import { subsetConstruction } from '../algorithms/subset'
import { autoLayout } from '../layout'
import { parseRegex, alphabetOf } from '../regex/parser'
import { thompson } from '../regex/thompson'
import * as B from './builders'

/**
 * Analizador de enunciados en español.
 *
 * No es un modelo de lenguaje: es un catalogo de patrones. Cada condicion que
 * reconoce se convierte en un automata (ver builders.ts) y despues se combinan
 * respetando la estructura logica del enunciado:
 *
 *   - "y" / "," / "ademas" / "ni"  -> INTERSECCION (producto)
 *   - "o" / "o bien"               -> UNION        (producto)
 *   - "no" / "sin" / "excepto"     -> COMPLEMENTO
 *
 * Si una parte del enunciado no encaja con ningun patron, se avisa al usuario
 * en vez de inventar un resultado. Si el lenguaje pedido no es regular, se
 * explica por que ningun automata finito puede reconocerlo.
 */

export interface NLClause {
  /** Texto original del fragmento. */
  text: string
  /** Como lo interpreto el sistema. */
  reading: string
  negated: boolean
  /** Automata para mostrar: puede ser un AFN (p. ej. "el penultimo simbolo es a"). */
  automaton: Automaton
  /** Version determinista y completa, la que se usa para combinar condiciones. */
  dfa: Automaton
}

/** Condiciones unidas por "y" (interseccion). */
export interface NLGroup {
  clauses: NLClause[]
}

export interface NLResult {
  ok: boolean
  alphabet: string[]
  /** Todas las condiciones, en orden de aparicion. */
  clauses: NLClause[]
  /** Grupos de condiciones; entre grupos la relacion es la union. */
  groups: NLGroup[]
  combination: 'unica' | 'interseccion' | 'union' | 'mixta'
  /** Lectura logica completa, p. ej. "(empieza con a Y termina en b) O (longitud par)". */
  structure: string
  /** Fragmentos que no se pudieron interpretar. */
  unmatched: string[]
  automaton?: Automaton
  /** Explicacion global para mostrar al usuario. */
  notes: string[]
  error?: string
}

/** Quita tildes, normaliza comillas y pasa a minusculas. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u201c\u201d"']/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

// ---------------------------------------------------------------------------
// Numeros y ordinales
// ---------------------------------------------------------------------------

const NUM_WORDS: Record<string, number> = {
  cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5,
  seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12,
}

/** Posicion contando desde el inicio. */
const ORD_START: Record<string, number> = {
  primer: 1, primero: 1, primera: 1, segundo: 2, segunda: 2, tercer: 3,
  tercero: 3, tercera: 3, cuarto: 4, cuarta: 4, quinto: 5, quinta: 5,
  sexto: 6, sexta: 6, septimo: 7, septima: 7, octavo: 8, octava: 8,
  noveno: 9, novena: 9, decimo: 10, decima: 10,
}

/** Posicion contando desde el final. */
const ORD_END: Record<string, number> = {
  ultimo: 1, ultima: 1, penultimo: 2, penultima: 2, antepenultimo: 3, antepenultima: 3,
}

function toNumber(tok: string): number | null {
  if (/^\d+$/.test(tok)) return parseInt(tok, 10)
  const n = NUM_WORDS[tok]
  if (n !== undefined) return n
  const o = ORD_START[tok]
  return o === undefined ? null : o
}

// ---------------------------------------------------------------------------
// Alfabeto
// ---------------------------------------------------------------------------

/**
 * Separador entre simbolos de una lista. "y"/"o"/"e" solo cuentan como
 * separador cuando van sueltas: si no, "sea a" se leeria como la lista s-e-a.
 */
const SEP = '(?:\\s*[,;]\\s*|\\s+(?:y|o|e)\\s+)'
/** Lista de simbolos ("a, b", "0 y 1"). El ultimo no puede seguir con otra letra. */
const LIST_RE = `[a-z0-9](?:${SEP}[a-z0-9])*(?![a-z0-9])`
/** Igual, pero con dos simbolos como minimo: es lo que exige declarar un alfabeto. */
const LIST2_RE = `[a-z0-9](?:${SEP}[a-z0-9])+(?![a-z0-9])`
/**
 * Tras la palabra "alfabeto" tambien vale separar con espacios ("alfabeto a b"),
 * porque ahi no hay riesgo de confundir la lista con el resto de la frase.
 */
const DECL_LIST_RE = `[a-z0-9](?:(?:${SEP}|\\s+)[a-z0-9])+(?![a-z0-9])`

/**
 * "a b y" -> "a b": la conjuncion final no es un simbolo (pero en "x, y" la "y"
 * si lo es, porque va detras de una coma).
 *
 * Se escribe capturando el caracter anterior en vez de con un lookbehind
 * "(?<!...)": Safari no admitio lookbehind hasta la version 16.4 y un regex asi
 * es un error de sintaxis que tumbaria la aplicacion entera al cargarla.
 */
const dropTrailingConjunction = (list: string) => list.replace(/([^,;\s])\s+(?:y|o|e)\s*$/, '$1')

/** Convierte "a, b y c" en ['a','b','c']. */
function parseSymbolList(s: string): string[] {
  return [
    ...new Set(
      s
        .split(/\s*(?:,|;|\by\b|\bo\b|\be\b|\s)\s*/)
        .map((x) => x.trim())
        .filter((x) => /^[a-z0-9]$/.test(x)),
    ),
  ]
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

  // "alfabeto a, b" / "con los simbolos 0 y 1" / "vocabulario a, b"
  const decl = t.match(new RegExp(`(?:alfabeto|vocabulario|simbolos?)\\s*(?:es|son|=|:)?\\s*(${DECL_LIST_RE})`))
  if (decl) {
    const syms = parseSymbolList(dropTrailingConjunction(decl[1]))
    if (syms.length) return { alphabet: syms.sort(), declared: true }
  }

  // "sobre a, b" / "el lenguaje es sobre a y b" / "definido en a, b"
  const over = t.match(new RegExp(`\\b(?:sobre|en)\\s+(?:el\\s+)?(?:alfabeto\\s+)?(${LIST2_RE})`))
  if (over) {
    const syms = parseSymbolList(over[1])
    if (syms.length >= 2) return { alphabet: syms.sort(), declared: true }
  }

  // Deducir de las palabras que aparecen tras los verbos clave.
  const found = new Set<string>()
  const re =
    /(?:empie[cz]\w*|comien\w*|inici\w*|termin\w*|finali[cz]\w*|acab\w*|conteng\w*|contien\w*|subcadena|prefijo|sufijo|simbolo|letra|sea|con)\s+(?:con|en|por|la|el|los|las)?\s*"?([a-z0-9]+)"?/g
  let m: RegExpExecArray | null
  while ((m = re.exec(t))) {
    for (const ch of m[1]) found.add(ch)
  }
  if (found.size) return { alphabet: [...found].sort(), declared: false }

  return { alphabet: ['a', 'b'], declared: false }
}

// ---------------------------------------------------------------------------
// Limpieza del enunciado
// ---------------------------------------------------------------------------

/** Elimina la declaracion del alfabeto para que no estorbe al separar condiciones. */
function stripAlphabetDeclaration(t: string): string {
  return t
    .replace(/\{[^}]*\}/g, ' ')
    .replace(new RegExp(`(?:el\\s+)?(?:alfabeto|vocabulario|simbolos?)\\s*(?:es|son|=|:)?\\s*(?:${DECL_LIST_RE})`, 'g'), ' ')
    .replace(new RegExp(`\\b(?:sobre|en)\\s+(?:el\\s+)?(?:alfabeto\\s+)?(?:${LIST2_RE})`, 'g'), ' ')
    .replace(/\bsigma\s*=?/g, ' ')
    .replace(/\bel\s+lenguaje\s+(?:es|esta)\s+(?:definid\w+\s+)?$/g, ' ')
}

/**
 * Quita la parte del enunciado que habla del ejercicio y no del lenguaje:
 * "Disene un AFD que...", "Construya el automata finito deterministico que...".
 */
function stripMeta(t: string): string {
  return t
    .replace(
      /\b(?:construy\w+|constru\w+|disen\w+|elabor\w+|realic\w+|realiz\w+|haga|hacer|dibuj\w+|obteng\w+|encuentr\w+|hall\w+|escrib\w+|determine\b|determina\b|especifiq\w+|proporcion\w+|represent\w+|model\w+)\b/g,
      ' ',
    )
    .replace(
      /\b(?:un|una|el|la|los|las)?\s*(?:afd|afn|afne|afn-?e|af-?d|af-?n|dfa|nfa|nfa-?e|automata\s+finito(?:\s+no)?(?:\s+determinist\w+)?|automatas?|maquina\s+de\s+estados)\b/g,
      ' ',
    )
    .replace(/\b(?:diagrama\s+de\s+(?:estados|transicion\w*)|tabla\s+de\s+transicion\w*|quintupla|quintuplo)\b/g, ' ')
    .replace(/\b(?:ejercicio|problema|inciso|literal|apartado)\s*\d*\s*[).:-]?/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Reescribe coordinaciones que, de separarse por "y", perderian su objeto:
 * "empiecen y terminen en a" -> "empiecen con a y terminen en a".
 */
function expandCoordination(t: string): string {
  return (
    t
      // "empiece y termine con el mismo simbolo"
      .replace(
        /\b(?:empie[czs]\w*|comien[czs]\w*|inici\w*)\s+y\s+(?:termin\w*|finali[czs]\w*|acab\w*)\s+(?:en|con|por)\s+(?:el\s+|la\s+)?mism[ao]\s*(?:simbolo|caracter|letra|digito)?/g,
        ' mismoextremo ',
      )
      // "el primer y el ultimo simbolo sean iguales"
      .replace(
        /\b(?:el\s+)?prime\w*\s+y\s+(?:el\s+)?ultim\w*\s+(?:simbolo|caracter|letra|digito)s?\s+(?:sean|son|es|sea)\s+igual\w*/g,
        ' mismoextremo ',
      )
      // "empiecen y terminen en X"
      .replace(
        /\b(empie[czs]\w*|comien[czs]\w*|inici\w*)\s+y\s+(termin\w*|finali[czs]\w*|acab\w*)\s+(?:en|con|por)\s+("?[a-z0-9]+"?)/g,
        (_m, a, b, w) => `${a} con ${w} y ${b} en ${w}`,
      )
      // "no contengan ni aa ni bb": el primer "ni" sobra
      .replace(/\b(conteng\w*|contien\w*|teng\w*|empie[czs]\w*|termin\w*|us\w*|inclu\w*)\s+ni\s+/g, '$1 ')
      // "excepto" / "salvo" equivalen a una negacion añadida
      .replace(/\b(?:excepto|salvo)\s+(?:las?\s+|los?\s+)?(?:cadenas?\s+|palabras?\s+)?(?:que\s+)?/g, ' y no ')
  )
}

/** Protege los "y"/"o" que forman parte de una expresion y no separan condiciones. */
function protectPhrases(t: string): string {
  return t
    .replace(/\bentre\s+(\S+)\s+y\s+(\S+)/g, (_m, a, b) => `entre ${a} \u00a7Y\u00a7 ${b}`)
    .replace(/\b(\d+|un|uno|una|dos|tres|cero)\s+o\s+mas\b/g, (_m, a) => `${a} \u00a7O\u00a7 mas`)
    .replace(/\b(mayor|menor)\s+o\s+igual\b/g, (_m, a) => `${a} \u00a7O\u00a7 igual`)
}

/** Encabezados que anuncian una lista de cadenas concretas ("acepte solo a, ab y ba"). */
const FINITE_HEAD =
  '(?:(?:acept\\w+|reconoz\\w+|reconoc\\w+|admit\\w+|valid\\w+)\\s+' +
  '(?:solo|unicamente|solamente|exclusivamente|nada\\s+mas)\\s+(?:a\\s+)?' +
  '(?:la\\s+|las\\s+|el\\s+|los\\s+)?(?:cadenas?\\s+|palabras?\\s+|strings?\\s+)?' +
  '|(?:el\\s+)?lenguaje\\s+(?:es|sea|=|:)\\s*)'

const FINITE_LIST_RE = new RegExp(
  `\\b(${FINITE_HEAD})("?[a-z0-9]+"?(?:\\s*(?:,|;|\\by\\b|\\bo\\b)\\s*"?[a-z0-9]+"?)*)`,
  'g',
)

/**
 * En "acepte unicamente las cadenas a, ab y ba" las comas y las "y" enumeran
 * el lenguaje, no separan condiciones: se sustituyen por un separador propio
 * para que la lista llegue entera al catalogo de patrones. Se protege solo el
 * tramo inicial de items que de verdad son cadenas sobre \u03a3.
 */
function protectFiniteList(t: string, alphabet: string[]): string {
  return t.replace(FINITE_LIST_RE, (whole, head: string, list: string) => {
    const parts = list.split(/(\s*(?:,|;|\by\b|\bo\b)\s*)/)
    const kept: string[] = []
    let cut = -1
    for (let i = 0; i < parts.length; i += 2) {
      const w = parts[i].replace(/"/g, '').trim()
      if (!w || ![...w].every((c) => alphabet.includes(c))) {
        cut = i
        break
      }
      kept.push(w)
    }
    if (kept.length < 2) return whole
    // Lo que sigue al primer item invalido se deja tal cual (incluido su separador).
    const rest = cut >= 0 ? parts.slice(cut - 1).join('') : ''
    return head + kept.join(' \u00a7C\u00a7 ') + rest
  })
}

const unprotect = (s: string) =>
  s
    .replace(/\u00a7Y\u00a7/g, 'y')
    .replace(/\u00a7O\u00a7/g, 'o')
    .replace(/\s*\u00a7C\u00a7\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim()

// ---------------------------------------------------------------------------
// Lenguajes que NO son regulares
// ---------------------------------------------------------------------------

const NON_REGULAR: Array<{ re: RegExp; what: string }> = [
  {
    re: new RegExp('\\b(?:igual|mism[ao]s?)\\s+(?:numero|cantidad|numeros)\\s+de\\s+"?([a-z0-9])"?\\s+(?:que|como|y)\\s+(?:de\\s+)?"?([a-z0-9])"?'),
    what: 'la misma cantidad de dos simbolos',
  },
  { re: /\btant[ao]s\s+"?[a-z0-9]"?\s+como\s+"?[a-z0-9]"?/, what: 'tantos simbolos de un tipo como de otro' },
  { re: /\bmas\s+"?[a-z0-9]"?\s+que\s+"?[a-z0-9]"?(?!\w)/, what: 'comparar la cantidad de dos simbolos' },
  {
    re: /\b(?:numero|cantidad)\s+de\s+"?[a-z0-9]"?\s+(?:sea\s+)?(?:mayor|menor)\s+(?:o\s+igual\s+)?(?:que|a|al)\s+(?:el\s+|la\s+)?(?:numero|cantidad)\s+de/,
    what: 'comparar la cantidad de dos simbolos',
  },
  { re: /\b([a-z])\s*\^?\s*n\s*\^?\s*([a-z])\s*\^?\s*n\b/, what: 'la forma a\u207fb\u207f' },
  { re: /\bpalindrom\w*|\bcapicua\w*/, what: 'los palindromos' },
  {
    re: /\bbalancead\w*|\bparentesis\s+bien\s+(?:formad|balancead)\w*|\bcorrectamente\s+anidad\w*/,
    what: 'los parentesis balanceados',
  },
  { re: /\b(?:cuadrad\w+\s+perfect\w+|numeros?\s+primos?)\b/, what: 'longitudes que forman cuadrados perfectos o primos' },
]

function detectNonRegular(t: string): string | null {
  for (const nr of NON_REGULAR) {
    if (nr.re.test(t)) {
      return (
        `El enunciado describe ${nr.what}, y ese lenguaje **no es regular**: ningun AFD ni AFN puede reconocerlo. ` +
        `Un automata finito solo tiene una cantidad fija de estados, asi que no puede llevar un contador sin limite; ` +
        `esto se demuestra con el **lema del bombeo**. Haria falta un automata de pila (lenguaje libre de contexto). ` +
        `Si lo que se buscaba era una condicion parecida pero si regular, se puede pedir por ejemplo ` +
        `"cantidad par de a", "la cantidad de a es multiplo de 3" o "al menos 2 a y a lo sumo 4 b".`
      )
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Catalogo de patrones
// ---------------------------------------------------------------------------

const ART = '(?:la\\s+|el\\s+|los\\s+|las\\s+|una\\s+|un\\s+|su\\s+)?'
const KIND =
  '(?:letras?\\s+|simbolos?\\s+|caracteres?\\s+|digitos?\\s+|subcadenas?\\s+|cadenas?\\s+|palabras?\\s+|secuencias?\\s+|strings?\\s+|substring\\s+)?'
const W = '"?([a-z0-9]+)"?'
const S = '"?([a-z0-9])"?'
const NUM = '(\\d+|cero|un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)'

interface Pattern {
  id: string
  re: RegExp
  /** Indices de captura que deben ser palabras formadas con simbolos de Sigma. */
  words?: number[]
  /** El patron ya expresa la negacion: no volver a negarlo aunque contenga "no". */
  noNegate?: boolean
  build: (m: RegExpMatchArray, alphabet: string[]) => { automaton: Automaton; reading: string } | null
}

const rx = (s: string) => new RegExp(s)

const PATTERNS: Pattern[] = [
  // --- lenguajes triviales -------------------------------------------------
  {
    id: 'vacio',
    re: /\b(?:no\s+acept\w*\s+(?:ninguna|ningun|nada)|lenguaje\s+vacio|conjunto\s+vacio)\b/,
    noNegate: true,
    build: (_m, alpha) => ({ automaton: B.emptyLanguage(alpha), reading: 'no acepta ninguna cadena (L = \u2205)' }),
  },
  {
    id: 'solo-vacia',
    re: /\b(?:solo|unicamente|solamente|exclusivamente)\s+(?:acept\w*\s+)?(?:a\s+)?(?:la\s+)?cadena\s+vacia\b/,
    noNegate: true,
    build: (_m, alpha) => ({ automaton: B.exactWord(alpha, ''), reading: 'solo la cadena vacia (L = {\u03b5})' }),
  },
  {
    id: 'no-vacia',
    re: /\b(?:no\s+(?:sean|son|este[nm]|es)?\s*vacias?|cadenas?\s+no\s+vacias?|distintas?\s+de\s+(?:la\s+)?(?:cadena\s+)?vacia|longitud\s+mayor\s+(?:que|a)\s+cero)\b/,
    noNegate: true,
    build: (_m, alpha) => ({ automaton: B.lengthAtLeast(alpha, 1), reading: 'la cadena no es vacia (|w| \u2265 1)' }),
  },
  {
    id: 'todas',
    re: /\b(?:todas las cadenas|cualquier cadena|cualquier palabra|sigma\s*\*|todo el lenguaje|todas las palabras)\b/,
    build: (_m, alpha) => ({ automaton: B.anyString(alpha), reading: 'cualquier cadena sobre \u03a3 (\u03a3*)' }),
  },

  // --- posicion contando desde el FINAL (el caso clasico de AFN) -----------
  {
    id: 'ordinal-final',
    re: rx(
      '\\b(?:el\\s+|la\\s+)?(ultim[ao]|penultim[ao]|antepenultim[ao])\\s*(?:simbolo|caracter|letra|digito|elemento|posicion)?\\s*' +
        '(?:de\\s+la\\s+cadena\\s+)?(?:sea|es|debe\\s+ser|tiene\\s+que\\s+ser|fuera|sera|:)?\\s*' +
        ART +
        KIND +
        S,
    ),
    words: [2],
    build: (m, alpha) => {
      const k = ORD_END[m[1]]
      if (!k) return null
      const orden = k === 1 ? 'ultimo' : k === 2 ? 'penultimo' : 'antepenultimo'
      return {
        // Para k = 1 el AFD directo es mas claro; para k >= 2 el AFN es el ejemplo canonico.
        automaton: k === 1 ? B.endsWith(alpha, m[2]) : B.symbolFromEnd(alpha, m[2], k),
        reading: `el ${orden} simbolo es "${m[2]}"`,
      }
    },
  },
  {
    id: 'posicion-desde-final',
    re: rx(
      '\\b(?:el\\s+|la\\s+)?' +
        NUM +
        '\\s*[oa]?\\s*(?:simbolo|caracter|letra|digito|posicion)\\s+' +
        '(?:contando\\s+)?(?:desde|de|a\\s+partir\\s+de|empezando\\s+por)\\s+(?:el\\s+|la\\s+)?(?:final|derecha|atras|ultimo)\\s*' +
        '(?:sea|es|debe\\s+ser|:)?\\s*' +
        ART +
        KIND +
        S,
    ),
    words: [2],
    build: (m, alpha) => {
      const k = toNumber(m[1])
      if (k === null || k < 1) return null
      return {
        automaton: k === 1 ? B.endsWith(alpha, m[2]) : B.symbolFromEnd(alpha, m[2], k),
        reading: `el simbolo ${k}\u00ba contando desde el final es "${m[2]}"`,
      }
    },
  },
  {
    id: 'ordinal-desde-final',
    re: rx(
      '\\b(?:el\\s+|la\\s+)?(primer[ao]?|segund[ao]|tercer[ao]?|cuart[ao]|quint[ao]|sext[ao]|septim[ao]|octav[ao]|noven[ao]|decim[ao])\\s+' +
        '(?:simbolo|caracter|letra|digito|elemento|posicion)\\s+' +
        '(?:contando\\s+)?(?:desde|de|a\\s+partir\\s+de|empezando\\s+por)\\s+(?:el\\s+|la\\s+)?(?:final|derecha|atras|ultimo)\\s*' +
        '(?:sea|es|debe\\s+ser|:) ?\\s*' +
        ART +
        KIND +
        S,
      ),
    words: [2],
    build: (m, alpha) => {
      const k = ORD_START[m[1]] ?? ORD_START[m[1] + 'o']
      if (!k) return null
      return {
        automaton: k === 1 ? B.endsWith(alpha, m[2]) : B.symbolFromEnd(alpha, m[2], k),
        reading: `el simbolo ${k}º contando desde el final es "${m[2]}"`,
      }
    },
  },

  // --- posicion contando desde el INICIO ----------------------------------
  {
    id: 'ordinal-inicio',
    re: rx(
      '\\b(?:el\\s+|la\\s+)?(primer[ao]?|segund[ao]|tercer[ao]?|cuart[ao]|quint[ao]|sext[ao]|septim[ao]|octav[ao]|noven[ao]|decim[ao])\\s+' +
        '(?:simbolo|caracter|letra|digito|elemento|posicion)\\s*(?:de\\s+la\\s+cadena\\s+)?' +
        '(?:sea|es|debe\\s+ser|tiene\\s+que\\s+ser|:)?\\s*' +
        ART +
        KIND +
        S,
    ),
    words: [2],
    build: (m, alpha) => {
      const k = ORD_START[m[1]] ?? ORD_START[m[1] + 'o']
      if (!k) return null
      return {
        automaton: k === 1 ? B.startsWith(alpha, m[2]) : B.symbolFromStart(alpha, m[2], k),
        reading: `el simbolo ${k}\u00ba es "${m[2]}"`,
      }
    },
  },
  {
    // "el primero sea b": el sustantivo se sobreentiende, pero entonces el verbo
    // es obligatorio para no confundirlo con cualquier otro uso del ordinal.
    id: 'ordinal-inicio-corto',
    re: rx(
      '\\b(?:el\\s+|la\\s+)?(primer[ao]?|segund[ao]|tercer[ao]?|cuart[ao]|quint[ao]|sext[ao])\\s+' +
        '(?:sea|es|debe\\s+ser|tiene\\s+que\\s+ser)\\s+' +
        ART +
        KIND +
        S,
    ),
    words: [2],
    build: (m, alpha) => {
      const k = ORD_START[m[1]] ?? ORD_START[m[1] + 'o']
      if (!k) return null
      return {
        automaton: k === 1 ? B.startsWith(alpha, m[2]) : B.symbolFromStart(alpha, m[2], k),
        reading: `el simbolo ${k}º es "${m[2]}"`,
      }
    },
  },
  {
    id: 'posicion-inicio',
    re: rx('\\b(?:en\\s+)?la\\s+posicion\\s+' + NUM + '\\s*(?:sea|es|haya|hay|este|va)?\\s*' + ART + KIND + S),
    words: [2],
    build: (m, alpha) => {
      const k = toNumber(m[1])
      if (k === null || k < 1) return null
      return { automaton: B.symbolFromStart(alpha, m[2], k), reading: `el simbolo en la posicion ${k} es "${m[2]}"` }
    },
  },

  // --- empieza / termina con el mismo simbolo ------------------------------
  {
    id: 'mismo-extremo',
    re: /\bmismoextremo\b/,
    build: (_m, alpha) => ({
      automaton: B.startsAndEndsSame(alpha),
      reading: 'empieza y termina con el mismo simbolo',
    }),
  },

  // --- empieza con ---------------------------------------------------------
  {
    id: 'empieza',
    re: rx(
      '\\b(?:empie[czs]\\w*|comien[czs]\\w*|inici\\w*|principi\\w*|arranq\\w*|arranc\\w*)\\s+(?:con|en|por|de)\\s+' +
        ART +
        KIND +
        W,
    ),
    words: [1],
    build: (m, alpha) => ({ automaton: B.startsWith(alpha, m[1]), reading: `empieza con "${m[1]}"` }),
  },
  {
    id: 'prefijo',
    re: rx('\\b(?:como\\s+)?prefijo\\s*(?:sea|es|:)?\\s*' + ART + KIND + W),
    words: [1],
    build: (m, alpha) => ({ automaton: B.startsWith(alpha, m[1]), reading: `tiene el prefijo "${m[1]}"` }),
  },

  // --- termina en ----------------------------------------------------------
  {
    id: 'termina',
    re: rx(
      '\\b(?:termin\\w*|finali[czs]\\w*|acab\\w*|conclu\\w*|cierr\\w*|remat\\w*)\\s+(?:en|con|por|de)\\s+' +
        ART +
        KIND +
        W,
    ),
    words: [1],
    build: (m, alpha) => ({ automaton: B.endsWith(alpha, m[1]), reading: `termina en "${m[1]}"` }),
  },
  {
    id: 'sufijo',
    re: rx('\\b(?:como\\s+)?sufijo\\s*(?:sea|es|:)?\\s*' + ART + KIND + W),
    words: [1],
    build: (m, alpha) => ({ automaton: B.endsWith(alpha, m[1]), reading: `tiene el sufijo "${m[1]}"` }),
  },

  // --- solo estos simbolos -------------------------------------------------
  {
    id: 'solo-simbolos',
    re: rx(
      '\\b(?:formad\\w+|compuest\\w+|constituid\\w+|consten|conste|constan|hech\\w+|integrad\\w+)\\s+' +
        '(?:solo\\s+|unicamente\\s+|solamente\\s+|exclusivamente\\s+|nada\\s+mas\\s+)?(?:por|de|con)\\s+' +
        '(?:solo\\s+|unicamente\\s+|solamente\\s+|exclusivamente\\s+|nada\\s+mas\\s+)?' +
        ART +
        KIND +
        '(' +
        LIST_RE +
        ')',
    ),
    build: (m, alpha) => {
      const syms = parseSymbolList(m[1]).filter((s) => alpha.includes(s))
      if (!syms.length) return null
      return { automaton: B.onlySymbols(alpha, syms), reading: `formada solo por {${syms.join(', ')}}` }
    },
  },
  {
    id: 'solo-contiene',
    re: rx(
      '\\b(?:solo|unicamente|solamente|exclusivamente)\\s+(?:conteng\\w+|contien\\w+|teng\\w+|us\\w+|apare[zc]\\w+|hay)\\s+' +
        ART +
        KIND +
        '(' +
        LIST_RE +
        ')',
    ),
    build: (m, alpha) => {
      const syms = parseSymbolList(m[1]).filter((s) => alpha.includes(s))
      if (!syms.length) return null
      return { automaton: B.onlySymbols(alpha, syms), reading: `usa solo los simbolos {${syms.join(', ')}}` }
    },
  },

  // --- acepta unicamente la(s) cadena(s) ... -------------------------------
  {
    id: 'solo-cadenas',
    re: rx(
      '\\b(?:acept\\w+|reconoz\\w+|reconoc\\w+|admit\\w+|valid\\w+)\\s+' +
        '(?:solo|unicamente|solamente|exclusivamente|nada\\s+mas)\\s+(?:a\\s+)?' +
        ART +
        KIND +
        '("?[a-z0-9]+"?(?:\\s*§C§\\s*"?[a-z0-9]+"?)*)',
    ),
    build: (m, alpha) => {
      const words = m[1]
        .split(/\s*§C§\s*/)
        .map((w) => w.replace(/"/g, '').trim())
        .filter(Boolean)
      if (!words.length || !words.every((w) => [...w].every((c) => alpha.includes(c)))) return null
      const show = words.map((w) => `"${w}"`).join(', ')
      return {
        automaton: B.oneOfWords(alpha, words),
        reading: words.length === 1 ? `acepta unicamente la cadena ${show}` : `acepta unicamente las cadenas ${show}`,
      }
    },
  },
  {
    id: 'solo-simbolo',
    re: rx('\\b(?:solo|unicamente|solamente|exclusivamente|nada\\s+mas)\\s+' + S + '(?!\\w)'),
    words: [1],
    build: (m, alpha) => ({ automaton: B.onlySymbols(alpha, [m[1]]), reading: `formada solo por "${m[1]}"` }),
  },
  {
    id: 'solo-cadena-w',
    re: rx('\\b(?:solo|unicamente|solamente|exclusivamente)\\s+' + ART + '(?:cadena|palabra|string)\\s+' + W),
    words: [1],
    build: (m, alpha) => ({ automaton: B.exactWord(alpha, m[1]), reading: `acepta unicamente la cadena "${m[1]}"` }),
  },
  {
    id: 'lenguaje-finito',
    re: rx(
      '\\b(?:el\\s+)?lenguaje\\s+(?:es|sea|=|:)\\s*("?[a-z0-9]+"?(?:\\s*§C§\\s*"?[a-z0-9]+"?)*)\\s*$',
    ),
    build: (m, alpha) => {
      const words = m[1]
        .split(/\s*§C§\s*/)
        .map((w) => w.replace(/"/g, '').trim())
        .filter(Boolean)
      if (!words.length || !words.every((w) => [...w].every((c) => alpha.includes(c)))) return null
      return { automaton: B.oneOfWords(alpha, words), reading: `el lenguaje es exactamente {${words.join(', ')}}` }
    },
  },

  // --- simbolos alternados -------------------------------------------------
  {
    id: 'alternados',
    re: /\b(?:alternad\w+|se\s+alternan|alternen|alternando)\b|\b(?:dos|2)\s+(?:simbolos?|letras?|caracteres?)\s+iguales?\s+(?:consecutiv\w+|seguid\w+|adyacentes|juntos)\b/,
    noNegate: true,
    build: (_m, alpha) => ({
      automaton: B.noRepeatedAdjacent(alpha),
      reading: 'los simbolos se alternan (nunca dos iguales seguidos)',
    }),
  },

  // --- cantidad par / impar ------------------------------------------------
  {
    id: 'paridad-1',
    re: rx('\\b(?:numero|cantidad|numeros|total)\\s+(par|impar)\\s+de\\s+' + ART + KIND + S),
    words: [2],
    build: (m, alpha) => ({
      automaton: B.countMod(alpha, m[2], m[1] === 'par' ? 0 : 1, 2),
      reading: `cantidad ${m[1]} de "${m[2]}"`,
    }),
  },
  {
    id: 'paridad-2',
    re: rx('\\b(?:numero|cantidad|total)\\s+de\\s+' + ART + KIND + S + '\\s+(?:que\\s+)?(?:sea|es|sean)?\\s*(par|impar)'),
    words: [1],
    build: (m, alpha) => ({
      automaton: B.countMod(alpha, m[1], m[2] === 'par' ? 0 : 1, 2),
      reading: `cantidad ${m[2]} de "${m[1]}"`,
    }),
  },
  {
    id: 'paridad-3',
    re: rx('\\bun[a]?\\s+(?:numero|cantidad)\\s+(par|impar)\\s+de\\s+' + S),
    words: [2],
    build: (m, alpha) => ({
      automaton: B.countMod(alpha, m[2], m[1] === 'par' ? 0 : 1, 2),
      reading: `cantidad ${m[1]} de "${m[2]}"`,
    }),
  },

  // --- cantidad multiplo de k ---------------------------------------------
  {
    id: 'cantidad-multiplo',
    re: rx(
      '\\b(?:numero|cantidad|total)\\s+de\\s+' +
        ART +
        KIND +
        S +
        '\\s+(?:que\\s+)?(?:sea\\s+|es\\s+)?(?:multiplo|divisible)\\s+(?:de|entre|por)\\s+(\\d+)',
    ),
    words: [1],
    build: (m, alpha) => ({
      automaton: B.countMod(alpha, m[1], 0, parseInt(m[2], 10)),
      reading: `la cantidad de "${m[1]}" es multiplo de ${m[2]}`,
    }),
  },
  {
    id: 'cantidad-congruente',
    re: rx(
      '\\b(?:numero|cantidad)\\s+de\\s+' + S + '\\s+(?:sea\\s+)?congruente\\s+(?:con|a)\\s+(\\d+)\\s+(?:modulo|mod)\\s+(\\d+)',
    ),
    words: [1],
    build: (m, alpha) => ({
      automaton: B.countMod(alpha, m[1], parseInt(m[2], 10), parseInt(m[3], 10)),
      reading: `la cantidad de "${m[1]}" \u2261 ${m[2]} (mod ${m[3]})`,
    }),
  },

  // --- ninguna aparicion ---------------------------------------------------
  {
    id: 'ninguna',
    re: rx('\\b(?:ninguna|ningun|sin)\\s+(?:aparicion(?:es)?\\s+de\\s+)?' + ART + KIND + S + '(?!\\w)'),
    words: [1],
    noNegate: true,
    build: (m, alpha) => ({ automaton: B.countAtMost(alpha, m[1], 0), reading: `no aparece "${m[1]}" (cero veces)` }),
  },

  // --- cotas de apariciones ------------------------------------------------
  {
    id: 'al-menos',
    re: rx(
      '\\b(?:al\\s+menos|minimo|como\\s+minimo|por\\s+lo\\s+menos|no\\s+menos\\s+de)\\s+' + NUM + '\\s+' + ART + KIND + S + '(?!\\w)',
    ),
    words: [2],
    noNegate: true,
    build: (m, alpha) => {
      const n = toNumber(m[1])
      return n === null ? null : { automaton: B.countAtLeast(alpha, m[2], n), reading: `al menos ${n} "${m[2]}"` }
    },
  },
  {
    id: 'n-o-mas',
    re: rx('\\b' + NUM + '\\s+\u00a7O\u00a7\\s+mas\\s+' + ART + KIND + S + '(?!\\w)'),
    words: [2],
    build: (m, alpha) => {
      const n = toNumber(m[1])
      return n === null ? null : { automaton: B.countAtLeast(alpha, m[2], n), reading: `al menos ${n} "${m[2]}"` }
    },
  },
  {
    id: 'mas-de',
    re: rx('\\bmas\\s+de\\s+' + NUM + '\\s+' + ART + KIND + S + '(?!\\w)'),
    words: [2],
    build: (m, alpha) => {
      const n = toNumber(m[1])
      return n === null
        ? null
        : { automaton: B.countAtLeast(alpha, m[2], n + 1), reading: `mas de ${n} "${m[2]}" (\u2265 ${n + 1})` }
    },
  },
  {
    id: 'a-lo-sumo',
    re: rx(
      '\\b(?:a\\s+lo\\s+sumo|a\\s+lo\\s+mas|como\\s+maximo|maximo|no\\s+mas\\s+de|cuando\\s+mucho)\\s+' +
        NUM +
        '\\s+' +
        ART +
        KIND +
        S +
        '(?!\\w)',
    ),
    words: [2],
    noNegate: true,
    build: (m, alpha) => {
      const n = toNumber(m[1])
      return n === null ? null : { automaton: B.countAtMost(alpha, m[2], n), reading: `a lo sumo ${n} "${m[2]}"` }
    },
  },
  {
    id: 'menos-de',
    re: rx('\\bmenos\\s+de\\s+' + NUM + '\\s+' + ART + KIND + S + '(?!\\w)'),
    words: [2],
    build: (m, alpha) => {
      const n = toNumber(m[1])
      return n === null || n < 1
        ? null
        : { automaton: B.countAtMost(alpha, m[2], n - 1), reading: `menos de ${n} "${m[2]}" (\u2264 ${n - 1})` }
    },
  },
  {
    id: 'exactamente-n',
    re: rx('\\b(?:exactamente|justo|precisamente)\\s+' + NUM + '\\s+' + ART + KIND + S + '(?!\\w)'),
    words: [2],
    build: (m, alpha) => {
      const n = toNumber(m[1])
      return n === null ? null : { automaton: B.countExactly(alpha, m[2], n), reading: `exactamente ${n} "${m[2]}"` }
    },
  },

  // --- longitud ------------------------------------------------------------
  {
    id: 'long-paridad',
    re: /\blongitud\s+(?:sea\s+|es\s+|de\s+)?(par|impar)/,
    build: (m, alpha) => ({ automaton: B.lengthMod(alpha, m[1] === 'par' ? 0 : 1, 2), reading: `longitud ${m[1]}` }),
  },
  {
    id: 'long-multiplo',
    re: /\blongitud\s+(?:sea\s+|es\s+)?(?:multiplo|divisible)\s+(?:de|entre|por)\s+(\d+)/,
    build: (m, alpha) => ({ automaton: B.lengthMod(alpha, 0, parseInt(m[1], 10)), reading: `longitud multiplo de ${m[1]}` }),
  },
  {
    id: 'long-entre',
    re: rx('\\blongitud\\s+(?:este\\s+|sea\\s+|es\\s+)?(?:entre)\\s+' + NUM + '\\s+\u00a7Y\u00a7\\s+' + NUM),
    build: (m, alpha) => {
      const lo = toNumber(m[1])
      const hi = toNumber(m[2])
      if (lo === null || hi === null || lo > hi) return null
      return { automaton: B.lengthBetween(alpha, lo, hi), reading: `longitud entre ${lo} y ${hi}` }
    },
  },
  {
    id: 'long-min',
    re: rx(
      '\\blongitud\\s+(?:de\\s+|sea\\s+|es\\s+)?(?:al\\s+menos|minima|minimo|como\\s+minimo|mayor\\s+\u00a7O\u00a7\\s+igual\\s+(?:a|que)|>=|\u2265)\\s+' +
        NUM,
    ),
    build: (m, alpha) => {
      const n = toNumber(m[1])
      return n === null ? null : { automaton: B.lengthAtLeast(alpha, n), reading: `longitud \u2265 ${n}` }
    },
  },
  {
    id: 'long-mayor',
    re: rx('\\blongitud\\s+(?:sea\\s+|es\\s+)?mayor\\s+(?:que|a)\\s+' + NUM),
    build: (m, alpha) => {
      const n = toNumber(m[1])
      return n === null ? null : { automaton: B.lengthAtLeast(alpha, n + 1), reading: `longitud > ${n}` }
    },
  },
  {
    id: 'long-max',
    re: rx(
      '\\blongitud\\s+(?:de\\s+|sea\\s+|es\\s+)?(?:a\\s+lo\\s+sumo|a\\s+lo\\s+mas|maxima|maximo|como\\s+maximo|no\\s+mayor\\s+(?:que|a)|menor\\s+\u00a7O\u00a7\\s+igual\\s+(?:a|que)|<=|\u2264)\\s+' +
        NUM,
    ),
    noNegate: true,
    build: (m, alpha) => {
      const n = toNumber(m[1])
      return n === null ? null : { automaton: B.lengthAtMost(alpha, n), reading: `longitud \u2264 ${n}` }
    },
  },
  {
    id: 'long-menor',
    re: rx('\\blongitud\\s+(?:sea\\s+|es\\s+)?menor\\s+(?:que|a)\\s+' + NUM),
    build: (m, alpha) => {
      const n = toNumber(m[1])
      return n === null || n < 1 ? null : { automaton: B.lengthAtMost(alpha, n - 1), reading: `longitud < ${n}` }
    },
  },
  {
    id: 'long-exacta',
    re: rx('\\blongitud\\s+(?:sea\\s+|es\\s+|de\\s+|igual\\s+a\\s+)?(?:exactamente\\s+|justo\\s+)?' + NUM + '(?!\\s*\\))'),
    build: (m, alpha) => {
      const n = toNumber(m[1])
      return n === null ? null : { automaton: B.lengthExactly(alpha, n), reading: `longitud exactamente ${n}` }
    },
  },

  // --- multiplos leidos como numero ---------------------------------------
  {
    id: 'multiplo-base',
    re: /\b(?:multiplos?|divisibles?)\s+(?:de|entre|por)\s+(\d+)/,
    build: (m, alpha) => ({
      automaton: B.divisibleBy(alpha, parseInt(m[1], 10)),
      reading: `numero en base ${alpha.length} multiplo de ${m[1]} (leido de izquierda a derecha)`,
    }),
  },

  // --- contiene (el patron mas general: va al final) -----------------------
  {
    id: 'contiene',
    re: rx(
      '\\b(?:conteng\\w+|contien\\w+|inclu\\w+|teng\\w+|hay|apare[zc]\\w+|posea\\w*|present\\w+|figur\\w+|con)\\s+' +
        ART +
        KIND +
        W,
    ),
    words: [1],
    build: (m, alpha) => ({ automaton: B.contains(alpha, m[1]), reading: `contiene "${m[1]}"` }),
  },
]

// ---------------------------------------------------------------------------
// Separacion en condiciones
// ---------------------------------------------------------------------------

/** Palabras sin contenido semantico: un fragmento hecho solo de estas se descarta. */
const FUNCTION_WORDS = new Set(
  (
    'que las los el la un una unos unas de del con en por para sobre cadenas cadena palabras palabra ' +
    'lenguaje lenguajes conjunto todas todos tal cual cuales donde cuya cuyo cuyas cuyos sea sean es son ' +
    'este esten solo se al lo su sus ademas tambien pero forma manera cualquier caso casos entonces ' +
    'siguiente siguientes acepte acepta acepten acepta reconozca reconoce admita valida'
  ).split(/\s+/),
)

function isNoise(frag: string): boolean {
  const words = frag.split(/\s+/).filter(Boolean)
  if (!words.length) return true
  return words.every((w) => FUNCTION_WORDS.has(w))
}

/** Un fragmento que es solo un literal ("bb", "no bb", "con a"): hereda el verbo del anterior. */
const BARE_LITERAL = /^(?:no\s+|ni\s+)?(?:con\s+|en\s+|por\s+|de\s+|la\s+|el\s+)*"?([a-z0-9]+)"?$/

function hasNegation(frag: string): boolean {
  if (/\bno\s+vacia/.test(frag)) return false
  return /\bno\b|\bsin\b|\bnunca\b|\bjamas\b|\bcare[zc]\w*\b|\bexclu\w*\b|\bevit\w*\b|\bprohibid\w*\b/.test(frag)
}

/** Determinista y completo: es lo que necesitan el producto y el complemento. */
function toDfa(a: Automaton): Automaton {
  const det = isDeterministic(a) ? a : subsetConstruction(a, { name: a.name }).automaton
  return completeDFA(det).automaton
}

/** Escapa un literal para usarlo dentro de una expresion regular. */
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// ---------------------------------------------------------------------------
// Analizador
// ---------------------------------------------------------------------------

export function parseStatement(text: string): NLResult {
  const notes: string[] = []
  const raw = normalize(text)
  const { alphabet, declared } = extractAlphabet(text)

  const fail = (error: string): NLResult => ({
    ok: false,
    alphabet,
    clauses: [],
    groups: [],
    combination: 'unica',
    structure: '',
    unmatched: [],
    notes,
    error,
  })

  if (!raw) return fail('El enunciado esta vacio.')

  // 0. Lenguajes que ningun automata finito puede reconocer.
  const nonRegular = detectNonRegular(raw)
  if (nonRegular) return fail(nonRegular)

  if (!declared) {
    notes.push(
      `No se declaro el alfabeto explicitamente, asi que se dedujo \u03a3 = {${alphabet.join(', ')}} a partir del enunciado. ` +
        `Se puede indicar de forma explicita escribiendo por ejemplo "sobre {a,b}".`,
    )
  }

  // 1. Atajo: el enunciado da directamente una expresion regular.
  const reMatch = raw.match(/\b(?:expresion\s+regular|regex)\s*(?:es|:|=)?\s*(\S+)/)
  if (reMatch) {
    try {
      const ast = parseRegex(reMatch[1])
      const alpha = alphabetOf(ast)
      if (alpha.length) {
        const nfa = thompson(ast).automaton
        const clause: NLClause = {
          text: reMatch[0],
          reading: `expresion regular ${reMatch[1]}`,
          negated: false,
          automaton: nfa,
          dfa: toDfa(nfa),
        }
        notes.push('El enunciado incluye una expresion regular; se construyo el AFN-\u03b5 con el algoritmo de Thompson.')
        return finish([{ clauses: [clause] }], [clause], [], alpha, notes)
      }
    } catch {
      // Si no es una expresion regular valida se sigue con el analisis normal.
    }
  }

  // 2. Limpieza y separacion en grupos (union) y fragmentos (interseccion).
  const cleaned = expandCoordination(stripMeta(stripAlphabetDeclaration(raw)))
  const working = protectPhrases(protectFiniteList(cleaned, alphabet))

  const orSep = alphabet.includes('o') ? /\s*\bo bien\b\s*/ : /\s*(?:\bo bien\b|\bo\b|\|)\s*/
  const andParts = [',', ';', '\\bademas\\b', '\\btambien\\b', '\\bpero\\b', '\\bni\\b', '\\badicionalmente\\b']
  if (!alphabet.includes('y')) andParts.push('\\by\\b')
  if (!alphabet.includes('e')) andParts.push('\\be\\b')
  const andSep = new RegExp(`\\s*(?:${andParts.join('|')})\\s*`)

  const rawGroups = working
    .split(orSep)
    .map((g) => g.trim())
    .filter((g) => g.length > 0)

  const groups: NLGroup[] = []
  const allClauses: NLClause[] = []
  const unmatched: string[] = []

  /**
   * Ultimo fragmento reconocido, para que un fragmento que es solo el objeto
   * herede su verbo. Vive fuera del bucle de grupos porque la enumeracion puede
   * cruzar un "o": "que aparezca aa o bb".
   */
  let template: { frag: string; word: string; negated: boolean } | null = null

  for (const g of rawGroups) {
    const frags = g
      .split(andSep)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)

    const clauses: NLClause[] = []

    for (const frag of frags) {
      if (isNoise(frag)) continue

      let built = matchFragment(frag, alphabet)

      // "que contengan aa y bb" / "no contengan aa ni bb": el segundo fragmento
      // es solo el objeto, asi que hereda el verbo (y la negacion) del anterior.
      if (!built && template) {
        const bare = frag.match(BARE_LITERAL)
        if (bare && [...bare[1]].every((c) => alphabet.includes(c))) {
          const word = escapeRe(template.word)
          const synth = template.frag.replace(new RegExp(`${word}(?![\\s\\S]*${word})`), bare[1])
          const inherited = matchFragment(synth, alphabet)
          if (inherited) built = { ...inherited, negated: template.negated || hasNegation(frag) }
        }
      }

      if (!built) {
        if (/[a-z]{2}/.test(frag)) unmatched.push(unprotect(frag))
        continue
      }

      const display = isDeterministic(built.automaton) ? completeDFA(built.automaton).automaton : built.automaton
      const dfa = toDfa(built.automaton)
      const negatedAutomaton = built.negated ? B.complement(dfa, `no ${built.automaton.name}`) : null

      const clause: NLClause = {
        text: unprotect(frag),
        reading: built.negated ? `no ${built.reading}` : built.reading,
        negated: built.negated,
        automaton: negatedAutomaton ?? display,
        dfa: negatedAutomaton ?? dfa,
      }
      clauses.push(clause)
      allClauses.push(clause)
      if (built.word) template = { frag, word: built.word, negated: built.negated }
    }

    if (clauses.length) groups.push({ clauses })
  }

  if (allClauses.length === 0) {
    return {
      ...fail(
        'No se reconocio ninguna condicion en el enunciado. Se pueden usar frases como ' +
          '"cadenas sobre {a,b} que empiecen con a y terminen en bb", "que el penultimo simbolo sea a", ' +
          '"que acepte unicamente la cadena a", "con numero par de a", "de longitud entre 2 y 4", ' +
          '"que no contengan aa ni bb", "que empiecen con a o terminen en b", "binarios multiplos de 3". ' +
          'Tambien se puede describir el lenguaje con una expresion regular en la pesta\u00f1a correspondiente.',
      ),
      unmatched,
    }
  }

  if (unmatched.length) {
    notes.push(
      `No se pudieron interpretar estos fragmentos y se ignoraron: ${unmatched.map((u) => `"${u}"`).join(', ')}. ` +
        `El automata resultante solo refleja las condiciones que si se entendieron.`,
    )
  }

  return finish(groups, allClauses, unmatched, alphabet, notes)
}

/** Busca el primer patron del catalogo que encaje con el fragmento. */
function matchFragment(
  frag: string,
  alphabet: string[],
): { automaton: Automaton; reading: string; negated: boolean; word: string } | null {
  for (const p of PATTERNS) {
    const m = frag.match(p.re)
    if (!m) continue

    // Los literales capturados deben estar formados con simbolos de Sigma.
    if (p.words) {
      let ok = true
      for (const i of p.words) {
        const w = m[i]
        if (!w || ![...w].every((c) => alphabet.includes(c))) ok = false
        // Una palabra de 2+ letras que ademas es una palabra funcional del
        // español casi siempre es un falso positivo ("que", "las", ...).
        if (w && w.length >= 2 && FUNCTION_WORDS.has(w)) ok = false
      }
      if (!ok) continue
    }

    const built = p.build(m, alphabet)
    if (!built) continue

    const word = p.words && p.words.length ? m[p.words[p.words.length - 1]] : ''
    return {
      automaton: built.automaton,
      reading: built.reading,
      negated: p.noNegate ? false : hasNegation(frag),
      word,
    }
  }
  return null
}

/** Combina los grupos: interseccion dentro de cada uno, union entre ellos. */
function finish(
  groups: NLGroup[],
  clauses: NLClause[],
  unmatched: string[],
  alphabet: string[],
  notes: string[],
): NLResult {
  const groupAutomata = groups.map((g) => {
    let a = g.clauses[0].dfa
    for (let i = 1; i < g.clauses.length; i++) a = B.product(a, g.clauses[i].dfa, 'and')
    return a
  })

  let combined: Automaton
  if (groups.length === 1 && groups[0].clauses.length === 1) {
    // Una sola condicion: se conserva tal cual, incluso si es un AFN, para que
    // el procedimiento muestre despues la conversion AFN -> AFD.
    combined = groups[0].clauses[0].automaton
  } else {
    combined = groupAutomata[0]
    for (let i = 1; i < groupAutomata.length; i++) combined = B.product(combined, groupAutomata[i], 'or')
  }

  const automaton = autoLayout(
    renameSequential({ ...combined, name: 'Automata del enunciado', alphabet: inferAlphabet(combined) }),
  )

  const multiGroup = groups.length > 1
  const multiClause = groups.some((g) => g.clauses.length > 1)
  const combination: NLResult['combination'] =
    multiGroup && multiClause ? 'mixta' : multiGroup ? 'union' : multiClause ? 'interseccion' : 'unica'

  const structure = groups
    .map((g) => (g.clauses.length > 1 ? `(${g.clauses.map((c) => c.reading).join(' Y ')})` : g.clauses[0].reading))
    .join(' O ')

  if (combination === 'interseccion') {
    notes.push(
      `Se combinaron ${clauses.length} condiciones por **interseccion** (construccion del producto): una cadena se acepta solo si las cumple todas.`,
    )
  } else if (combination === 'union') {
    notes.push(
      `Se combinaron ${groups.length} condiciones por **union** (construccion del producto): basta con que la cadena cumpla una de ellas.`,
    )
  } else if (combination === 'mixta') {
    notes.push(
      `El enunciado mezcla "y" con "o", asi que se interpreto como: ${structure}. ` +
        `Primero se intersecan las condiciones unidas por "y" y despues se unen los grupos separados por "o".`,
    )
  }

  if (clauses.some((c) => c.negated)) {
    notes.push(
      'Las condiciones negadas se resolvieron por **complemento**: se completa el AFD con estado trampa y se intercambian los estados finales con los no finales.',
    )
  }

  return { ok: true, alphabet, clauses, groups, combination, structure, unmatched, automaton, notes }
}
