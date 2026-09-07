import React, { useState } from 'react'
import { InputMode, solve, SolveResult } from '../core/solver'
import StepsView, { RichText, Section, StepCard } from './StepsView'
import AutomatonView from './AutomatonView'
import StringTester from './StringTester'
import { toFormal } from '../core/formal'

const EXAMPLES: Record<InputMode, Array<{ label: string; text: string }>> = {
  enunciado: [
    { label: 'Empieza con a y termina en b', text: 'Cadenas sobre {a,b} que empiecen con a y terminen en b' },
    { label: 'Número par de a', text: 'Cadenas sobre {a,b} con número par de a' },
    { label: 'Contienen aa, longitud impar', text: 'Cadenas sobre {a,b} que contengan aa y de longitud impar' },
    { label: 'No contienen ab', text: 'Cadenas sobre {a,b} que no contengan ab' },
    { label: 'Binarios múltiplos de 3', text: 'Cadenas sobre {0,1} que sean múltiplos de 3' },
    { label: 'Par de a e impar de b', text: 'Cadenas sobre {a,b} con número par de a y número impar de b' },
  ],
  regex: [
    { label: '(a|b)*abb', text: '(a|b)*abb' },
    { label: 'a*b*c*', text: 'a*b*c*' },
    { label: '(0|1)*01', text: '(0|1)*01' },
    { label: 'a(a|b)*b con ε', text: '(a|ε)(a|b)*b' },
    { label: 'Kleene anidada', text: '((a|b)(a|b))*' },
  ],
  formal: [
    {
      label: 'AFN con ε',
      text: `Q = {q0, q1, q2}
Sigma = {a, b}
inicial = q0
F = {q2}
delta:
q0, a -> q0
q0, a -> q1
q0, b -> q0
q1, e -> q2
q1, b -> q2`,
    },
    {
      label: 'AFD con estados redundantes',
      text: `Q = {A, B, C, D, E}
Sigma = {0, 1}
inicial = A
F = {C, D, E}
delta:
A, 0 -> B
A, 1 -> C
B, 0 -> A
B, 1 -> D
C, 0 -> E
C, 1 -> C
D, 0 -> E
D, 1 -> D
E, 0 -> E
E, 1 -> C`,
    },
  ],
}

const PLACEHOLDER: Record<InputMode, string> = {
  enunciado: 'Ej.: Cadenas sobre {a,b} que empiecen con a y terminen en bb',
  regex: 'Ej.: (a|b)*abb      operadores:  |  *  +  ?  ( )   ε   ∅',
  formal: 'Q = {q0, q1}\nSigma = {a, b}\ninicial = q0\nF = {q1}\nq0, a -> q1',
}

const AYUDA: Record<InputMode, React.ReactNode> = {
  enunciado: (
    <ul>
      <li>Declara el alfabeto con llaves: <code>sobre {'{a,b}'}</code>. Si no lo pones, se deduce.</li>
      <li>Condiciones reconocidas: <b>empieza con</b> X, <b>termina en</b> X, <b>contiene</b> X, <b>no contiene</b> X,
        <b> número par/impar de</b> X, <b>al menos n</b> X, <b>exactamente n</b> X, <b>longitud par/impar</b>,
        <b> longitud ≥ / ≤ / = n</b>, <b>longitud múltiplo de n</b>, <b>múltiplos de k</b> (número en base |Σ|).</li>
      <li>Se combinan con <b>y</b>: cada condición se convierte en un autómata y se intersecan.</li>
    </ul>
  ),
  regex: (
    <ul>
      <li><code>|</code> unión · <code>*</code> cero o más · <code>+</code> una o más · <code>?</code> opcional · <code>( )</code> agrupación.</li>
      <li><code>ε</code> o <code>&amp;</code> = cadena vacía · <code>∅</code> = lenguaje vacío.</li>
      <li>La concatenación es implícita: <code>ab</code> es a seguido de b.</li>
      <li>Se construye el AFN-ε por <b>Thompson</b>, luego el AFD por subconjuntos y luego el mínimo.</li>
    </ul>
  ),
  formal: (
    <ul>
      <li>Una línea por componente: <code>Q = {'{...}'}</code>, <code>Sigma = {'{...}'}</code>, <code>inicial = q0</code>, <code>F = {'{...}'}</code>.</li>
      <li>Transiciones: <code>q0, a -&gt; q1</code>. Varios destinos: <code>q0, a -&gt; q1, q2</code> (lo vuelve AFN).</li>
      <li>Transición vacía: usa <code>e</code>, <code>eps</code> o <code>ε</code> como símbolo.</li>
    </ul>
  ),
}

