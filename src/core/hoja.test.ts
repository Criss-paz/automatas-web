import { describe, it, expect } from 'vitest'
import { solve } from './solver'
import { parseStatement } from './nl/parser'
import { accepts } from './algorithms/equivalence'
import { parseRegex, plusLooksLikeUnion, regexToString } from './regex/parser'
import { describeLanguage } from './describe'
import * as B from './nl/builders'

/**
 * Pruebas de los tipos de ejercicio de la hoja de trabajo del curso: escribir la
 * expresion regular de un lenguaje descrito en español y, al reves, describir en
 * español el lenguaje que denota una expresion regular.
 */

function lenguaje(texto: string) {
  const r = parseStatement(texto)
  if (!r.ok || !r.automaton) throw new Error(`no se interpreto "${texto}": ${r.error}`)
  return r.automaton
}

function check(texto: string, si: string[], no: string[]) {
  const a = lenguaje(texto)
  for (const w of si) expect(accepts(a, w), `"${texto}" deberia aceptar "${w || 'ε'}"`).toBe(true)
  for (const w of no) expect(accepts(a, w), `"${texto}" deberia rechazar "${w || 'ε'}"`).toBe(false)
}

describe('constructores de parejas y de orden', () => {
  it('cuenta apariciones solapadas: "000" tiene dos parejas de ceros', () => {
    const a = B.substringAtMost(['0', '1'], '00', 1)
    expect(accepts(a, '00')).toBe(true)
    expect(accepts(a, '000')).toBe(false)
    expect(accepts(a, '0010')).toBe(true)
    expect(accepts(a, '00100')).toBe(false)
  })

  it('exactamente n apariciones', () => {
    const a = B.substringExactly(['a', 'b'], 'ab', 2)
    expect(accepts(a, 'abab')).toBe(true)
    expect(accepts(a, 'ab')).toBe(false)
    expect(accepts(a, 'ababab')).toBe(false)
  })

  it('toda aparicion de una subcadena antes que cualquiera de la otra', () => {
    const a = B.allBefore(['0', '1'], '00', '11')
    expect(accepts(a, '0011')).toBe(true)
    expect(accepts(a, '1100')).toBe(false)
    expect(accepts(a, '')).toBe(true)
    expect(accepts(a, '0101')).toBe(true)
    expect(accepts(a, '001011')).toBe(true)
    expect(accepts(a, '110011')).toBe(false)
  })
})

describe('hoja de trabajo · parte 1 (enunciado → automata y expresion regular)', () => {
  it('1. a lo sumo una pareja de 0 y una de 1 consecutivos', () => {
    const texto = "Palabras con a lo sumo una pareja de 0's consecutivos y a lo sumo una pareja de 1's consecutivos."
    check(texto, ['', '0', '1', '00', '11', '0011', '1100', '0101'], ['000', '111', '0000', '00100'])
    const r = solve(texto, 'enunciado')
    expect(r.ok).toBe(true)
    expect(r.regex, 'deberia producir una expresion regular').toBeTruthy()
    expect(r.description?.exact).toMatch(/a lo sumo una vez la subcadena "00"/)
  })

  it('2. toda pareja de 0 contiguos antes de cualquier pareja de 1 contiguos', () => {
    const texto = "Cadenas en las que toda pareja de 0's contiguos aparece antes de cualquier pareja de 1's contiguos."
    check(texto, ['', '0011', '000111', '0101', '11'], ['1100', '110011'])
    const r = solve(texto, 'enunciado')
    expect(r.description?.exact).toMatch(/antes que cualquier pareja/)
  })

  it('3. cadenas que no contienen 101 como subcadena', () => {
    const texto = 'Cadenas que no contienen a 101 como subcadena.'
    check(texto, ['', '0', '1', '100', '1001', '111'], ['101', '0101', '1010'])
    const r = solve(texto, 'enunciado')
    expect(r.description?.exact).toMatch(/no contiene la subcadena "101"/)
  })

  it('deduce el alfabeto de la propia redaccion', () => {
    expect(parseStatement('Cadenas que no contienen a 101 como subcadena.').alphabet).toEqual(['0', '1'])
  })
})

