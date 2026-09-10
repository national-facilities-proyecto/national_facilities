import { render, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { useObjectUrl } from './useObjectUrl'
function Preview({ blob }: { blob?: Blob }) {
  const url = useObjectUrl(blob)
  return url ? <img src={url} alt="Evidencia" /> : null
}
it('revoca previsualizaciones al reemplazar, eliminar y desmontar', async () => {
  const create = vi
    .spyOn(URL, 'createObjectURL')
    .mockReturnValueOnce('blob:one')
    .mockReturnValueOnce('blob:two')
    .mockReturnValueOnce('blob:three')
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  const view = render(<Preview blob={new Blob(['one'])} />)
  await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
  view.rerender(<Preview blob={new Blob(['two'])} />)
  expect(revoke).toHaveBeenCalledWith('blob:one')
  view.rerender(<Preview />)
  expect(revoke).toHaveBeenCalledWith('blob:two')
  view.rerender(<Preview blob={new Blob(['three'])} />)
  view.unmount()
  expect(revoke).toHaveBeenCalledWith('blob:three')
})
