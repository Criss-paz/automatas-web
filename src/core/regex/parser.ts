/**
 * Analizador sintactico de expresiones regulares (descenso recursivo).
 *
 * Gramatica, de menor a mayor precedencia:
 *
 *   expr   := inter ('|' inter)*        union
 *   inter  := diff ('&&' diff)*         interseccion
 *   diff   := term ('-' term)*          diferencia
 *   term   := factor*                   concatenacion (implicita)
 *   factor := '~' factor | base postfijo*
 *   base   := simbolo | '(' expr ')' | clase | '.'
 *
 * Operadores aceptados:
 *   |  ∪     union                     *        cero o mas
 *   && ∩     interseccion              +        una o mas
 *   -  ∖     diferencia                ?        opcional
 *   ~  ¬     complemento               {n,m}    repeticion contada
 *   .        cualquier simbolo de Σ    [abc]    clase   [a-z] rango   [^ab] negada
 *   ε λ &    cadena vacia              ∅        lenguaje vacio
 *   "ab"     simbolo de varios caracteres (para alfabetos como {id, num})
 *   \*       cualquier operador escapado se vuelve un simbolo normal
 *
 * La interseccion, la diferencia y el complemento no forman parte de la
 * definicion clasica de expresion regular, pero no aumentan su poder expresivo
 * (los lenguajes regulares son cerrados bajo esas operaciones) y aparecen a
 * menudo en los ejercicios. Se resuelven determinizando y aplicando el producto
 * o el intercambio de estados finales; ver regex/build.ts.
 */

export type RegexNode =
  | { type: 'sym'; value: string }
  | { type: 'eps' }
  | { type: 'empty' }
  | { type: 'any' }
  /** Clase negada [^ab]; solo existe hasta que se conoce Σ y se convierte en union. */
  | { type: 'negclass'; items: string[] }
  | { type: 'union'; left: RegexNode; right: RegexNode }
  | { type: 'inter'; left: RegexNode; right: RegexNode }
  | { type: 'diff'; left: RegexNode; right: RegexNode }
  | { type: 'concat'; left: RegexNode; right: RegexNode }
  | { type: 'star'; child: RegexNode }
  | { type: 'plus'; child: RegexNode }
  | { type: 'opt'; child: RegexNode }
  | { type: 'compl'; child: RegexNode }
  /** Repeticion contada: {n}, {n,} (max = null) y {n,m}. */
  | { type: 'repeat'; child: RegexNode; min: number; max: number | null }

const OPERATORS = new Set(['|', '*', '+', '?', '(', ')', '&', '~', '-', '.', '[', ']', '{', '}'])

export class RegexError extends Error {}

/** Limite de expansion de {n,m}, para no construir automatas enormes por un error de tecleo. */
const MAX_REPEAT = 60

export interface ParseRegexOptions {
  /**
   * Alfabeto declarado. Hace falta para "." y para las clases negadas [^a]; si
   * no se da, se deduce de los simbolos que aparecen en la propia expresion.
   */
  alphabet?: string[]
}

/**
 * Separa una declaracion de alfabeto opcional al principio de la entrada:
 *   "Sigma = {a,b,c}\n(a|b)*c"  ->  { alphabet: ['a','b','c'], expression: '(a|b)*c' }
 */
export function splitAlphabetDeclaration(input: string): { alphabet?: string[]; expression: string } {
  const m = input.match(/^\s*(?:sigma|σ|alfabeto|alphabet)\s*[:=]\s*\{([^}]*)\}\s*[;\n]?/i)
  if (!m) return { expression: input }
  const alphabet = m[1]
    .split(/[,;\s]+/)
    .map((x) => x.trim())
    .filter(Boolean)
  return { alphabet: alphabet.length ? [...new Set(alphabet)] : undefined, expression: input.slice(m[0].length) }
}