describe('el signo + como union', () => {
  it('reconoce la notacion de libro', () => {
    expect(plusLooksLikeUnion('(11+0)*(00+1)*')).toBe(true)
    expect(plusLooksLikeUnion('01 (((10)* + 111)* + 0)* 1')).toBe(true)
    expect(plusLooksLikeUnion('00+1')).toBe(true)
  })

  it('no confunde la cerradura positiva de POSIX', () => {
    expect(plusLooksLikeUnion('a+b?')).toBe(false)
    expect(plusLooksLikeUnion('a+')).toBe(false)
    expect(plusLooksLikeUnion('(ab)+')).toBe(false)
    expect(plusLooksLikeUnion('a+|b')).toBe(false)
  })

  it('con + como union, (11+0)* es (11|0)*', () => {
    expect(regexToString(parseRegex('(11+0)*', { plusAsUnion: true }))).toBe('(11|0)*')
  })

  it('sin la opcion, a+b sigue siendo "una o mas a" seguido de b', () => {
    expect(regexToString(parseRegex('a+b'))).toBe('a+b')
  })

  it('resuelve las expresiones de la hoja', () => {
    const r1 = solve('(11+0)*(00+1)*', 'regex')
    expect(r1.ok).toBe(true)
    expect(r1.interpretation.join(' ')).toMatch(/union/)
    expect(accepts(r1.minimal!, '110')).toBe(true)
    expect(accepts(r1.minimal!, '10')).toBe(false)

    const r2 = solve('01 (((10)* + 111)* + 0)* 1', 'regex')
    expect(r2.ok).toBe(true)
    expect(accepts(r2.minimal!, '011')).toBe(true)
    expect(accepts(r2.minimal!, '10')).toBe(false)
  })

  it('se puede forzar la lectura desde fuera', () => {
    const union = solve('a+b', 'regex', { plusAsUnion: true })
    expect(accepts(union.minimal!, 'b')).toBe(true)
    const plus = solve('a+b', 'regex', { plusAsUnion: false })
    expect(accepts(plus.minimal!, 'b')).toBe(false)
    expect(accepts(plus.minimal!, 'aab')).toBe(true)
  })
})

describe('L ⊂ (a+b)* no es una expresion regular', () => {
  it('lo explica en vez de inventar un automata', () => {
    const r = solve('L ⊂ (a+b)*', 'regex')
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/teoria de conjuntos/)
    expect(r.error).toMatch(/subconjunto/)
  })
})

describe('descripcion del lenguaje en español', () => {
  it('describe exactamente los lenguajes del catalogo', () => {
    const casos: Array<[string, RegExp]> = [
      ['Cadenas sobre {a,b} que terminen en b', /termina en "b"/],
      ['Cadenas sobre {a,b} con numero par de a', /cantidad par de "a"/],
      ['Cadenas sobre {a,b} que no contengan aa', /no contiene la subcadena "aa"/],
      ['Cadenas sobre {a,b} de longitud par', /longitud par/],
    ]
    for (const [texto, esperado] of casos) {
      expect(describeLanguage(lenguaje(texto)).exact, texto).toMatch(esperado)
    }
  })

  it('reconoce Σ* y el lenguaje vacio', () => {
    expect(describeLanguage(B.anyString(['a', 'b'])).exact).toMatch(/todas las cadenas/)
    expect(describeLanguage(B.emptyLanguage(['a', 'b'])).exact).toMatch(/vacio/)
  })

  it('enumera los lenguajes finitos', () => {
    const d = describeLanguage(B.oneOfWords(['a', 'b'], ['a', 'ab', 'ba']))
    expect(d.finite).toBe(true)
    expect(d.exact).toMatch(/"a"/)
    expect(d.exact).toMatch(/"ab"/)
    expect(d.words).toEqual(['a', 'ab', 'ba'])
  })

  it('cuando no puede describirlo del todo, solo afirma lo demostrado', () => {
    const d = describeLanguage(solve('01 (((10)* + 111)* + 0)* 1', 'regex').minimal!)
    expect(d.exact).toBeNull()
    expect(d.facts.length).toBeGreaterThan(0)
    expect(d.facts.join(' ')).toMatch(/empieza con "01"/)
    for (const w of d.accepted) expect(w.startsWith('01')).toBe(true)
  })

  it('nunca afirma una propiedad falsa sobre las cadenas que acepta', () => {
    const d = describeLanguage(lenguaje('Cadenas sobre {a,b} que empiecen con a y terminen en b'))
    const frases = [...(d.exact ? [d.exact] : []), ...d.facts].join(' ')
    if (/termina en "b"/.test(frases)) for (const w of d.accepted) expect(w.endsWith('b')).toBe(true)
    if (/empieza con "a"/.test(frases)) for (const w of d.accepted) expect(w.startsWith('a')).toBe(true)
  })
})

describe('la expresion regular y la descripcion aparecen en los tres modos', () => {
  const CASOS: Array<[string, 'enunciado' | 'regex' | 'formal']> = [
    ['Cadenas sobre {a,b} que terminen en b', 'enunciado'],
    ['(a|b)*abb', 'regex'],
    ['Q = {q0,q1}\nSigma = {a,b}\ninicial = q0\nF = {q1}\nq0, b -> q1\nq1, b -> q1\nq0, a -> q0\nq1, a -> q0', 'formal'],
  ]

  for (const [texto, modo] of CASOS) {
    it(`modo ${modo}`, () => {
      const r = solve(texto, modo)
      expect(r.ok).toBe(true)
      expect(r.regex, 'falta la expresion regular').toBeTruthy()
      expect(r.description, 'falta la descripcion').toBeTruthy()
      expect(r.sections.some((s) => s.id === 'expresion')).toBe(true)
      expect(r.sections.some((s) => s.id === 'descripcion')).toBe(true)
    })
  }
})
