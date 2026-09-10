import { useParams } from 'react-router-dom'
import { VisitEditor } from '../features/checklists/VisitEditor'
export default function ChecklistExecutionPage() {
  const { id } = useParams()
  return <VisitEditor id={Number(id)} origin="checklist" />
}
