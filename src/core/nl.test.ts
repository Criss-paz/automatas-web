import { describe, it, expect } from 'vitest'
import { parseStatement } from './nl/parser'
import { accepts } from './algorithms/equivalence'
import { solve, typeOf } from './solver'
import { Automaton } from './types'

/**
 * Pruebas del analizador de enunciados. Cada caso comprueba el LENGUAJE que
 * reconoce el automata construido, no su forma: asi da igual cuantos estados
 * salgan mientras acepte y rechace lo que debe.
 */

function build(text: string): Automaton {
  const res = parseStatement(text)
  if (!res.ok || !res.automaton) throw new Error(`no se interpreto "${text}": ${res.error}`)
  return res.automaton
}

/** Comprueba que acepta todas las de `yes` y rechaza todas las de `no`. */
function check(text: string, yes: string[], no: string[]) {
  const a = build(text)
  for (const w of yes) expect(accepts(a, w), `"${text}" deberia aceptar "${w || 'ε'}"`).toBe(true)
  for (const w of no) expect(accepts(a, w), `"${text}" deberia rechazar "${w || 'ε'}"`).toBe(false)
}

describe('lenguajes finitos: "acepta unicamente ..."', () => {
  it('acepta unicamente la cadena a, sobre el alfabeto {a,b}', () => {
    const res = parseStatement('un afd o afn que acepte unicamente a, y el lenguaje es sobre a, b')
    expect(res.ok).toBe(true)
    expect(res.alphabet).toEqual(['a', 'b'])
    check('un afd o afn que acepte unicamente a, y el lenguaje es sobre a, b', ['a'], ['', 'b', 'aa', 'ab', 'ba', 'bb'])
  })

  it('reconoce la misma idea escrita de otras maneras', () => {
    for (const t of [
      'Disene un AFD sobre {a,b} que acepte solamente la cadena a',
      'Automata que reconozca unicamente la palabra a sobre {a,b}',
      'sobre {a,b}, que acepte nada mas a',
    ]) {
      check(t, ['a'], ['', 'b', 'aa', 'ab'])
    }
  })

  it('acepta una lista finita de cadenas', () => {
    check('sobre {a,b} que acepte unicamente las cadenas a, ab y ba', ['a', 'ab', 'ba'], ['', 'b', 'aa', 'bb', 'aba'])
  })

  it('solo la cadena vacia', () => {
    check('sobre {a,b} que acepte solamente la cadena vacia', [''], ['a', 'b', 'aa'])
  })

  it('lenguaje vacio', () => {
    check('sobre {a,b} que no acepte ninguna cadena', [], ['', 'a', 'b', 'ab'])
  })
})

describe('posicion contando desde el final (el caso clasico de AFN)', () => {
  it('el penultimo simbolo es a', () => {
    check(
      'Cadenas sobre {a,b} donde el penultimo simbolo sea a',
      ['aa', 'ab', 'aab', 'bab', 'baa', 'bbab'],
      ['', 'a', 'b', 'ba', 'bb', 'abb', 'bbb'],
    )
  })

  it('el automata construido para el penultimo simbolo es un AFN', () => {
    const res = parseStatement('sobre {a,b} el penultimo simbolo debe ser a')
    expect(res.ok).toBe(true)
    expect(typeOf(res.automaton!)).toBe('AFN')
  })

  it('el antepenultimo simbolo es b', () => {
    check('sobre {a,b} que el antepenultimo simbolo sea b', ['baa', 'bab', 'abba'], ['', 'a', 'aa', 'aaa', 'aab'])
  })

  it('el ultimo simbolo es b', () => {
    check('sobre {a,b} cuyo ultimo simbolo sea b', ['b', 'ab', 'bb', 'aab'], ['', 'a', 'ba', 'aa'])
  })

  it('el segundo simbolo contando desde el final', () => {
    check('sobre {a,b} que el 2 simbolo desde el final sea a', ['aa', 'ab', 'bab'], ['', 'a', 'ba', 'bb'])
  })
})

describe('posicion contando desde el inicio', () => {
  it('el primer simbolo es a', () => {
    check('sobre {a,b} donde el primer simbolo sea a', ['a', 'ab', 'aa', 'abb'], ['', 'b', 'ba', 'bb'])
  })

  it('el tercer simbolo es b', () => {
    check('sobre {a,b} que el tercer simbolo sea b', ['aab', 'bbb', 'abba'], ['', 'a', 'ab', 'aba', 'aaa'])
  })

  it('en la posicion 2 hay a', () => {
    check('sobre {a,b} que en la posicion 2 haya a', ['aa', 'ba', 'aab'], ['', 'a', 'ab', 'bb'])
  })
})