export function parseRegex(input: string, opts: ParseRegexOptions = {}): RegexNode {
  // Los espacios se ignoran salvo dentro de "..." (simbolos de varios caracteres).
  const src = stripSpaces(input)
  if (src === '') throw new RegexError('La expresion regular esta vacia.')
  let i = 0

  const peek = (k = 0) => src[i + k]
  const eat = () => src[i++]

  function parseExpr(): RegexNode {
    let node = parseInter()
    while (peek() === '|' || peek() === '∪') {
      eat()
      node = { type: 'union', left: node, right: parseInter() }
    }
    return node
  }

  function parseInter(): RegexNode {
    let node = parseDiff()
    // "&&" o "∩": un solo "&" es la cadena vacia, por compatibilidad.
    while ((peek() === '&' && peek(1) === '&') || peek() === '∩') {
      if (peek() === '&') eat()
      eat()
      node = { type: 'inter', left: node, right: parseDiff() }
    }
    return node
  }

  function parseDiff(): RegexNode {
    let node = parseTerm()
    while (peek() === '-' || peek() === '∖') {
      eat()
      node = { type: 'diff', left: node, right: parseTerm() }
    }
    return node
  }

  function isTermEnd(c: string | undefined): boolean {
    if (c === undefined) return true
    if (c === '|' || c === '∪' || c === ')' || c === '∩' || c === '-' || c === '∖') return true
    return c === '&' && peek(1) === '&'
  }

  function parseTerm(): RegexNode {
    let node: RegexNode | null = null
    while (i < src.length && !isTermEnd(peek())) {
      const next = parseFactor()
      node = node === null ? next : { type: 'concat', left: node, right: next }
    }
    return node ?? { type: 'eps' }
  }

  function parseFactor(): RegexNode {
    // El complemento es prefijo: ~a* se lee como ~(a*).
    if (peek() === '~' || peek() === '¬') {
      eat()
      return { type: 'compl', child: parseFactor() }
    }
    let node = parseBase()
    for (;;) {
      const c = peek()
      if (c === '*') {
        eat()
        node = { type: 'star', child: node }
      } else if (c === '+') {
        eat()
        node = { type: 'plus', child: node }
      } else if (c === '?') {
        eat()
        node = { type: 'opt', child: node }
      } else if (c === '{') {
        node = parseRepeat(node)
      } else break
    }
    return node
  }

  /** {n}, {n,}, {n,m} */
  function parseRepeat(child: RegexNode): RegexNode {
    eat() // '{'
    const close = src.indexOf('}', i)
    if (close < 0) throw new RegexError('Falta cerrar una llave "}" de repeticion.')
    const body = src.slice(i, close)
    const m = body.match(/^(\d+)(?:(,)(\d*))?$/)
    if (!m) {
      throw new RegexError(
        `No se entendio la repeticion "{${body}}". Se escribe {n} (exactamente n), {n,} (n o mas) o {n,m} (entre n y m).`,
      )
    }
    i = close + 1
    const min = parseInt(m[1], 10)
    const max = m[2] === undefined ? min : m[3] === '' ? null : parseInt(m[3], 10)
    if (max !== null && max < min) {
      throw new RegexError(`En "{${body}}" el maximo (${max}) es menor que el minimo (${min}).`)
    }
    if (min > MAX_REPEAT || (max !== null && max > MAX_REPEAT)) {
      throw new RegexError(`La repeticion "{${body}}" es demasiado grande (el limite es ${MAX_REPEAT}).`)
    }
    return { type: 'repeat', child, min, max }
  }

  /** [abc], [a-z], [^ab] */
  function parseClass(): RegexNode {
    eat() // '['
    let negated = false
    if (peek() === '^') {
      eat()
      negated = true
    }
    const items: string[] = []
    while (i < src.length && peek() !== ']') {
      let c = eat()
      if (c === '\\') {
        if (i >= src.length) throw new RegexError('La barra "\\" final no escapa a ningun simbolo.')
        c = eat()
      }
      // Rango a-z (el "-" final o antes de "]" es un simbolo mas)
      if (peek() === '-' && peek(1) !== undefined && peek(1) !== ']') {
        eat()
        const end = eat()
        const lo = c.codePointAt(0)!
        const hi = end.codePointAt(0)!
        if (hi < lo) throw new RegexError(`El rango "${c}-${end}" esta invertido.`)
        if (hi - lo > 200) throw new RegexError(`El rango "${c}-${end}" abarca demasiados simbolos.`)
        for (let k = lo; k <= hi; k++) items.push(String.fromCodePoint(k))
      } else {
        items.push(c)
      }
    }
    if (peek() !== ']') throw new RegexError('Falta cerrar un corchete "]".')
    eat()
    if (items.length === 0) throw new RegexError('La clase "[]" esta vacia.')
    return negated ? { type: 'negclass', items: [...new Set(items)] } : unionOf([...new Set(items)])
  }

  // Simbolos declarados de mas de un caracter: con Σ = {id, num} se puede
  // escribir "id num" sin comillas. Los mas largos primero (maximal munch).
  const longSymbols = (opts.alphabet ?? []).filter((s) => s.length > 1).sort((x, y) => y.length - x.length)

  function parseBase(): RegexNode {
    const c = peek()
    if (c === undefined) throw new RegexError('Se esperaba un simbolo pero la expresion termino.')

    const declared = longSymbols.find((s) => src.startsWith(s, i))
    if (declared) {
      i += declared.length
      return { type: 'sym', value: declared }
    }

    if (c === '(') {
      eat()
      const node = parseExpr()
      if (peek() !== ')') throw new RegexError('Falta cerrar un parentesis ")".')
      eat()
      return node
    }
    if (c === ')') throw new RegexError('Parentesis ")" de mas o sin apertura.')
    if (c === '[') return parseClass()
    if (c === ']') throw new RegexError('Corchete "]" sin su "[" de apertura.')
    if (c === '{') throw new RegexError('La llave "{" de repeticion tiene que ir despues de algo que repetir.')

    if (c === '\\') {
      eat()
      if (i >= src.length) throw new RegexError('La barra "\\" final no escapa a ningun simbolo.')
      return { type: 'sym', value: eat() }
    }
    if (c === '"') {
      eat()
      const close = src.indexOf('"', i)
      if (close < 0) throw new RegexError('Faltan las comillas de cierre de un simbolo.')
      const value = src.slice(i, close)
      i = close + 1
      return value === '' ? { type: 'eps' } : { type: 'sym', value }
    }
    if (c === '|' || c === '*' || c === '?' || c === '∩' || c === '∪') {
      throw new RegexError(`El operador "${c}" no puede ir al inicio ni seguido de otro operador.`)
    }

    eat()
    if (c === '.') return { type: 'any' }
    if (c === 'ε' || c === '&' || c === 'λ') return { type: 'eps' }
    if (c === '∅') return { type: 'empty' }
    return { type: 'sym', value: c }
  }

  const node = parseExpr()
  if (i < src.length) {
    if (peek() === ')') throw new RegexError('Hay un parentesis ")" de mas o sin su "(" de apertura.')
    throw new RegexError(`No se entendio la expresion a partir de "${src.slice(i)}".`)
  }

  // "." y [^...] necesitan conocer Σ, asi que se resuelven ahora que ya se leyo todo.
  const declared = opts.alphabet && opts.alphabet.length ? [...new Set(opts.alphabet)] : undefined
  if (declared) {
    const fuera = explicitAlphabet(node).filter((s) => !declared.includes(s))
    if (fuera.length) {
      throw new RegexError(
        `La expresion usa ${fuera.map((s) => `"${s}"`).join(', ')}, que no esta en el alfabeto declarado Σ = {${declared.join(', ')}}.`,
      )
    }
  }
  return resolveAlphabet(node, declared ?? explicitAlphabet(node))
}

