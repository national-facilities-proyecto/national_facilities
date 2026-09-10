import { useParams } from 'react-router-dom'
import { TicketDetail } from '../features/tickets/TicketDetail'
export default function SupervisorTicketDetailPage() {
  const { id } = useParams()
  return <TicketDetail id={Number(id)} />
}
