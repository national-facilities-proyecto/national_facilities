import { LoaderCircle, MapPin } from 'lucide-react'
import logo from '../../assets/national-facilities-logo.png'

export type LoadingVariant = 'list' | 'table' | 'detail' | 'form' | 'dashboard' | 'map' | 'session'

function Skeleton({ className = '' }: { className?: string }) {
  return <span className={`nf-skeleton ${className}`} />
}

function CardPlaceholder({ detail = false }: { detail?: boolean }) {
  return (
    <div className="nf-loading-card">
      <div className="nf-loading-card__top">
        <Skeleton className="nf-skeleton--badge" />
        <Skeleton className="nf-skeleton--short" />
      </div>
      <Skeleton className="nf-skeleton--title" />
      <Skeleton className="nf-skeleton--line" />
      <Skeleton className="nf-skeleton--medium" />
      {detail && (
        <div className="nf-loading-fields">
          <Skeleton className="nf-skeleton--field" />
          <Skeleton className="nf-skeleton--field" />
        </div>
      )}
      <Skeleton className="nf-skeleton--button" />
    </div>
  )
}

function ContentPlaceholder({ variant }: { variant: LoadingVariant }) {
  if (variant === 'map')
    return (
      <div className="nf-loading-map-mark">
        <MapPin size={34} strokeWidth={1.5} />
      </div>
    )
  if (variant === 'table')
    return (
      <div className="nf-loading-table">
        <div className="nf-loading-table__row nf-loading-table__row--header">
          {[0, 1, 2].map((key) => (
            <Skeleton className="nf-skeleton--short" key={key} />
          ))}
        </div>
        {[0, 1, 2, 3].map((key) => (
          <div className="nf-loading-table__row" key={key}>
            <div className="nf-loading-table__cell">
              <Skeleton className="nf-skeleton--medium" />
              <Skeleton className="nf-skeleton--short" />
            </div>
            <Skeleton className="nf-skeleton--medium" />
            <Skeleton className="nf-skeleton--badge" />
          </div>
        ))}
      </div>
    )
  if (variant === 'dashboard')
    return (
      <>
        <div className="nf-loading-metrics">
          {[0, 1].map((key) => (
            <div className="nf-loading-card" key={key}>
              <Skeleton className="nf-skeleton--medium" />
              <Skeleton className="nf-skeleton--metric" />
              <Skeleton className="nf-skeleton--line" />
            </div>
          ))}
        </div>
        <ContentPlaceholder variant="table" />
      </>
    )
  if (variant === 'form')
    return (
      <div className="nf-loading-card">
        <Skeleton className="nf-skeleton--title" />
        <div className="nf-loading-fields">
          {[0, 1, 2, 3].map((key) => (
            <div className="nf-loading-table__cell" key={key}>
              <Skeleton className="nf-skeleton--short" />
              <Skeleton className="nf-skeleton--field" />
            </div>
          ))}
        </div>
        <Skeleton className="nf-skeleton--textarea" />
        <Skeleton className="nf-skeleton--button" />
      </div>
    )
  return (
    <>
      <div className="nf-loading-filters">
        <Skeleton className="nf-skeleton--field" />
        <Skeleton className="nf-skeleton--field" />
        <Skeleton className="nf-skeleton--button" />
      </div>
      <CardPlaceholder detail={variant === 'detail'} />
      {variant === 'list' && <CardPlaceholder />}
    </>
  )
}

export function LoadingState({
  variant = 'list',
  title = 'Cargando información',
  description = 'Un momento, estamos preparando esta vista.',
}: {
  variant?: LoadingVariant
  title?: string
  description?: string
}) {
  const status = (
    <div className="nf-loading-status" role="status" aria-live="polite" aria-atomic="true">
      <span className="nf-loading-status__icon" aria-hidden="true">
        <LoaderCircle size={21} strokeWidth={2} />
      </span>
      <div>
        <p className="nf-loading-status__title">{title}</p>
        <p className="nf-loading-status__description">{description}</p>
      </div>
    </div>
  )
  if (variant === 'session')
    return (
      <main className="auth-page">
        <section className="auth-card nf-loading-session">
          <div className="brand">
            <img
              className="brand__logo"
              src={logo}
              alt="National Facilities"
              width="250"
              height="60"
            />
          </div>
          {status}
          <div className="nf-loading-track" aria-hidden="true" />
        </section>
      </main>
    )
  return (
    <section className={`nf-loading nf-loading--${variant}`} aria-label={title}>
      {status}
      <div className="nf-loading-content" aria-hidden="true">
        <ContentPlaceholder variant={variant} />
      </div>
    </section>
  )
}
