import { describe, it, expect } from 'vitest'
import { parseRegex, alphabetOf, regexToString, splitAlphabetDeclaration, RegexError } from './regex/parser'
import { buildFromRegex } from './regex/build'
import { accepts } from './algorithms/equivalence'
import { brzozowski } from './algorithms/brzozowski'
import { subsetConstruction } from './algorithms/subset'
import { checkEquivalence } from './algorithms/equivalence'
import { Automaton } from './types'
import { solve } from './solver'

/** Construye el automata de una expresion, con la declaracion de Σ si la trae. */
function build(input: string): Automaton {
  const { alphabet: declared, expression } = splitAlphabetDeclaration(input)
  const ast = parseRegex(expression, { alphabet: declared })
  const alpha = [...new Set([...(declared ?? []), ...alphabetOf(ast)])].sort()
  return buildFromRegex(ast, alpha).automaton
}

function check(input: string, yes: string[], no: string[]) {
  const a = build(input)
  for (const w of yes) expect(accepts(a, w), `"${input}" deberia aceptar "${w || 'ε'}"`).toBe(true)
  for (const w of no) expect(accepts(a, w), `"${input}" deberia rechazar "${w || 'ε'}"`).toBe(false)
}

/** Comprueba que dos expresiones definen el mismo lenguaje. */
function sameLanguage(r1: string, r2: string) {
  const eq = checkEquivalence(build(r1), build(r2))
  expect(eq.equivalent, `${r1} deberia ser equivalente a ${r2}`).toBe(true)
}

describe('operadores clasicos (regresion)', () => {
  it('sigue resolviendo las expresiones de siempre', () => {
    check('(a|b)*abb', ['abb', 'aabb', 'babb'], ['', 'ab', 'abba'])
    check('a*b*', ['', 'a', 'b', 'aabbb'], ['ba', 'aba'])
    check('(a|ε)b', ['b', 'ab'], ['', 'aab'])
    check('a+b?', ['a', 'aa', 'ab', 'aab'], ['', 'b', 'abb'])
  })
})

describe('clases de simbolos', () => {
  it('[abc] es la union de sus simbolos', () => {
    check('[abc]', ['a', 'b', 'c'], ['', 'd', 'ab'])
    sameLanguage('[ab]*abb', '(a|b)*abb')
  })

  it('[a-c] expande el rango', () => {
    check('[a-c]+', ['a', 'b', 'c', 'abc', 'cba'], ['', 'd', 'abd'])
  })

  it('[0-9] funciona con digitos', () => {
    check('[0-9][0-9]', ['00', '42', '99'], ['', '4', '444'])
  })

  it('[^a] es todo lo demas del alfabeto', () => {
    check('Sigma = {a,b,c}\n[^a]', ['b', 'c'], ['', 'a', 'bc'])
  })

  it('avisa si la clase negada vacia el alfabeto', () => {
    expect(() => build('Sigma = {a}\n[^a]')).toThrow(RegexError)
  })
})

describe('el punto: cualquier simbolo', () => {
  it('. recorre todo el alfabeto declarado', () => {
    check('Sigma = {a,b}\n.*a', ['a', 'ba', 'aba', 'bba'], ['', 'b', 'ab'])
    check('Sigma = {a,b}\n..', ['aa', 'ab', 'ba', 'bb'], ['', 'a', 'aaa'])
  })

  it('sin alfabeto declarado, "." lo deduce de la propia expresion', () => {
    check('a.*b', ['ab', 'aab', 'abb'], ['', 'a', 'b', 'ba'])
  })

  it('avisa si no hay forma de saber cual es Σ', () => {
    expect(() => build('.*')).toThrow(RegexError)
  })
})

describe('repeticion contada {n,m}', () => {
  it('{n} es exactamente n copias', () => {
    check('a{3}', ['aaa'], ['', 'a', 'aa', 'aaaa'])
  })

  it('{n,m} es entre n y m copias', () => {
    check('a{2,4}', ['aa', 'aaa', 'aaaa'], ['', 'a', 'aaaaa'])
  })

  it('{n,} es n o mas copias', () => {
    check('a{2,}', ['aa', 'aaa', 'aaaaaa'], ['', 'a'])
  })

  it('{0,1} equivale a ?', () => {
    sameLanguage('a{0,1}b', 'a?b')
  })

  it('se puede aplicar a un grupo', () => {
    check('(ab){2}', ['abab'], ['', 'ab', 'ababab'])
  })

  it('rechaza repeticiones mal escritas o desmedidas', () => {
    expect(() => build('a{4,2}')).toThrow(RegexError)
    expect(() => build('a{x}')).toThrow(RegexError)
    expect(() => build('a{999}')).toThrow(RegexError)
  })
})

