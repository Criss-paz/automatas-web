import React from 'react'
import { Step } from '../core/types'
import AutomatonView from './AutomatonView'

/** Renderiza **negrita** y saltos de linea dentro del texto de un paso. */
export function RichText({ text }: { text: string }) {
  const blocks = text.split('\n')
  return (
    <>
      {blocks.map((line, i) => (
        <p key={i} className="rich-line">
          {line.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
            part.startsWith('**') && part.endsWith('**') ? <strong key={j}>{part.slice(2, -2)}</strong> : <span key={j}>{part}</span>,
          )}
        </p>
      ))}
    </>
  )
}

export function StepTable({ table }: { table: NonNullable<Step['table']> }) {
  return (
    <div className="table-wrap">
      <table className="step-table">
        <thead>
          <tr>
            {table.headers.map((h, i) => (
              <th key={i}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, i) => (
            <tr key={i}>
              {row.map((c, j) => (
                <td key={j} className={j === 0 ? 'first-col' : ''}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {table.caption && <div className="table-caption">{table.caption}</div>}
    </div>
  )
}

export function StepCard({ step, index }: { step: Step; index?: number }) {
  return (
    <div className="step-card">
      <h4 className="step-title">
        {index !== undefined && <span className="step-num">{index}</span>}
        {step.title}
      </h4>
      {step.body && (
        <div className="step-body">
          <RichText text={step.body} />
        </div>
      )}
      {step.bullets && step.bullets.length > 0 && (
        <ul className="step-bullets">
          {step.bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      )}
      {step.table && <StepTable table={step.table} />}
      {step.automaton && (
        <div className="step-automaton">
          <div className="mini-caption">{step.automaton.name}</div>
          <AutomatonView automaton={step.automaton} minHeight={180} />
        </div>
      )}
    </div>
  )
}

export default function StepsView({ steps, startIndex = 1 }: { steps: Step[]; startIndex?: number }) {
  return (
    <div className="steps">
      {steps.map((s, i) => (
        <StepCard key={i} step={s} index={startIndex + i} />
      ))}
    </div>
  )
}

export function Section({
  title,
  children,
  defaultOpen = true,
}: {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = React.useState(defaultOpen)
  return (
    <section className={'section' + (open ? ' open' : '')}>
      <button className="section-head" onClick={() => setOpen(!open)}>
        <span className="chev">{open ? '▾' : '▸'}</span>
        {title}
      </button>
      {open && <div className="section-body">{children}</div>}
    </section>
  )
}