export default function ModeSolve() {
  const [mode, setMode] = useState<InputMode>('enunciado')
  const [text, setText] = useState(EXAMPLES.enunciado[0].text)
  const [result, setResult] = useState<SolveResult | null>(null)
  const [busy, setBusy] = useState(false)

  const run = () => {
    setBusy(true)
    setTimeout(() => {
      try {
        setResult(solve(text, mode))
      } catch (e) {
        setResult({
          ok: false,
          error: `Ocurrio un error inesperado: ${(e as Error).message}`,
          notes: [],
          interpretation: [],
          sections: [],
        })
      }
      setBusy(false)
    }, 10)
  }

  const switchMode = (m: InputMode) => {
    setMode(m)
    setText(EXAMPLES[m][0].text)
    setResult(null)
  }

  return (
    <div className="mode">
      <div className="panel no-print">
        <h2>Modo 1 · Escribe el problema</h2>
        <p className="lead">
          Describe el lenguaje y el sistema reconoce el alfabeto, el estado inicial, los finales y las cadenas que acepta;
          dibuja el autómata, lo minimiza con Brzozowski y verifica que el mínimo sea equivalente al original.
        </p>

        <div className="tabs">
          {(['enunciado', 'regex', 'formal'] as InputMode[]).map((m) => (
            <button key={m} className={'tab' + (mode === m ? ' active' : '')} onClick={() => switchMode(m)}>
              {m === 'enunciado' ? 'Enunciado en español' : m === 'regex' ? 'Expresión regular' : 'Especificación formal'}
            </button>
          ))}
        </div>

        <div className="help-box">{AYUDA[mode]}</div>

        <div className="examples">
          <span className="examples-label">Ejemplos:</span>
          {EXAMPLES[mode].map((ex) => (
            <button key={ex.label} className="chip" onClick={() => { setText(ex.text); setResult(null) }}>
              {ex.label}
            </button>
          ))}
        </div>

        <textarea
          className="input-area"
          rows={mode === 'formal' ? 12 : 3}
          value={text}
          placeholder={PLACEHOLDER[mode]}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
        />

        <div className="actions">
          <button className="btn primary" onClick={run} disabled={busy || !text.trim()}>
            {busy ? 'Resolviendo…' : 'Resolver'}
          </button>
          {result?.ok && (
            <button className="btn" onClick={() => window.print()}>
              Imprimir / Guardar PDF
            </button>
          )}
        </div>
      </div>

      {result && !result.ok && (
        <div className="panel error-panel no-print">
          <h3>No se pudo resolver</h3>
          <p>{result.error}</p>
        </div>
      )}

      {result?.ok && <SolveOutput result={result} statement={text} mode={mode} />}
    </div>
  )
}

function SolveOutput({ result, statement, mode }: { result: SolveResult; statement: string; mode: InputMode }) {
  const id = result.identification!
  return (
    <div className="output">
      <div className="panel print-header">
        <h2>Resolución del problema</h2>
        <div className="statement-box">
          <div className="statement-label">
            {mode === 'enunciado' ? 'Enunciado' : mode === 'regex' ? 'Expresión regular' : 'Especificación'}
          </div>
          <pre className="statement">{statement}</pre>
        </div>

        {result.interpretation.length > 0 && (
          <div className="interpretation">
            <h4>Cómo lo interpretó el sistema</h4>
            {result.interpretation.map((t, i) => (
              <RichText key={i} text={t} />
            ))}
          </div>
        )}
        {result.notes.map((n, i) => (
          <div key={i} className="note">{n}</div>
        ))}
      </div>

      <div className="panel">
        <h3>Reconocimiento del autómata</h3>
        <div className="ident-grid">
          <div className="ident-card">
            <span className="ident-key">Alfabeto Σ</span>
            <span className="ident-val">{'{' + id.alphabet.join(', ') + '}'}</span>
          </div>
          <div className="ident-card">
            <span className="ident-key">Estado inicial q₀</span>
            <span className="ident-val">{id.initialLabel}</span>
          </div>
          <div className="ident-card">
            <span className="ident-key">Estados finales F</span>
            <span className="ident-val">{id.finalLabels.length ? '{' + id.finalLabels.join(', ') + '}' : '∅'}</span>
          </div>
          <div className="ident-card">
            <span className="ident-key">Tipo</span>
            <span className="ident-val">{id.type}</span>
          </div>
          <div className="ident-card">
            <span className="ident-key">Estados</span>
            <span className="ident-val">{id.stateLabels.length}</span>
          </div>
          <div className="ident-card highlight">
            <span className="ident-key">Estados del mínimo</span>
            <span className="ident-val">{result.minimal!.states.length}</span>
          </div>
        </div>

        <div className="words-grid">
          <div>
            <h4>Cadenas que acepta</h4>
            <div className="word-list accept">
              {id.accepted.map((w, i) => (
                <code key={i}>{w}</code>
              ))}
              {id.accepted.length === 0 && <em>ninguna hasta longitud 8</em>}
            </div>
          </div>
          <div>
            <h4>Cadenas que rechaza</h4>
            <div className="word-list reject">
              {id.rejected.map((w, i) => (
                <code key={i}>{w}</code>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="panel">
        <h3>Autómata inicial y autómata mínimo</h3>
        <div className="compare-grid">
          <div className="compare-card">
            <div className="mini-caption">
              Inicial · {result.initial!.states.length} estados · {id.type}
            </div>
            <AutomatonView automaton={result.initial!} minHeight={220} />
          </div>
          <div className="compare-card">
            <div className="mini-caption">AFD mínimo · {result.minimal!.states.length} estados</div>
            <AutomatonView automaton={result.minimal!} minHeight={220} />
          </div>
        </div>
        {result.verification && (
          <div className={'verdict ' + (result.verification.equivalent ? 'ok' : 'bad')}>
            {result.verification.equivalent
              ? `✓ Verificado: el mínimo acepta exactamente el mismo lenguaje (${result.initial!.states.length} → ${result.minimal!.states.length} estados).`
              : `✗ No equivalentes. Contraejemplo: "${result.verification.counterexample || 'ε'}"`}
          </div>
        )}
        <details className="formal-dump">
          <summary>Especificación formal del AFD mínimo</summary>
          <pre>{toFormal(result.minimal!)}</pre>
        </details>
      </div>

      <StringTester automaton={result.minimal!} title="Probar una cadena en el AFD mínimo" />

      <h3 className="proc-title">Procedimiento detallado</h3>
      {result.sections.map((sec) => (
        <Section key={sec.id} title={sec.title} defaultOpen={sec.id !== 'tabla'}>
          <StepsView steps={sec.steps} />
        </Section>
      ))}
    </div>
  )
}