describe('prefijos, sufijos y subcadenas', () => {
  it('empieza con a y termina en b', () => {
    check('Cadenas sobre {a,b} que empiecen con a y terminen en b', ['ab', 'aab', 'abb'], ['', 'a', 'b', 'ba', 'aba'])
  })

  it('empiezan y terminan en a (coordinacion con objeto compartido)', () => {
    check('Cadenas sobre {a,b} que empiecen y terminen en a', ['a', 'aa', 'aba', 'abba'], ['', 'b', 'ab', 'ba'])
  })

  it('empieza y termina con el mismo simbolo', () => {
    check(
      'Cadenas sobre {a,b} que empiecen y terminen con el mismo simbolo',
      ['a', 'b', 'aa', 'bb', 'aba', 'bab'],
      ['', 'ab', 'ba', 'abb'],
    )
  })

  it('prefijo y sufijo', () => {
    check('sobre {a,b} cadenas con prefijo ab', ['ab', 'aba', 'abb'], ['', 'a', 'ba', 'b'])
    check('sobre {a,b} cadenas con sufijo ba', ['ba', 'aba', 'bba'], ['', 'a', 'ab', 'b'])
  })

  it('contiene una subcadena', () => {
    check('Cadenas sobre {a,b} que contengan la subcadena aba', ['aba', 'aabab', 'babab'], ['', 'ab', 'aab', 'bb'])
  })

  it('contiene dos subcadenas (el segundo fragmento hereda el verbo)', () => {
    check('Cadenas sobre {a,b} que contengan aa y bb', ['aabb', 'bbaa', 'aabba'], ['', 'aa', 'bb', 'abab'])
  })

  it('no contiene ninguna de dos subcadenas', () => {
    check('Cadenas sobre {a,b} que no contengan aa ni bb', ['', 'a', 'b', 'ab', 'ba', 'abab'], ['aa', 'bb', 'aab', 'abba'])
  })
})

describe('conteos y longitudes', () => {
  it('numero par de a', () => {
    check('Cadenas sobre {a,b} con numero par de a', ['', 'b', 'aa', 'aab', 'baba'], ['a', 'ab', 'aaa'])
  })

  it('par de a e impar de b', () => {
    check('Cadenas sobre {a,b} con numero par de a y numero impar de b', ['b', 'aab', 'bbb'], ['', 'a', 'ab', 'bb'])
  })

  it('a lo sumo dos a', () => {
    check('Cadenas sobre {a,b} con a lo sumo 2 a', ['', 'b', 'a', 'aa', 'bab'], ['aaa', 'aaab', 'abaa'])
  })

  it('mas de una a', () => {
    check('Cadenas sobre {a,b} con mas de 1 a', ['aa', 'aba', 'aab'], ['', 'a', 'b', 'ab'])
  })

  it('menos de dos b', () => {
    check('Cadenas sobre {a,b} con menos de 2 b', ['', 'a', 'b', 'ab', 'aab'], ['bb', 'abb', 'bab'])
  })

  it('sin ninguna b', () => {
    check('Cadenas sobre {a,b} sin ninguna b', ['', 'a', 'aa', 'aaa'], ['b', 'ab', 'ba'])
  })

  it('longitud entre 2 y 4', () => {
    check('Cadenas sobre {a,b} de longitud entre 2 y 4', ['aa', 'aba', 'abab'], ['', 'a', 'ababa'])
  })

  it('longitud mayor que 2', () => {
    check('Cadenas sobre {a,b} de longitud mayor que 2', ['aaa', 'abab'], ['', 'a', 'ab'])
  })

  it('longitud multiplo de 3', () => {
    check('Cadenas sobre {a,b} de longitud multiplo de 3', ['', 'aaa', 'aba', 'aabbaa'], ['a', 'ab', 'aaaa'])
  })

  it('cantidad de a multiplo de 3', () => {
    check('Cadenas sobre {a,b} donde la cantidad de a sea multiplo de 3', ['', 'b', 'aaa', 'ababa'], ['a', 'aa', 'aab'])
  })
})

describe('estructura logica del enunciado', () => {
  it('union con "o"', () => {
    const res = parseStatement('Cadenas sobre {a,b} que empiecen con a o terminen en b')
    expect(res.ok).toBe(true)
    expect(res.combination).toBe('union')
    check('Cadenas sobre {a,b} que empiecen con a o terminen en b', ['a', 'ab', 'bb', 'aba', 'b'], ['', 'ba', 'bba'])
  })

  it('mezcla de y / o', () => {
    const res = parseStatement('Cadenas sobre {a,b} que empiecen con a y terminen en b o que tengan longitud 1')
    expect(res.ok).toBe(true)
    expect(res.combination).toBe('mixta')
    check('Cadenas sobre {a,b} que empiecen con a y terminen en b o que tengan longitud 1', ['ab', 'aab', 'a', 'b'], ['', 'ba', 'bb'])
  })

  it('negacion con "excepto"', () => {
    check('Todas las cadenas sobre {a,b} excepto las que terminan en a', ['', 'b', 'ab', 'bb'], ['a', 'ba', 'aa'])
  })

  it('simbolos alternados', () => {
    check('Cadenas sobre {a,b} con simbolos alternados', ['', 'a', 'b', 'ab', 'ba', 'abab'], ['aa', 'bb', 'aab'])
  })

  it('formadas solo por a', () => {
    check('Cadenas sobre {a,b} formadas unicamente por a', ['', 'a', 'aa', 'aaa'], ['b', 'ab', 'ba'])
  })

  it('cadenas no vacias', () => {
    check('Cadenas no vacias sobre {a,b}', ['a', 'b', 'ab'], [''])
  })
})