/** Quita los espacios que no esten dentro de comillas ni escapados. */
function stripSpaces(input: string): string {
  let out = ''
  let inQuotes = false
  for (let k = 0; k < input.length; k++) {
    const c = input[k]
    if (c === '\\' && k + 1 < input.length) {
      out += c + input[k + 1]
      k++
      continue
    }
    if (c === '"') inQuotes = !inQuotes
    if (!inQuotes && /\s/.test(c)) continue
    out += c
  }
  return out
}

const unionOf = (items: string[]): RegexNode =>
  items
    .map((v): RegexNode => ({ type: 'sym', value: v }))
    .reduce((acc, n) => ({ type: 'union', left: acc, right: n }))

/** Simbolos escritos literalmente en la expresion (sin resolver "." ni [^...]). */
function explicitAlphabet(node: RegexNode, acc = new Set<string>()): string[] {
  switch (node.type) {
    case 'sym':
      acc.add(node.value)
      break
    case 'negclass':
      // Los simbolos excluidos tambien pertenecen al alfabeto.
      for (const s of node.items) acc.add(s)
      break
    case 'union':
    case 'inter':
    case 'diff':
    case 'concat':
      explicitAlphabet(node.left, acc)
      explicitAlphabet(node.right, acc)
      break
    case 'star':
    case 'plus':
    case 'opt':
    case 'compl':
    case 'repeat':
      explicitAlphabet(node.child, acc)
      break
  }
  return [...acc].sort()
}

