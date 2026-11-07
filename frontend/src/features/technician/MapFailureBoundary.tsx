import { Component, type ReactNode } from 'react'

export class MapFailureBoundary extends Component<
  {
    children: ReactNode
    fallback?: ReactNode
    onError?(this: void, message: string): void
  },
  { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch() {
    this.props.onError?.('No se pudo representar la cartografía simplificada.')
  }
  render() {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children
  }
}
