import { Component } from 'react'
import type { ReactNode } from 'react'
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? (
      <section className="nf-empty" role="alert">
        <h1>Ocurrió un error inesperado</h1>
        <p>No se pudo cargar esta parte de la aplicación. Tus borradores guardados se conservan.</p>
        <button className="nf-button" onClick={() => window.location.reload()}>
          Recargar y reintentar
        </button>
      </section>
    ) : (
      this.props.children
    )
  }
}