/** Sustituye "." y las clases negadas por la union de los simbolos que correspondan. */
function resolveAlphabet(node: RegexNode, alphabet: string[]): RegexNode {
  switch (node.type) {
    case 'any':
      if (!alphabet.length) {
        throw new RegexError(
          'Se uso "." pero no se sabe cual es el alfabeto. Declaralo escribiendo "Sigma = {a,b}" antes de la expresion.',
        )
      }
      return unionOf(alphabet)
    case 'negclass': {
      const rest = alphabet.filter((s) => !node.items.includes(s))
      if (!rest.length) {
        throw new RegexError(
          `La clase negada [^${node.items.join('')}] excluye todos los simbolos de Σ = {${alphabet.join(', ')}}: no queda ninguno.`,
        )
      }
      return unionOf(rest)
    }
    case 'union':
    case 'inter':
    case 'diff':
    case 'concat':
      return { type: node.type, left: resolveAlphabet(node.left, alphabet), right: resolveAlphabet(node.right, alphabet) }
    case 'star':
    case 'plus':
    case 'opt':
    case 'compl':
      return { type: node.type, child: resolveAlphabet(node.child, alphabet) }
    case 'repeat':
      return { type: 'repeat', child: resolveAlphabet(node.child, alphabet), min: node.min, max: node.max }
    default:
      return node
  }
}

/** Alfabeto que usa la expresion regular ya resuelta. */
export function alphabetOf(node: RegexNode, acc = new Set<string>()): string[] {
  return explicitAlphabet(node, acc)
}

/** true si la expresion usa operadores que obligan a determinizar (∩, −, ~). */
export function needsDeterminization(node: RegexNode): boolean {
  switch (node.type) {
    case 'inter':
    case 'diff':
    case 'compl':
      return true
    case 'union':
    case 'concat':
      return needsDeterminization(node.left) || needsDeterminization(node.right)
    case 'star':
    case 'plus':
    case 'opt':
    case 'repeat':
      return needsDeterminization(node.child)
    default:
      return false
  }
}

/** Vuelve a escribir el AST como texto (para mostrar como quedo interpretada). */
export function regexToString(node: RegexNode): string {
  const prec = (n: RegexNode): number => {
    switch (n.type) {
      case 'union':
        return 1
      case 'inter':
        return 2
      case 'diff':
        return 3
      case 'concat':
        return 4
      default:
        return 5
    }
  }
  const wrap = (n: RegexNode, min: number): string => (prec(n) < min ? `(${regexToString(n)})` : regexToString(n))

  switch (node.type) {
    case 'sym':
      return node.value.length > 1 ? `"${node.value}"` : node.value
    case 'eps':
      return 'ε'
    case 'empty':
      return '∅'
    case 'any':
      return '.'
    case 'negclass':
      return `[^${node.items.join('')}]`
    case 'union':
      return `${wrap(node.left, 1)}|${wrap(node.right, 1)}`
    case 'inter':
      return `${wrap(node.left, 2)}∩${wrap(node.right, 2)}`
    case 'diff':
      return `${wrap(node.left, 3)}−${wrap(node.right, 3)}`
    case 'concat':
      return `${wrap(node.left, 4)}${wrap(node.right, 4)}`
    case 'star':
      return `${wrap(node.child, 5)}*`
    case 'plus':
      return `${wrap(node.child, 5)}+`
    case 'opt':
      return `${wrap(node.child, 5)}?`
    case 'compl':
      return `~${wrap(node.child, 5)}`
    case 'repeat':
      return `${wrap(node.child, 5)}{${node.min}${node.max === null ? ',' : node.max === node.min ? '' : ',' + node.max}}`
  }
}

export { OPERATORS }
