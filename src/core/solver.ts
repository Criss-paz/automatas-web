import { Automaton, Step } from './types'
import {
  determinismReport,
  finalStates,
  hasEpsilon,
  initialState,
  isDeterministic,
  transitionTable,
} from './automaton'
import { parseRegex, alphabetOf, regexToString, RegexError, splitAlphabetDeclaration } from './regex/parser'
import { buildFromRegex } from './regex/build'
import { parseStatement } from './nl/parser'
import { parseFormal } from './formal'
import { subsetConstruction } from './algorithms/subset'
import { brzozowski } from './algorithms/brzozowski'
import { minimizeTableFilling } from './algorithms/minimize'
import { checkEquivalence, bruteForceCompare } from './algorithms/equivalence'
import { sampleWords, showWord } from './samples'

export type InputMode = 'enunciado' | 'regex' | 'formal'

export interface Identification {
  alphabet: string[]
  initialLabel: string
  finalLabels: string[]
  stateLabels: string[]
  type: 'AFD' | 'AFN' | 'AFN-ε'
  reasons: string[]
  accepted: string[]
  rejected: string[]
}

export interface SolveResult {
  ok: boolean
  error?: string
  notes: string[]
  /** Como interpreto el sistema la entrada. */
  interpretation: string[]
  identification?: Identification
  initial?: Automaton
  dfa?: Automaton
  minimal?: Automaton
  /** Procedimiento completo, seccionado. */
  sections: Array<{ id: string; title: string; steps: Step[] }>
  verification?: {
    equivalent: boolean
    counterexample?: string
    steps: Step[]
    bruteForce: { tested: number; mismatches: number; rows: string[][] }
    tableFillingStates: number
    brzozowskiStates: number
  }
}

export function typeOf(a: Automaton): 'AFD' | 'AFN' | 'AFN-ε' {
  if (hasEpsilon(a)) return 'AFN-ε'
  return isDeterministic(a) ? 'AFD' : 'AFN'
}

export function identify(a: Automaton): Identification {
  const { accepted, rejected } = sampleWords(a, { accepted: 10, rejected: 6, maxLen: 8 })
  return {
    alphabet: [...a.alphabet],
    initialLabel: initialState(a)?.label ?? '(sin inicial)',
    finalLabels: finalStates(a).map((s) => s.label),
    stateLabels: a.states.map((s) => s.label),
    type: typeOf(a),
    reasons: determinismReport(a),
    accepted: accepted.map(showWord),
    rejected: rejected.map(showWord),
  }
}

/**
 * Resuelve un problema completo del Modo 1:
 * entrada -> automata -> AFD -> minimizacion (Brzozowski) -> verificacion.
 */