describe('operadores booleanos', () => {
  it('~ es el complemento respecto de Σ', () => {
    // Sobre {a,b}, lo contrario de "solo a" es "contiene al menos una b".
    check('Sigma = {a,b}\n~(a*)', ['b', 'ab', 'ba', 'bb'], ['', 'a', 'aa'])
  })

  it('&& es la interseccion', () => {
    // Contiene una a Y contiene una b.
    check('Sigma = {a,b}\n(.*a.*) && (.*b.*)', ['ab', 'ba', 'aab', 'bbaa'], ['', 'a', 'b', 'aa', 'bb'])
  })

  it('− es la diferencia', () => {
    // Todas las cadenas menos las que contienen aa.
    check('Sigma = {a,b}\n.* - (.*aa.*)', ['', 'a', 'b', 'ab', 'aba'], ['aa', 'baa', 'aab'])
  })

  it('el doble complemento devuelve el lenguaje original', () => {
    sameLanguage('Sigma = {a,b}\n~(~((a|b)*abb))', 'Sigma = {a,b}\n(a|b)*abb')
  })

  it('la ley de De Morgan se cumple sobre los automatas', () => {
    sameLanguage('Sigma = {a,b}\n~((a*) | (b*))', 'Sigma = {a,b}\n(~(a*)) && (~(b*))')
  })

  it('el resultado con operadores booleanos sigue siendo minimizable y equivalente', () => {
    const a = build('Sigma = {a,b}\n(.*a.*) && (.*b.*)')
    const min = brzozowski(subsetConstruction(a).automaton).automaton
    expect(checkEquivalence(a, min).equivalent).toBe(true)
  })
})

describe('escapes y simbolos de varios caracteres', () => {
  it('la barra convierte un operador en simbolo normal', () => {
    check('a\\*b', ['a*b'], ['', 'ab', 'aab'])
    check('a\\|b', ['a|b'], ['a', 'b'])
  })

  it('las comillas permiten simbolos de mas de una letra', () => {
    const a = build('Sigma = {id,num,+}\nid ("+" num)*')
    expect(a.alphabet).toContain('id')
    expect(accepts(a, 'id')).toBe(true)
    expect(accepts(a, 'id+num')).toBe(true)
    expect(accepts(a, 'id+num+num')).toBe(true)
    expect(accepts(a, 'num')).toBe(false)
    expect(accepts(a, 'id+')).toBe(false)
  })

  it('acepta cadenas con separadores cuando los simbolos son largos', () => {
    const a = build('Sigma = {id,num,+}\nid ("+" num)*')
    expect(accepts(a, 'id + num')).toBe(true)
  })
})

describe('declaracion del alfabeto y errores', () => {
  it('separa la declaracion de la expresion', () => {
    const r = splitAlphabetDeclaration('Sigma = {a,b}\n(a|b)*')
    expect(r.alphabet).toEqual(['a', 'b'])
    expect(r.expression.trim()).toBe('(a|b)*')
  })

  it('avisa si la expresion usa simbolos fuera del alfabeto declarado', () => {
    expect(() => build('Sigma = {a,b}\nabc')).toThrow(/no esta en el alfabeto declarado/)
  })

  it('da mensajes claros en los errores de sintaxis', () => {
    expect(() => build('(ab')).toThrow(/parentesis/i)
    expect(() => build('ab)')).toThrow(/parentesis/i)
    expect(() => build('[ab')).toThrow(/corchete/i)
    expect(() => build('*a')).toThrow(/operador/i)
    expect(() => build('')).toThrow(/vacia/i)
  })
})

describe('reescritura del arbol como texto', () => {
  it('conserva el significado con los operadores nuevos', () => {
    const show = (s: string) => regexToString(parseRegex(s, { alphabet: ['a', 'b'] }))
    expect(show('a{2}')).toBe('a{2}')
    expect(show('a{1,3}')).toBe('a{1,3}')
    expect(show('a{2,}')).toBe('a{2,}')
    expect(show('~(a*)')).toBe('~a*')
    expect(show('a&&b')).toBe('a∩b')
    expect(show('a-b')).toBe('a−b')
  })
})

describe('flujo completo del solucionador con expresiones extendidas', () => {
  const CASOS = [
    '(a|b)*abb',
    '[ab]*abb',
    'Sigma = {a,b}\n.*a.',
    'a{2,4}',
    'Sigma = {a,b}\n~(a*)',
    'Sigma = {a,b}\n(.*a.*) && (.*b.*)',
    'Sigma = {a,b}\n.* - (.*aa.*)',
  ]

  it('resuelve, minimiza y verifica cada expresion', () => {
    for (const t of CASOS) {
      const r = solve(t, 'regex')
      expect(r.ok, t).toBe(true)
      expect(r.verification?.equivalent, t).toBe(true)
      expect(r.verification?.brzozowskiStates, t).toBe(r.verification?.tableFillingStates)
    }
  })
})
