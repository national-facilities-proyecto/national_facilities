export function VisitStages({ current }: { current: 1 | 2 | 3 }) {
  return (
    <ol className="nf-stages" aria-label="Etapas del trabajo">
      {['Llegada', 'Recorrido', 'Resultados'].map((label, index) => (
        <li key={label} aria-current={index + 1 === current ? 'step' : undefined}>
          <span aria-hidden="true">{index + 1}</span>
          {label}
        </li>
      ))}
    </ol>
  )
}
