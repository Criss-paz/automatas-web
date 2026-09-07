import React, { useCallback, useMemo, useRef, useState } from 'react'
import { Automaton, EPSILON, State, Step } from '../core/types'
import { uid, inferAlphabet, isDeterministic, determinismReport, transitionTable, hasEpsilon } from '../core/automaton'
import { nfaToDfaFull, brzozowski } from '../core/algorithms/brzozowski'
import { minimizeTableFilling } from '../core/algorithms/minimize'
import { checkEquivalence, bruteForceCompare } from '../core/algorithms/equivalence'
import { typeOf } from '../core/solver'
import AutomatonView from './AutomatonView'
import StepsView, { Section, StepCard } from './StepsView'
import StringTester from './StringTester'
import { toFormal } from '../core/formal'

const W = 940
const H = 520

type Tool = 'select' | 'state' | 'transition' | 'initial' | 'final' | 'delete'

const TOOLS: Array<{ id: Tool; icon: string; label: string; hint: string }> = [
  { id: 'select', icon: '➤', label: 'Seleccionar / mover', hint: 'Arrastra los estados para acomodarlos. Haz clic en uno para renombrarlo.' },
  { id: 'state', icon: '◯', label: 'Nuevo estado', hint: 'Haz clic en el lienzo para colocar un estado.' },
  { id: 'transition', icon: '→', label: 'Transición', hint: 'Clic en el estado de origen y luego en el de destino. El símbolo es el que esté activo abajo.' },
  { id: 'initial', icon: '▷', label: 'Marcar inicial', hint: 'Haz clic en el estado que será el inicial.' },
  { id: 'final', icon: '◎', label: 'Marcar final', hint: 'Haz clic en un estado para ponerle o quitarle el doble círculo.' },
  { id: 'delete', icon: '✕', label: 'Borrar', hint: 'Haz clic en un estado o en una flecha para eliminarlo.' },
]

const emptyDrawing = (name: string): Automaton => ({ name, alphabet: ['a', 'b'], states: [], transitions: [] })

