import { describe, it, expect } from 'vitest'
import { parseFormal, parseStateName, parseTransitionLine, toFormal, toJson } from './formal'
import { accepts, checkEquivalence } from './algorithms/equivalence'
import { solve, typeOf } from './solver'
import { Automaton, EPSILON } from './types'

function build(spec: string): Automaton {
  const r = parseFormal(spec)
  if (!r.ok || !r.automaton) throw new Error(`no se leyo la especificacion: ${r.errors.join(' ')}`)
  return r.automaton
}

function check(spec: string, yes: string[], no: string[]) {
  const a = build(spec)
  for (const w of yes) expect(accepts(a, w), `deberia aceptar "${w || 'ε'}"`).toBe(true)
  for (const w of no) expect(accepts(a, w), `deberia rechazar "${w || 'ε'}"`).toBe(false)
}

/** Termina en b, escrito de todas las formas posibles. */
const TERMINA_EN_B = { yes: ['b', 'ab', 'bb', 'aab'], no: ['', 'a', 'ba', 'aa'] }

describe('marcas en el nombre del estado', () => {
  it('reconoce -> como inicial y * como final', () => {
    expect(parseStateName('->q0')).toEqual({ name: 'q0', initial: true, final: false })
    expect(parseStateName('*q1')).toEqual({ name: 'q1', initial: false, final: true })
    expect(parseStateName('q1*')).toEqual({ name: 'q1', initial: false, final: true })
    expect(parseStateName('->*q0')).toEqual({ name: 'q0', initial: true, final: true })
    expect(parseStateName('(q2)')).toEqual({ name: 'q2', initial: false, final: true })
    expect(parseStateName(' q3 ')).toEqual({ name: 'q3', initial: false, final: false })
  })
})

describe('estilos de transicion', () => {
  const CASOS: Array<[string, string]> = [
    ['coma y flecha', 'q0, b -> q1'],
    ['flecha con guiones', 'q0 -b-> q1'],
    ['flecha larga', 'q0 --b--> q1'],
    ['funcion delta', 'd(q0, b) = q1'],
    ['funcion con simbolo griego', 'δ(q0,b) = q1'],
    ['destino y simbolo entre corchetes', 'q0 -> q1 [b]'],
    ['destino y simbolo con dos puntos', 'q0 -> q1 : b'],
    ['tres campos separados por espacios', 'q0 b q1'],
  ]

  for (const [nombre, linea] of CASOS) {
    it(`entiende ${nombre}: ${linea}`, () => {
      const t = parseTransitionLine(linea)
      expect(t).not.toBeNull()
      expect(t!.from).toBe('q0')
      expect(t!.symbols).toEqual(['b'])
      expect(t!.targets).toEqual(['q1'])
    })
  }

  it('acepta varios simbolos en una sola transicion', () => {
    expect(parseTransitionLine('q0, a|b -> q1')!.symbols).toEqual(['a', 'b'])
    expect(parseTransitionLine('q0, {a,b} -> q1')!.symbols).toEqual(['a', 'b'])
  })

  it('acepta varios destinos (AFN)', () => {
    expect(parseTransitionLine('q0, a -> q1, q2')!.targets).toEqual(['q1', 'q2'])
    expect(parseTransitionLine('q0, a -> {q1,q2}')!.targets).toEqual(['q1', 'q2'])
  })

  it('acepta la ausencia de destino', () => {
    expect(parseTransitionLine('q0, a -> -')!.targets).toEqual([])
    expect(parseTransitionLine('q0, a -> ∅')!.targets).toEqual([])
  })

  it('reconoce la transicion vacia con cualquier nombre', () => {
    for (const e of ['e', 'eps', 'epsilon', 'lambda', 'ε']) {
      expect(parseTransitionLine(`q0, ${e} -> q1`)!.symbols).toEqual([EPSILON])
    }
  })
})

describe('formato por lineas', () => {
  it('lee la quintupla completa', () => {
    check(
      `Q = {q0, q1}
Sigma = {a, b}
inicial = q0
F = {q1}
q0, a -> q0
q0, b -> q1
q1, a -> q0
q1, b -> q1`,
      TERMINA_EN_B.yes,
      TERMINA_EN_B.no,
    )
  })

  it('funciona sin declaraciones, solo con transiciones y marcas', () => {
    check(
      `->q0, a -> q0
q0, b -> *q1
q1, a -> q0
q1, b -> q1`,
      TERMINA_EN_B.yes,
      TERMINA_EN_B.no,
    )
  })

  it('acepta marcas dentro de Q', () => {
    const a = build(`Q = {->q0, *q1}
q0, b -> q1
q1, b -> q1
q0, a -> q0
q1, a -> q0`)
    expect(a.states.find((s) => s.label === 'q0')!.isInitial).toBe(true)
    expect(a.states.find((s) => s.label === 'q1')!.isFinal).toBe(true)
  })

  it('admite varios estados iniciales y lo advierte', () => {
    const r = parseFormal(`Q = {q0, q1, q2}
iniciales = {q0, q1}
F = {q2}
q0, a -> q2
q1, b -> q2`)
    expect(r.ok).toBe(true)
    expect(r.automaton!.states.filter((s) => s.isInitial).length).toBe(2)
    expect(r.warnings.join(' ')).toMatch(/estados iniciales/)
  })

  it('avisa de las lineas que no entiende sin descartar el resto', () => {
    const r = parseFormal(`Q = {q0, q1}
inicial = q0
F = {q1}
esto no es una transicion valida ni de lejos porque tiene muchas palabras
q0, b -> q1`)
    expect(r.ok).toBe(true)
    expect(r.warnings.some((w) => /no se entendio/i.test(w))).toBe(true)
    expect(accepts(r.automaton!, 'b')).toBe(true)
  })
})

