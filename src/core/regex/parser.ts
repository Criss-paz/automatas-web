/**
 * Analizador sintactico de expresiones regulares (descenso recursivo).
 *
 * Gramatica:
 *   expr   := term ('|' term)*        union
 *   term   := factor*                 concatenacion (implicita)
 *   factor := base ('*' | '+' | '?')*
 *   base   := simbolo | '(' expr ')'
 *
 * Simbolos especiales aceptados:
 *   |  union        * cerradura de Kleene    + una o mas    ? opcional
 *   ε &  cadena vacia          ∅  lenguaje vacio
 */

export type RegexNode =
  | { type: 'sym'; value: string }
  | { type: 'eps' }
  | { type: 'empty' }
  | { type: 'union'; left: RegexNode; right: RegexNode }
  | { type: 'concat'; left: RegexNode; right: RegexNode }
  | { type: 'star'; child: RegexNode }
  | { type: 'plus'; child: RegexNode }
  | { type: 'opt'; child: RegexNode }

const OPERATORS = new Set(['|', '*', '+', '?', '(', ')'])

export class RegexError extends Error {}

export function parseRegex(input: string): RegexNode {
  const src = input.replace(/\s+/g, '')
  if (src === '') throw new RegexError('La expresion regular esta vacia.')
  let i = 0

  const peek = () => src[i]
  const eat = () => src[i++]

  function parseExpr(): RegexNode {
    let node = parseTerm()
    while (peek() === '|') {
      eat()
      const right = parseTerm()
      node = { type: 'union', left: node, right }
    }
    return node
  }

  function parseTerm(): RegexNode {
    let node: RegexNode | null = null
    while (i < src.length && peek() !== '|' && peek() !== ')') {
      const next = parseFactor()
      node = node === null ? next : { type: 'concat', left: node, right: next }
    }
    return node ?? { type: 'eps' }
  }

  function parseFactor(): RegexNode {
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
      } else break
    }
    return node
  }

  function parseBase(): RegexNode {
    const c = peek()
    if (c === undefined) throw new RegexError('Se esperaba un simbolo pero la expresion termino.')
    if (c === '(') {
      eat()
      const node = parseExpr()
      if (peek() !== ')') throw new RegexError('Falta cerrar un parentesis ")".')
      eat()
      return node
    }
    if (c === ')') throw new RegexError('Parentesis ")" de mas o sin apertura.')
    if (c === '|' || c === '*' || c === '+' || c === '?') {
      throw new RegexError(`El operador "${c}" no puede ir al inicio ni seguido de otro operador.`)
    }
    eat()
    if (c === 'ε' || c === '&' || c === 'λ') return { type: 'eps' }
    if (c === '∅') return { type: 'empty' }
    return { type: 'sym', value: c }
  }

  const node = parseExpr()
  if (i < src.length) throw new RegexError(`No se entendio la expresion a partir de "${src.slice(i)}".`)
  return node
}

/** Alfabeto que usa la expresion regular. */
export function alphabetOf(node: RegexNode, acc = new Set<string>()): string[] {
  switch (node.type) {
    case 'sym':
      acc.add(node.value)
      break
    case 'union':
    case 'concat':
      alphabetOf(node.left, acc)
      alphabetOf(node.right, acc)
      break
    case 'star':
    case 'plus':
    case 'opt':
      alphabetOf(node.child, acc)
      break
  }
  return [...acc].sort()
}

/** Vuelve a escribir el AST como texto (para mostrar como quedo interpretada). */
export function regexToString(node: RegexNode): string {
  const wrap = (n: RegexNode, ctx: 'union' | 'concat' | 'unary'): string => {
    const s = regexToString(n)
    const needs =
      (ctx === 'concat' && n.type === 'union') ||
      (ctx === 'unary' && (n.type === 'union' || n.type === 'concat'))
    return needs ? `(${s})` : s
  }
  switch (node.type) {
    case 'sym':
      return node.value
    case 'eps':
      return 'ε'
    case 'empty':
      return '∅'
    case 'union':
      return `${wrap(node.left, 'union')}|${wrap(node.right, 'union')}`
    case 'concat':
      return `${wrap(node.left, 'concat')}${wrap(node.right, 'concat')}`
    case 'star':
      return `${wrap(node.child, 'unary')}*`
    case 'plus':
      return `${wrap(node.child, 'unary')}+`
    case 'opt':
      return `${wrap(node.child, 'unary')}?`
  }
}

export { OPERATORS }