export default function Editor() {
  const [autos, setAutos] = useState<{ A: Automaton; B: Automaton }>({
    A: emptyDrawing('Autómata A'),
    B: emptyDrawing('Autómata B'),
  })
  const [active, setActive] = useState<'A' | 'B'>('A')
  const [showB, setShowB] = useState(false)
  const [tool, setTool] = useState<Tool>('state')
  const [symbol, setSymbol] = useState('a')
  const [selected, setSelected] = useState<string | null>(null)
  const [pending, setPending] = useState<{ from: string; x: number; y: number } | null>(null)
  const drag = useRef<{ id: string; dx: number; dy: number; moved: boolean } | null>(null)
  const [output, setOutput] = useState<{ title: string; steps: Step[]; result?: Automaton } | null>(null)

  const a = autos[active]
  const setA = useCallback(
    (updater: (prev: Automaton) => Automaton) => {
      setAutos((prev) => ({ ...prev, [active]: updater(prev[active]) }))
    },
    [active],
  )

  const alphabet = useMemo(() => inferAlphabet(a), [a])
  const type = useMemo(() => (a.states.length ? typeOf({ ...a, alphabet }) : null), [a, alphabet])

  // ---------------- edicion del lienzo ------------------------------------
  const addState = (x: number, y: number) => {
    setA((prev) => {
      const n = prev.states.length
      const s: State = {
        id: uid('u'),
        label: `q${n}`,
        x: Math.round(x),
        y: Math.round(y),
        isInitial: n === 0,
        isFinal: false,
      }
      return { ...prev, states: [...prev.states, s] }
    })
    setOutput(null)
  }

  const onCanvasMouseDown = (x: number, y: number, e: React.MouseEvent) => {
    if ((e.target as Element).closest('.state')) return
    if (tool === 'state') addState(x, y)
    else {
      setSelected(null)
      setPending(null)
    }
  }

  const onCanvasMouseMove = (x: number, y: number) => {
    if (drag.current) {
      const d = drag.current
      d.moved = true
      setA((prev) => ({
        ...prev,
        states: prev.states.map((s) => (s.id === d.id ? { ...s, x: Math.round(x - d.dx), y: Math.round(y - d.dy) } : s)),
      }))
    } else if (pending) {
      setPending({ ...pending, x, y })
    }
  }

  const onCanvasMouseUp = () => {
    drag.current = null
  }

  const onStateMouseDown = (id: string, e: React.MouseEvent) => {
    if (tool !== 'select') return
    const s = a.states.find((q) => q.id === id)!
    const svg = (e.currentTarget as SVGGElement).ownerSVGElement!
    const rect = svg.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * W
    const y = ((e.clientY - rect.top) / rect.height) * H
    drag.current = { id, dx: x - s.x, dy: y - s.y, moved: false }
  }

  const onStateClick = (id: string) => {
    setOutput(null)
    if (tool === 'select') {
      setSelected(id)
      return
    }
    if (tool === 'initial') {
      setA((prev) => ({ ...prev, states: prev.states.map((s) => ({ ...s, isInitial: s.id === id })) }))
      return
    }
    if (tool === 'final') {
      setA((prev) => ({ ...prev, states: prev.states.map((s) => (s.id === id ? { ...s, isFinal: !s.isFinal } : s)) }))
      return
    }
    if (tool === 'delete') {
      setA((prev) => ({
        ...prev,
        states: prev.states.filter((s) => s.id !== id),
        transitions: prev.transitions.filter((t) => t.from !== id && t.to !== id),
      }))
      setSelected(null)
      return
    }
    if (tool === 'transition') {
      if (!pending) {
        const s = a.states.find((q) => q.id === id)!
        setPending({ from: id, x: s.x, y: s.y })
      } else {
        const sym = symbol.trim() === '' ? EPSILON : symbol.trim()
        setA((prev) => {
          const exists = prev.transitions.some((t) => t.from === pending.from && t.to === id && t.symbol === sym)
          if (exists) return prev
          return {
            ...prev,
            alphabet: sym === EPSILON || prev.alphabet.includes(sym) ? prev.alphabet : [...prev.alphabet, sym].sort(),
            transitions: [...prev.transitions, { id: uid('t'), from: pending.from, to: id, symbol: sym }],
          }
        })
        setPending(null)
      }
    }
  }

  const onTransitionClick = (id: string) => {
    if (tool === 'delete') {
      setA((prev) => ({ ...prev, transitions: prev.transitions.filter((t) => t.id !== id) }))
      setOutput(null)
    }
  }

  const renameSelected = (label: string) => {
    setA((prev) => ({ ...prev, states: prev.states.map((s) => (s.id === selected ? { ...s, label } : s)) }))
  }

  const clearCanvas = () => {
    setA(() => emptyDrawing(active === 'A' ? 'Autómata A' : 'Autómata B'))
    setSelected(null)
    setPending(null)
    setOutput(null)
  }

  const addSymbol = (s: string) => {
    const sym = s.trim()
    if (!sym || sym.length > 3) return
    setA((prev) => ({ ...prev, alphabet: prev.alphabet.includes(sym) ? prev.alphabet : [...prev.alphabet, sym].sort() }))
    setSymbol(sym)
  }

  const removeSymbol = (s: string) => {
    setA((prev) => ({
      ...prev,
      alphabet: prev.alphabet.filter((x) => x !== s),
      transitions: prev.transitions.filter((t) => t.symbol !== s),
    }))
  }

  // ---------------- acciones sobre el automata dibujado -------------------
  const withAlphabet = (x: Automaton): Automaton => ({ ...x, alphabet: inferAlphabet(x) })

  const validation = (x: Automaton): string | null => {
    if (x.states.length === 0) return 'Dibuja al menos un estado.'
    if (!x.states.some((s) => s.isInitial)) return 'Marca un estado inicial con la herramienta ▷.'
    if (!x.states.some((s) => s.isFinal)) return 'Marca al menos un estado final con la herramienta ◎.'
    return null
  }

  const doConvert = () => {
    const err = validation(a)
    if (err) return alert(err)
    const res = nfaToDfaFull(withAlphabet(a))
    const eq = checkEquivalence(withAlphabet(a), res.minimal, ['AFN dibujado', 'AFD mínimo'])
    setOutput({
      title: 'Conversión AFN → AFD y minimización',
      steps: [
        {
          title: 'Punto de partida',
          body:
            `El autómata dibujado es un **${typeOf(withAlphabet(a))}**. ` +
            (hasEpsilon(a)
              ? `Tiene transiciones ${EPSILON}, que se eliminan aplicando la **clausura-ε** dentro de la construcción de subconjuntos.`
              : `No tiene transiciones ${EPSILON}, pero sí no determinismo (más de un destino con el mismo símbolo).`),
          bullets: determinismReport(withAlphabet(a)),
        },
        ...res.steps,
        ...eq.steps,
        {
          title: eq.equivalent ? 'Verificación superada ✓' : 'Verificación fallida ✗',
          body: eq.equivalent
            ? `El AFD mínimo acepta exactamente el mismo lenguaje que el AFN dibujado.`
            : `Se encontró el contraejemplo "${eq.counterexample?.word || 'ε'}".`,
          automaton: res.minimal,
        },
      ],
      result: res.minimal,
    })
  }

  const doMinimize = () => {
    const err = validation(a)
    if (err) return alert(err)
    const src = withAlphabet(a)
    const brz = brzozowski(src, { finalName: 'AFD mínimo' })
    const tf = minimizeTableFilling(src)
    const eq = checkEquivalence(src, brz.automaton, ['AFD dibujado', 'AFD mínimo'])
    const bf = bruteForceCompare(src, brz.automaton, 7)
    setOutput({
      title: 'Minimización del AFD',
      steps: [
        ...brz.steps,
        { title: '— Contraste con el método de la tabla de estados distinguibles —' },
        ...tf.steps,
        ...eq.steps,
        {
          title: 'Prueba adicional por fuerza bruta',
          body: `Se probaron ${bf.tested} cadenas hasta longitud 7 en ambos autómatas: ${
            bf.mismatches.length === 0 ? 'ninguna discrepancia.' : `${bf.mismatches.length} discrepancias.`
          }`,
          table: {
            caption: 'Primeras cadenas probadas',
            headers: ['Cadena', 'AFD dibujado', 'AFD mínimo', '¿Coinciden?'],
            rows: bf.rows,
          },
        },
        {
          title: eq.equivalent && bf.mismatches.length === 0 ? 'Verificación superada ✓' : 'Verificación fallida ✗',
          body: `Estados: ${src.states.length} → ${brz.automaton.states.length} por Brzozowski, ${tf.automaton.states.length} por la tabla.`,
          automaton: brz.automaton,
        },
      ],
      result: brz.automaton,
    })
  }

  const doCompare = () => {
    const e1 = validation(autos.A)
    const e2 = validation(autos.B)
    if (e1) return alert(`Autómata A: ${e1}`)
    if (e2) return alert(`Autómata B: ${e2}`)
    const A = withAlphabet(autos.A)
    const B = withAlphabet(autos.B)
    const eq = checkEquivalence(A, B, ['Autómata A', 'Autómata B'])
    const bf = bruteForceCompare(A, B, 7)
    const mA = brzozowski(A).automaton
    const mB = brzozowski(B).automaton
    setOutput({
      title: 'Comparación de equivalencia entre A y B',
      steps: [
        {
          title: 'Qué se va a comparar',
          body: `Se comprueba si **L(A) = L(B)**, es decir, si los dos autómatas aceptan exactamente el mismo conjunto de cadenas.`,
          table: {
            caption: 'Resumen',
            headers: ['', 'Autómata A', 'Autómata B'],
            rows: [
              ['Tipo', typeOf(A), typeOf(B)],
              ['Estados', String(A.states.length), String(B.states.length)],
              ['Alfabeto', '{' + A.alphabet.join(', ') + '}', '{' + B.alphabet.join(', ') + '}'],
            ],
          },
        },
        ...eq.steps,
        {
          title: 'Comprobación por fuerza bruta',
          body: `Se probaron ${bf.tested} cadenas hasta longitud 7: ${
            bf.mismatches.length === 0
              ? 'todas obtuvieron el mismo veredicto en ambos autómatas.'
              : `${bf.mismatches.length} obtuvieron veredictos distintos (la primera: "${bf.mismatches[0].word || 'ε'}").`
          }`,
          table: {
            caption: 'Primeras cadenas probadas',
            headers: ['Cadena', 'Autómata A', 'Autómata B', '¿Coinciden?'],
            rows: bf.rows,
          },
        },
        {
          title: 'Comprobación por autómatas mínimos',
          body:
            `Dos AFD son equivalentes si y solo si sus AFD mínimos son iguales salvo el nombre de los estados (Myhill-Nerode). ` +
            `El mínimo de A tiene **${mA.states.length}** estados y el de B tiene **${mB.states.length}**. ` +
            (mA.states.length === mB.states.length
              ? 'Coinciden, lo que respalda el resultado anterior.'
              : 'No coinciden, así que los lenguajes son necesariamente distintos.'),
        },
        {
          title: eq.equivalent ? 'CONCLUSIÓN: A y B SÍ son equivalentes ✓' : 'CONCLUSIÓN: A y B NO son equivalentes ✗',
          body: eq.equivalent
            ? 'No existe ninguna cadena que uno acepte y el otro rechace.'
            : `La cadena "${eq.counterexample?.word || 'ε'}" la acepta ${eq.counterexample?.acceptedBy} y la rechaza ${eq.counterexample?.rejectedBy}.`,
        },
      ],
    })
  }

  const activeTool = TOOLS.find((t) => t.id === tool)!

  return (
    <div className="mode">
      <div className="panel no-print">
        <h2>Modo 2 · Dibuja el autómata</h2>
        <p className="lead">
          Coloca estados, márcalos como inicial o final y traza las flechas con el símbolo que quieras, incluida la
          transición vacía ε. Cuando termines, el sistema detecta si es AFD o AFN y te pregunta qué hacer con él.
        </p>

        <div className="canvas-tabs">
          <button className={'tab' + (active === 'A' ? ' active' : '')} onClick={() => { setActive('A'); setOutput(null) }}>
            Autómata A
          </button>
          {showB ? (
            <button className={'tab' + (active === 'B' ? ' active' : '')} onClick={() => { setActive('B'); setOutput(null) }}>
              Autómata B
            </button>
          ) : (
            <button className="tab ghost" onClick={() => { setShowB(true); setActive('B'); setOutput(null) }}>
              + Añadir autómata B (para comparar)
            </button>
          )}
        </div>

        <div className="toolbar">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              className={'tool' + (tool === t.id ? ' active' : '')}
              onClick={() => { setTool(t.id); setPending(null) }}
              title={t.hint}
            >
              <span className="tool-icon">{t.icon}</span>
              <span className="tool-label">{t.label}</span>
            </button>
          ))}
          <button className="tool danger" onClick={clearCanvas} title="Vaciar el lienzo">
            <span className="tool-icon">🗑</span>
            <span className="tool-label">Limpiar</span>
          </button>
        </div>

        <div className="tool-hint">{activeTool.hint}</div>

        <div className="symbol-bar">
          <span className="symbol-label">Símbolo de la flecha:</span>
          {a.alphabet.map((s) => (
            <span key={s} className="symbol-chip-wrap">
              <button className={'chip' + (symbol === s ? ' active' : '')} onClick={() => setSymbol(s)}>
                {s}
              </button>
              <button className="chip-x" onClick={() => removeSymbol(s)} title={`Quitar "${s}" del alfabeto`}>
                ×
              </button>
            </span>
          ))}
          <button className={'chip epsilon' + (symbol === EPSILON ? ' active' : '')} onClick={() => setSymbol(EPSILON)}>
            {EPSILON} (vacía)
          </button>
          <input
            className="symbol-input"
            placeholder="+ nuevo símbolo"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                addSymbol((e.target as HTMLInputElement).value)
                ;(e.target as HTMLInputElement).value = ''
              }
            }}
          />
        </div>

        <div className={'canvas-wrap tool-' + tool}>
          <AutomatonView
            automaton={a}
            fixedWidth={W}
            fixedHeight={H}
            selectedState={selected}
            onCanvasMouseDown={onCanvasMouseDown}
            onCanvasMouseMove={onCanvasMouseMove}
            onCanvasMouseUp={onCanvasMouseUp}
            onStateMouseDown={onStateMouseDown}
            onStateClick={onStateClick}
            onTransitionClick={onTransitionClick}
            pendingArrow={
              pending
                ? {
                    x1: a.states.find((s) => s.id === pending.from)!.x,
                    y1: a.states.find((s) => s.id === pending.from)!.y,
                    x2: pending.x,
                    y2: pending.y,
                  }
                : null
            }
          />
          {a.states.length === 0 && (
            <div className="canvas-empty">
              Elige <b>◯ Nuevo estado</b> y haz clic aquí para empezar a dibujar
            </div>
          )}
        </div>

        {selected && tool === 'select' && (
          <div className="rename-row">
            <label>Nombre del estado seleccionado:</label>
            <input value={a.states.find((s) => s.id === selected)?.label ?? ''} onChange={(e) => renameSelected(e.target.value)} />
            <button className="chip" onClick={() => setSelected(null)}>listo</button>
          </div>
        )}
      </div>

      {a.states.length > 0 && (
        <div className="panel ask-panel no-print">
          <h3>¿Qué deseas hacer con este autómata?</h3>
          <div className="detected">
            El autómata <b>{active}</b> es un <b className="type-badge">{type}</b>
            {type !== 'AFD' && (
              <ul className="reasons">
                {determinismReport(withAlphabet(a)).map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="actions">
            {type !== 'AFD' ? (
              <button className="btn primary" onClick={doConvert}>
                Convertir a AFD (clausura-ε + subconjuntos) y minimizar con Brzozowski
              </button>
            ) : (
              <button className="btn primary" onClick={doMinimize}>
                Minimizar con Brzozowski
              </button>
            )}
            <button className="btn" onClick={doCompare} disabled={!showB}>
              Comparar A y B: ¿son equivalentes?
            </button>
            {!showB && <span className="hint-inline">Añade el autómata B para poder comparar.</span>}
          </div>

          <details className="formal-dump">
            <summary>Tabla de transiciones del autómata {active}</summary>
            <TransitionTableBlock automaton={withAlphabet(a)} />
            <pre>{toFormal(withAlphabet(a))}</pre>
          </details>
        </div>
      )}

      {a.states.length > 0 && a.states.some((s) => s.isInitial) && (
        <StringTester automaton={withAlphabet(a)} title={`Probar una cadena en el autómata ${active}`} />
      )}

      {output && (
        <div className="output">
          <div className="panel">
            <div className="output-head">
              <h3>{output.title}</h3>
              <button className="btn no-print" onClick={() => window.print()}>
                Imprimir / Guardar PDF
              </button>
            </div>
            {output.result && (
              <>
                <div className="mini-caption">Resultado: {output.result.name} · {output.result.states.length} estados</div>
                <AutomatonView automaton={output.result} minHeight={240} />
                <details className="formal-dump">
                  <summary>Especificación formal del resultado</summary>
                  <pre>{toFormal(output.result)}</pre>
                </details>
              </>
            )}
          </div>
          <Section title="Procedimiento detallado">
            <StepsView steps={output.steps} />
          </Section>
          {output.result && <StringTester automaton={output.result} title="Probar una cadena en el resultado" />}
        </div>
      )}
    </div>
  )
}

function TransitionTableBlock({ automaton }: { automaton: Automaton }) {
  const t = transitionTable(automaton)
  return (
    <div className="table-wrap">
      <table className="step-table">
        <thead>
          <tr>
            {t.headers.map((h, i) => (
              <th key={i}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {t.rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className={j === 0 ? 'first-col' : ''}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="table-caption">→ inicial · * final</div>
    </div>
  )
}
