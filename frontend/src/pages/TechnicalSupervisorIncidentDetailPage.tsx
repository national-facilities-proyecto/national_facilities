import { useParams } from 'react-router-dom'
import { TicketDetail } from '../features/tickets/TicketDetail'
export default function TechnicalSupervisorIncidentDetailPage() {
  const { id } = useParams()
  return <TicketDetail id={Number(id)} account />
}