export function solve(input: string, mode: InputMode): SolveResult {
  const notes: string[] = []
  const interpretation: string[] = []
  const sections: SolveResult['sections'] = []

  // ---------- 1. Entrada -> automata inicial -------------------------------
  let initial: Automaton
  const buildSteps: Step[] = []

  try {
    if (mode === 'regex') {
      const { alphabet: declared, expression } = splitAlphabetDeclaration(input)
      const ast = parseRegex(expression, { alphabet: declared })
      const alpha = [...new Set([...(declared ?? []), ...alphabetOf(ast)])].sort()
      if (alpha.length === 0) return fail('La expresion regular no usa ningun simbolo del alfabeto.')
      interpretation.push(`Expresion regular interpretada: **${regexToString(ast)}**`)
      interpretation.push(
        declared ? `Alfabeto declarado: Σ = {${alpha.join(', ')}}` : `Alfabeto deducido: Σ = {${alpha.join(', ')}}`,
      )

      const built = buildFromRegex(ast, alpha)
      initial = built.automaton
      buildSteps.push({
        title: built.usedBooleanOps ? 'Construccion del automata' : 'Construccion de Thompson',
        body: built.usedBooleanOps
          ? `Las partes con operadores clasicos (| · * + ?) se construyen con **Thompson**: cada operador es un ` +
            `fragmento con una entrada y una salida unidos por transiciones ε. Los operadores **~ (complemento), ` +
            `&& (interseccion) y − (diferencia)** no se pueden expresar asi, de modo que en esos puntos se ` +
            `determiniza y se aplica la operacion booleana correspondiente.`
          : `Cada operador de la expresion regular se traduce en un fragmento de automata con una entrada y una salida, ` +
            `unidos con transiciones ${'ε'}. El resultado es un AFN-ε que reconoce exactamente el lenguaje de la expresion.`,
      })
      buildSteps.push(...built.steps)
      buildSteps.push({
        title: `Automata obtenido (${typeOf(initial)})`,
        table: { caption: 'Tabla de transiciones', ...transitionTable(initial) },
        automaton: initial,
      })
    } else if (mode === 'formal') {
      const res = parseFormal(input)
      if (!res.ok || !res.automaton) return fail(res.errors.join(' '))
      initial = res.automaton
      notes.push(...res.warnings)
      interpretation.push(`Especificacion formal leida: ${initial.states.length} estados, Σ = {${initial.alphabet.join(', ')}}`)
      buildSteps.push({
        title: 'Automata leido de la especificacion',
        table: { caption: 'Tabla de transiciones', ...transitionTable(initial) },
        automaton: initial,
      })
    } else {
      const res = parseStatement(input)
      if (!res.ok || !res.automaton) return fail(res.error ?? 'No se pudo interpretar el enunciado.')
      initial = res.automaton
      notes.push(...res.notes)
      interpretation.push(`Alfabeto reconocido: Σ = {${res.alphabet.join(', ')}}`)
      if (res.clauses.length > 1) interpretation.push(`Lectura logica del enunciado: **${res.structure}**`)
      for (const c of res.clauses) interpretation.push(`Condicion detectada: "${c.text}" → **${c.reading}**`)

      // Como se combinan las condiciones depende de los conectores del enunciado.
      const combinacion =
        res.combination === 'union'
          ? `Despues se combinan por **union** (construccion del producto), porque el enunciado usa "o": basta con cumplir una.`
          : res.combination === 'mixta'
            ? `El enunciado mezcla "y" con "o", asi que se leyo como **${res.structure}**: primero se intersecan las condiciones unidas por "y" y luego se unen los grupos separados por "o".`
            : res.combination === 'interseccion'
              ? `Despues se combinan por **interseccion** (construccion del producto), porque la cadena debe cumplirlas todas a la vez.`
              : `El enunciado tiene una sola condicion, asi que su automata es directamente el resultado de este paso.`

      buildSteps.push({
        title: 'Condiciones reconocidas en el enunciado',
        body: `Cada condicion del enunciado se convierte en un automata propio. ${combinacion}`,
        table: {
          caption: 'Condiciones detectadas',
          headers: ['Fragmento del enunciado', 'Interpretacion', 'Estados'],
          rows: res.clauses.map((c) => [c.text, c.reading, String(c.automaton.states.length)]),
        },
      })
      for (const c of res.clauses) {
        buildSteps.push({
          title: `Automata de la condicion: ${c.reading}`,
          body: c.negated
            ? `La condicion esta negada, asi que se completa el AFD con estado trampa y se intercambian los estados finales con los no finales (**complemento**).`
            : undefined,
          table: { caption: 'Tabla de transiciones', ...transitionTable(c.automaton) },
          automaton: c.automaton,
        })
      }
      if (res.clauses.length > 1) {
        const esUnion = res.combination === 'union'
        buildSteps.push({
          title: esUnion ? 'Union de las condiciones' : 'Combinacion de las condiciones',
          body:
            `Se construye el automata producto: sus estados son pares (o tuplas) de estados de los automatas de cada condicion, ` +
            (esUnion
              ? `y un estado es final si lo es en **alguna** de las condiciones.`
              : res.combination === 'mixta'
                ? `final si lo es en todas las condiciones de un mismo grupo "y", y basta con que lo sea en alguno de los grupos unidos por "o".`
                : `y un estado es final solo si lo es en **todas** las condiciones.`),
          table: { caption: 'Tabla de transiciones del automata combinado', ...transitionTable(initial) },
          automaton: initial,
        })
      }
    }
  } catch (e) {
    if (e instanceof RegexError) return fail(e.message)
    return fail(`Error al interpretar la entrada: ${(e as Error).message}`)
  }

  if (initial.states.length === 0) return fail('El automata resultante no tiene estados.')
  if (!initialState(initial)) return fail('El automata resultante no tiene estado inicial.')

  sections.push({ id: 'construccion', title: '1. Construccion del automata inicial', steps: buildSteps })

  // ---------- 2. Identificacion --------------------------------------------
  const ident = identify(initial)
  sections.push({
    id: 'identificacion',
    title: '2. Identificacion del automata',
    steps: [
      {
        title: 'Componentes reconocidos',
        table: {
          caption: 'Quintupla M = (Q, Σ, δ, q₀, F)',
          headers: ['Componente', 'Valor'],
          rows: [
            ['Q — estados', `{${ident.stateLabels.join(', ')}}  (${ident.stateLabels.length})`],
            ['Σ — alfabeto', `{${ident.alphabet.join(', ')}}`],
            ['q₀ — estado inicial', ident.initialLabel],
            ['F — estados finales', ident.finalLabels.length ? `{${ident.finalLabels.join(', ')}}` : '∅'],
            ['Tipo', ident.type],
          ],
        },
        bullets: ident.reasons.length
          ? ['Es un AFN porque:', ...ident.reasons]
          : ['Cumple la definicion de AFD: sin transiciones ε y con a lo sumo un destino por (estado, simbolo).'],
      },
      {
        title: 'Cadenas que acepta y que rechaza',
        body: 'Cadenas mas cortas probadas en orden de longitud creciente.',
        table: {
          caption: 'Muestra del lenguaje',
          headers: ['Acepta', 'Rechaza'],
          rows: Array.from({ length: Math.max(ident.accepted.length, ident.rejected.length) }, (_, i) => [
            ident.accepted[i] ?? '',
            ident.rejected[i] ?? '',
          ]),
        },
      },
    ],
  })

  // ---------- 3. Determinizacion (si hace falta) ---------------------------
  let dfa = initial
  if (!isDeterministic(initial)) {
    const sub = subsetConstruction(initial, { name: 'AFD equivalente' })
    dfa = sub.automaton
    sections.push({ id: 'determinizacion', title: '3. Determinizacion (AFN → AFD)', steps: sub.steps })
  } else {
    sections.push({
      id: 'determinizacion',
      title: '3. Determinizacion',
      steps: [
        {
          title: 'No es necesaria',
          body: 'El automata construido ya es un AFD, asi que se pasa directo a la minimizacion.',
        },
      ],
    })
  }

  // ---------- 4. Minimizacion por Brzozowski -------------------------------
  const brz = brzozowski(dfa, { finalName: 'AFD minimo' })
  const minimal = brz.automaton
  sections.push({ id: 'brzozowski', title: '4. Minimizacion por el algoritmo de Brzozowski', steps: brz.steps })

  // ---------- 5. Segundo metodo de minimizacion (contraste) ----------------
  const tf = minimizeTableFilling(dfa)
  sections.push({
    id: 'tabla',
    title: '5. Segundo metodo: tabla de estados distinguibles',
    steps: [
      {
        title: 'Por que un segundo metodo',
        body:
          `El AFD minimo de un lenguaje es **unico** salvo el nombre de los estados (teorema de Myhill-Nerode). ` +
          `Si dos algoritmos distintos llegan al mismo numero de estados, eso respalda que el resultado es correcto.`,
      },
      ...tf.steps,
    ],
  })

  // ---------- 6. Verificacion de equivalencia ------------------------------
  const eq = checkEquivalence(initial, minimal, ['Automata inicial', 'AFD minimo'])
  const bf = bruteForceCompare(initial, minimal, 7)
  const eqTf = checkEquivalence(minimal, tf.automaton, ['Brzozowski', 'Tabla'])

  sections.push({
    id: 'verificacion',
    title: '6. Verificacion: ¿el minimo es equivalente al inicial?',
    steps: [
      {
        title: 'Que se va a comprobar',
        body:
          `Minimizar no puede cambiar el lenguaje. Se comprueba con tres pruebas independientes: ` +
          `(a) construccion del producto entre el automata inicial y el minimo, ` +
          `(b) prueba exhaustiva de todas las cadenas hasta longitud 7, ` +
          `(c) comparacion del resultado de Brzozowski contra el de la tabla de estados distinguibles.`,
      },
      ...eq.steps,
      {
        title: 'Prueba (b) · Fuerza bruta hasta longitud 7',
        body:
          `Se probaron **${bf.tested}** cadenas en los dos automatas. ` +
          (bf.mismatches.length === 0
            ? `**Ninguna** obtuvo un veredicto distinto. No demuestra la equivalencia por si sola (es un numero finito de cadenas), pero confirma el resultado del producto.`
            : `Se encontraron ${bf.mismatches.length} discrepancias, la primera con "${showWord(bf.mismatches[0].word)}". Esto indica un error.`),
        table: {
          caption: 'Primeras cadenas probadas',
          headers: ['Cadena', 'Automata inicial', 'AFD minimo', '¿Coinciden?'],
          rows: bf.rows,
        },
      },
      {
        title: 'Prueba (c) · Brzozowski contra tabla de estados distinguibles',
        body:
          `Brzozowski produjo **${minimal.states.length}** estados y la tabla de estados distinguibles produjo **${tf.automaton.states.length}**. ` +
          (eqTf.equivalent
            ? 'Ademas la construccion del producto confirma que los dos minimos aceptan el mismo lenguaje.'
            : 'ATENCION: los dos metodos no coinciden, revisar la entrada.'),
        bullets: [
          `Estados del automata inicial: ${initial.states.length}`,
          `Estados del AFD (tras determinizar): ${dfa.states.length}`,
          `Estados del minimo por Brzozowski: ${minimal.states.length}`,
          `Estados del minimo por tabla: ${tf.automaton.states.length}`,
        ],
      },
      {
        title: eq.equivalent && bf.mismatches.length === 0 ? 'CONCLUSION: verificacion superada ✓' : 'CONCLUSION: hay discrepancias ✗',
        body: eq.equivalent
          ? `El AFD minimo acepta exactamente el mismo lenguaje que el automata inicial, con ${initial.states.length} → ${minimal.states.length} estados.`
          : `Los automatas NO son equivalentes. Contraejemplo: "${showWord(eq.counterexample?.word ?? '')}".`,
        automaton: minimal,
      },
    ],
  })

  return {
    ok: true,
    notes,
    interpretation,
    identification: ident,
    initial,
    dfa,
    minimal,
    sections,
    verification: {
      equivalent: eq.equivalent && bf.mismatches.length === 0,
      counterexample: eq.counterexample?.word,
      steps: eq.steps,
      bruteForce: { tested: bf.tested, mismatches: bf.mismatches.length, rows: bf.rows },
      tableFillingStates: tf.automaton.states.length,
      brzozowskiStates: minimal.states.length,
    },
  }

  function fail(error: string): SolveResult {
    return { ok: false, error, notes, interpretation, sections: [] }
  }
}
