import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true })
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
  configurable: true,
  value(this: HTMLDialogElement) {
    this.setAttribute('open', '')
    this.setAttribute('aria-modal', 'true')
    this.querySelector<HTMLElement>('[autofocus],button,input,textarea')?.focus()
  },
})
Object.defineProperty(HTMLDialogElement.prototype, 'close', {
  configurable: true,
  value(this: HTMLDialogElement) {
    this.removeAttribute('open')
  },
})
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape')
    document.querySelector('dialog[open]')?.dispatchEvent(new Event('cancel', { cancelable: true }))
})
if (!URL.createObjectURL) URL.createObjectURL = () => 'blob:test'
if (!URL.revokeObjectURL) URL.revokeObjectURL = () => undefined