describe('tabla de transiciones', () => {
  it('lee una tabla con marcas en la primera columna', () => {
    check(
      `δ    | a  | b
->q0 | q0 | q1
*q1  | q0 | q1`,
      TERMINA_EN_B.yes,
      TERMINA_EN_B.no,
    )
  })

  it('lee una tabla estilo markdown con bordes y separador', () => {
    check(
      `| δ    | a  | b  |
|------|----|----|
| ->q0 | q0 | q1 |
| *q1  | q0 | q1 |`,
      TERMINA_EN_B.yes,
      TERMINA_EN_B.no,
    )
  })

  it('lee celdas con varios destinos como AFN', () => {
    const a = build(`δ    | a     | b
->q0 | q0,q1 | q0
*q1  | -     | -`)
    expect(typeOf(a)).toBe('AFN')
    expect(accepts(a, 'a')).toBe(true)
    expect(accepts(a, 'ba')).toBe(true)
    expect(accepts(a, 'ab')).toBe(false)
  })

  it('la tabla y las lineas producen el mismo automata', () => {
    const porTabla = build(`δ    | a  | b
->q0 | q0 | q1
*q1  | q0 | q1`)
    const porLineas = build(`inicial = q0
F = {q1}
q0, a -> q0
q0, b -> q1
q1, a -> q0
q1, b -> q1`)
    expect(checkEquivalence(porTabla, porLineas).equivalent).toBe(true)
  })
})

describe('formato JSON', () => {
  it('lee un automata en JSON', () => {
    check(
      `{"states":["q0","q1"],"alphabet":["a","b"],"initial":"q0","finals":["q1"],
        "transitions":[["q0","a","q0"],["q0","b","q1"],["q1","a","q0"],["q1","b","q1"]]}`,
      TERMINA_EN_B.yes,
      TERMINA_EN_B.no,
    )
  })

  it('lee transiciones escritas como objetos', () => {
    check(
      `{"initial":"q0","finals":["q1"],
        "transitions":[{"from":"q0","symbol":"b","to":"q1"},{"from":"q1","symbol":"b","to":"q1"},
                       {"from":"q0","symbol":"a","to":"q0"},{"from":"q1","symbol":"a","to":"q0"}]}`,
      TERMINA_EN_B.yes,
      TERMINA_EN_B.no,
    )
  })

  it('avisa si el JSON esta mal formado', () => {
    const r = parseFormal('{"initial": "q0",}')
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toMatch(/JSON/)
  })
})

describe('ida y vuelta', () => {
  const ORIGINAL = `Q = {q0, q1, q2}
Sigma = {a, b}
inicial = q0
F = {q2}
q0, a -> q0
q0, a -> q1
q0, b -> q0
q1, e -> q2
q1, b -> q2`

  it('exportar a texto y volver a leer conserva el lenguaje', () => {
    const a = build(ORIGINAL)
    const b = build(toFormal(a))
    expect(checkEquivalence(a, b).equivalent).toBe(true)
  })

  it('exportar a JSON y volver a leer conserva el lenguaje', () => {
    const a = build(ORIGINAL)
    const b = build(toJson(a))
    expect(checkEquivalence(a, b).equivalent).toBe(true)
  })
})

describe('alfabetos amplios', () => {
  it('admite mayusculas, digitos y otros caracteres', () => {
    check(
      `Sigma = {A, 7, #}
->q0, A -> q1
q1, 7 -> q2
*q2, # -> q2`,
      ['A7', 'A7#', 'A7##'],
      ['', 'A', '7A'],
    )
  })

  it('admite simbolos de varios caracteres', () => {
    const a = build(`Sigma = {id, num, op}
->q0, id -> q1
*q1, op -> q2
q2, num -> q1`)
    expect(accepts(a, 'id')).toBe(true)
    expect(accepts(a, 'id op num')).toBe(true)
    expect(accepts(a, 'idopnum')).toBe(true)
    expect(accepts(a, 'id op')).toBe(false)
  })
})

describe('flujo completo del solucionador desde la especificacion', () => {
  const CASOS = [
    `Q = {q0,q1,q2}
Sigma = {a,b}
inicial = q0
F = {q2}
q0, a -> q0
q0, a -> q1
q0, b -> q0
q1, e -> q2
q1, b -> q2`,
    `δ    | a  | b
->q0 | q0 | q1
*q1  | q0 | q1`,
    `{"alphabet":["a","b"],"initial":"q0","finals":["q1"],
      "transitions":[["q0","a","q0"],["q0","b","q1"],["q1","a","q0"],["q1","b","q1"]]}`,
    `Sigma = {a, b}
d(q0, a) = q0
d(q0, b) = q1
inicial = q0
F = {q1}`,
  ]

  it('resuelve, minimiza y verifica cada formato', () => {
    for (const t of CASOS) {
      const r = solve(t, 'formal')
      expect(r.ok, t).toBe(true)
      expect(r.verification?.equivalent, t).toBe(true)
    }
  })
})