describe('otros formatos de entrada', () => {
  it('binarios multiplos de 3', () => {
    check('Cadenas sobre {0,1} que sean multiplos de 3', ['', '0', '11', '110', '1001'], ['1', '10', '100'])
  })

  it('acepta una expresion regular embebida', () => {
    check('Cadenas que cumplan la expresion regular (a|b)*abb', ['abb', 'aabb', 'babb'], ['', 'ab', 'abba'])
  })

  it('deduce el alfabeto cuando no se declara', () => {
    const res = parseStatement('cadenas que empiecen con a y terminen en b')
    expect(res.ok).toBe(true)
    expect(res.alphabet).toEqual(['a', 'b'])
  })

  it('acepta el alfabeto declarado sin llaves', () => {
    const res = parseStatement('que termine en b, el alfabeto es a, b, c')
    expect(res.alphabet).toEqual(['a', 'b', 'c'])
  })
})

describe('lenguajes que no son regulares', () => {
  const NO_REGULARES = [
    'Cadenas sobre {a,b} con igual numero de a que de b',
    'Cadenas sobre {a,b} con tantas a como b',
    'Cadenas de la forma a^n b^n',
    'Cadenas sobre {a,b} que sean palindromos',
    'Cadenas con parentesis bien balanceados',
  ]

  it('se rechazan con una explicacion en vez de inventar un automata', () => {
    for (const t of NO_REGULARES) {
      const res = parseStatement(t)
      expect(res.ok, t).toBe(false)
      expect(res.error, t).toMatch(/no es regular/)
      expect(res.error, t).toMatch(/lema del bombeo/)
    }
  })
})

describe('enunciados que no se entienden', () => {
  it('avisa en vez de devolver un automata cualquiera', () => {
    const res = parseStatement('quiero algo bonito para la clase de manana')
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/No se reconocio ninguna condicion/)
  })
})

describe('flujo completo del solucionador desde el enunciado', () => {
  const CASOS = [
    'un afd o afn que acepte unicamente a, y el lenguaje es sobre a, b',
    'Cadenas sobre {a,b} donde el penultimo simbolo sea a',
    'Disene un AFD sobre {a,b} que empiece con a o termine en b',
    'Cadenas sobre {a,b} que no contengan aa ni bb',
    'Cadenas sobre {a,b} que empiecen y terminen con el mismo simbolo',
  ]

  it('resuelve, minimiza y verifica cada enunciado', () => {
    for (const t of CASOS) {
      const r = solve(t, 'enunciado')
      expect(r.ok, t).toBe(true)
      expect(r.verification?.equivalent, t).toBe(true)
      // Los dos metodos de minimizacion deben coincidir en el numero de estados.
      expect(r.verification?.brzozowskiStates, t).toBe(r.verification?.tableFillingStates)
    }
  })

  it('el enunciado del penultimo simbolo pasa por la determinizacion AFN -> AFD', () => {
    const r = solve('Cadenas sobre {a,b} donde el penultimo simbolo sea a', 'enunciado')
    expect(r.identification?.type).toBe('AFN')
    expect(r.minimal!.states.length).toBe(4)
  })
})

describe('enunciados escritos como en clase', () => {
  it('ignora la parte que habla del ejercicio y no del lenguaje', () => {
    check('Ejercicio 3) Disene un AFD sobre {0,1} que empiece con 0 y tenga longitud par', ['00', '0101'], ['', '0', '1', '10'])
  })

  it('acepta el alfabeto declarado solo con espacios', () => {
    const res = parseStatement('quiero un afn que acepte solo la palabra ab, alfabeto a b')
    expect(res.alphabet).toEqual(['a', 'b'])
    expect(res.unmatched).toEqual([])
  })

  it('entiende el ordinal sin el sustantivo ("el primero sea b")', () => {
    check('sobre {a,b} que el ultimo simbolo sea a y el primero sea b', ['ba', 'baa', 'bba'], ['', 'a', 'ab', 'aa'])
  })

  it('enumera objetos a traves de un "o"', () => {
    check('cadenas sobre {a,b} en las que aparezca aa o bb', ['aa', 'bb', 'abba', 'baab'], ['', 'a', 'ab', 'abab'])
  })

  it('mezcla negacion y conjuncion en una sola frase', () => {
    check('sobre {a,b}: cadenas que contengan la subcadena aba pero no terminen en b', ['aba', 'abaa'], ['', 'ab', 'abab', 'aab'])
  })
})
