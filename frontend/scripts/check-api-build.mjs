import { readdir, readFile } from 'node:fs/promises'
const files = await readdir(new URL('../dist/assets/', import.meta.url))
for (const file of files.filter((name) => name.endsWith('.js'))) {
  const content = await readFile(new URL(`../dist/assets/${file}`, import.meta.url), 'utf8')
  if (
    ['tecnico@example.test', 'Carlos Mendoza', 'nf:mock:write'].some((marker) =>
      content.includes(marker),
    )
  ) {
    throw new Error(`Fixtures de demostración encontrados en el build API: ${file}`)
  }
}
console.log('Build API verificado: no contiene los fixtures ni el repositorio mock.')
