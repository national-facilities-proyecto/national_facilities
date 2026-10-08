export function auditPerson(id?: number, name?: string, missing = 'Sin registrar'): string {
  if (id === undefined) return missing
  return name?.trim() ? `${name.trim()} (ID #${id})` : `Usuario #${id}`
}
