import { visitStatusLabels, type VisitStatus } from '../../types/models'

export function submissionMessage(status: VisitStatus) {
  if (status === 'completed')
    return {
      title: 'Trabajo finalizado',
      description: 'El trabajo se registró correctamente y está finalizado.',
    }
  if (status === 'pending_approval')
    return {
      title: 'En revisión',
      description:
        'El registro completo se envió al supervisor de National Facilities. La finalización está pendiente de revisión.',
    }
  return {
    title: 'Registro recibido',
    description: `Estado actual: ${visitStatusLabels[status]}. Consulta el registro para continuar.`,
  }
}
