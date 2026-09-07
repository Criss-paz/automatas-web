import React, { useState } from 'react'
import { InputMode, solve, SolveResult } from '../core/solver'
import StepsView, { RichText, Section, StepCard } from './StepsView'
import AutomatonView from './AutomatonView'
import StringTester from './StringTester'
import { toFormal } from '../core/formal'

const EXAMPLES: Record<InputMode, Array<{ label: string; text: string }>> = {
  enunciado: [
    { label: 'El penúltimo símbolo es a (AFN)', text: 'Cadenas sobre {a,b} donde el penúltimo símbolo sea a' },
    { label: 'Acepta únicamente la cadena a', text: 'Un AFD sobre {a,b} que acepte únicamente a' },
    { label: 'Empieza con a y termina en b', text: 'Cadenas sobre {a,b} que empiecen con a y terminen en b' },
    { label: 'Empieza con a o termina en b', text: 'Cadenas sobre {a,b} que empiecen con a o terminen en b' },
    { label: 'Número par de a', text: 'Cadenas sobre {a,b} con número par de a' },
    { label: 'No contienen aa ni bb', text: 'Cadenas sobre {a,b} que no contengan aa ni bb' },
    { label: 'Longitud entre 2 y 4', text: 'Cadenas sobre {a,b} de longitud entre 2 y 4' },
    { label: 'Solo las cadenas a, ab y ba', text: 'Sobre {a,b}, que acepte únicamente las cadenas a, ab y ba' },
    { label: 'El tercer símbolo es b', text: 'Cadenas sobre {a,b} donde el tercer símbolo sea b' },
    { label: 'Empieza y termina igual', text: 'Cadenas sobre {a,b} que empiecen y terminen con el mismo símbolo' },
    { label: 'Símbolos alternados', text: 'Cadenas sobre {a,b} con símbolos alternados' },
    { label: 'Binarios múltiplos de 3', text: 'Cadenas sobre {0,1} que sean múltiplos de 3' },
  ],
  regex: [
    { label: '(a|b)*abb', text: '(a|b)*abb' },
    { label: 'a*b*c*', text: 'a*b*c*' },
    { label: 'Clase [ab]', text: '[ab]*abb' },
    { label: 'Rango [0-9]', text: 'Sigma = {0,1,2,3,4,5,6,7,8,9}\n[0-9]{3}' },
    { label: 'Exactamente 3 a', text: 'a{3}' },
    { label: 'Entre 2 y 4', text: '(ab){2,4}' },
    { label: 'Cualquier símbolo .', text: 'Sigma = {a,b}\n.*a.' },
    { label: 'Complemento ~', text: 'Sigma = {a,b}\n~(a*)' },
    { label: 'Intersección &&', text: 'Sigma = {a,b}\n(.*a.*) && (.*b.*)' },
    { label: 'Diferencia −', text: 'Sigma = {a,b}\n.* - (.*aa.*)' },
    { label: 'Con ε', text: '(a|ε)(a|b)*b' },
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
      label: 'Tabla de transiciones',
      text: `δ    | a  | b
->q0 | q0 | q1
*q1  | q0 | q1`,
    },
    {
      label: 'AFN en una tabla',
      text: `δ    | a     | b
->q0 | q0,q1 | q0
q1   | -     | q2
*q2  | -     | -`,
    },
    {
      label: 'Notación δ(q,a)=p',
      text: `Sigma = {a, b}
d(q0, a) = q0
d(q0, b) = q1
d(q1, a) = q0
d(q1, b) = q1
inicial = q0
F = {q1}`,
    },
    {
      label: 'JSON',
      text: `{"alphabet":["a","b"],"initial":"q0","finals":["q1"],
 "transitions":[["q0","a","q0"],["q0","b","q1"],
                ["q1","a","q0"],["q1","b","q1"]]}`,
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
  enunciado: 'Ej.: Cadenas sobre {a,b} donde el penúltimo símbolo sea a   ·   Diseñe un AFD sobre {a,b} que acepte únicamente a',
  regex: 'Ej.: (a|b)*abb      |  *  +  ?  ( )  [ab]  [a-z]  .  {n,m}  ~  &&  −  ε  ∅',
  formal: 'Q = {q0, q1}\nSigma = {a, b}\ninicial = q0\nF = {q1}\nq0, a -> q1\n\n…o pega una tabla de transiciones, o un JSON.',
}

const AYUDA: Record<InputMode, React.ReactNode> = {
  enunciado: (
    <ul>
      <li>Declara el alfabeto con llaves: <code>sobre {'{a,b}'}</code>, o escribiendo <code>el alfabeto es a, b</code>.
        Si no lo pones, se deduce del enunciado.</li>
      <li><b>Posición y forma:</b> <b>empieza con</b> X · <b>termina en</b> X · <b>contiene</b> X ·
        <b> prefijo / sufijo</b> X · <b>el penúltimo / último / antepenúltimo símbolo es</b> X ·
        <b> el primer / tercer símbolo es</b> X · <b>en la posición n hay</b> X ·
        <b> empieza y termina con el mismo símbolo</b> · <b>símbolos alternados</b>.</li>
      <li><b>Cantidades:</b> <b>número par/impar de</b> X · <b>cantidad de X múltiplo de n</b> ·
        <b> al menos / a lo sumo / más de / menos de / exactamente n</b> X · <b>sin ninguna</b> X.</li>
      <li><b>Longitud:</b> <b>par/impar</b> · <b>múltiplo de n</b> · <b>≥ / ≤ / = n</b> ·
        <b> mayor / menor que n</b> · <b>entre n y m</b>.</li>
      <li><b>Lenguajes concretos:</b> <b>acepte únicamente a</b> · <b>solo las cadenas a, ab y ba</b> ·
        <b> solo la cadena vacía</b> · <b>formadas únicamente por</b> a · <b>múltiplos de k</b> (número en base |Σ|).</li>
      <li><b>Cómo se combinan:</b> <b>y</b> / <b>,</b> / <b>además</b> / <b>ni</b> → intersección ·
        <b> o</b> → unión · <b>no</b> / <b>sin</b> / <b>excepto</b> → complemento. Puedes mezclarlas.</li>
      <li>Puedes escribirlo como en clase (<i>«Diseñe un AFD que...»</i>): la parte del enunciado que habla del
        ejercicio se ignora. Si el lenguaje <b>no es regular</b> (aⁿbⁿ, palíndromos, igual número de a que de b),
        se te explica por qué ningún autómata finito puede reconocerlo.</li>
    </ul>
  ),
  regex: (
    <ul>
      <li><b>Básicos:</b> <code>|</code> unión · <code>*</code> cero o más · <code>+</code> una o más ·
        <code>?</code> opcional · <code>( )</code> agrupación. La concatenación es implícita: <code>ab</code> es a seguido de b.</li>
      <li><b>Clases:</b> <code>[abc]</code> uno de esos · <code>[a-z]</code> rango · <code>[^ab]</code> cualquiera
        menos esos · <code>.</code> cualquier símbolo de Σ.</li>
      <li><b>Repetición contada:</b> <code>a{'{3}'}</code> exactamente 3 · <code>a{'{2,4}'}</code> entre 2 y 4 ·
        <code>a{'{2,}'}</code> 2 o más.</li>
      <li><b>Operaciones de conjuntos:</b> <code>~E</code> complemento · <code>E &amp;&amp; F</code> intersección ·
        <code>E - F</code> diferencia. No amplían lo que se puede expresar, pero ahorran mucho trabajo.</li>
      <li><b>Constantes y escapes:</b> <code>ε</code>, <code>λ</code> o <code>&amp;</code> = cadena vacía ·
        <code>∅</code> = lenguaje vacío · <code>\*</code> convierte cualquier operador en símbolo normal ·
        <code>"ab"</code> es un símbolo de varias letras.</li>
      <li><b>Alfabeto:</b> hace falta declararlo para <code>.</code>, <code>[^…]</code> y <code>~</code>. Escribe una
        primera línea <code>Sigma = {'{a,b}'}</code> y debajo la expresión.</li>
      <li>Los operadores clásicos se construyen con <b>Thompson</b>; en <code>~</code>, <code>&amp;&amp;</code> y
        <code>-</code> se determiniza y se aplica la operación booleana, y se explica en el procedimiento.</li>
    </ul>
  ),
  formal: (
    <ul>
      <li><b>Por líneas</b> (en cualquier orden): <code>Q = {'{...}'}</code>, <code>Sigma = {'{...}'}</code>,{' '}
        <code>inicial = q0</code>, <code>F = {'{...}'}</code>.</li>
      <li><b>Transiciones</b> en el estilo que prefieras: <code>q0, a -&gt; q1</code> · <code>q0 -a-&gt; q1</code> ·
        <code>δ(q0,a) = q1</code> · <code>q0 -&gt; q1 [a]</code> · <code>q0 a q1</code>.</li>
      <li>Varios símbolos: <code>q0, a|b -&gt; q1</code>. Varios destinos (lo vuelve AFN):{' '}
        <code>q0, a -&gt; q1, q2</code>. Sin destino: <code>q0, a -&gt; -</code>.</li>
      <li><b>Tabla de transiciones</b>: primera fila los símbolos, primera columna los estados.
        Marca <code>-&gt;q0</code> el inicial y <code>*q1</code> los finales. Admite bordes estilo markdown.</li>
      <li><b>JSON</b>: <code>{'{"initial":"q0","finals":["q1"],"transitions":[["q0","a","q1"]]}'}</code>.</li>
      <li>Transición vacía: <code>e</code>, <code>eps</code>, <code>lambda</code> o <code>ε</code>. Los símbolos pueden
        tener varias letras (<code>id</code>, <code>num</code>) y ser mayúsculas, dígitos o signos.</li>
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
