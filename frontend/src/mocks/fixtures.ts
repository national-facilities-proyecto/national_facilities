import type { Contract, Client, Store, Template, Ticket, User, Visit } from '../types/models'
import { dayOffset, localDate } from '../utils/dates'
export type MockDatabase = {
  version: 1
  users: User[]
  stores: Store[]
  clients: Client[]
  contracts: Contract[]
  templates: Template[]
  visits: Visit[]
  tickets: Ticket[]
}
export function createFixtures(): MockDatabase {
  const users: User[] = [
    {
      id: 1,
      name: 'Carlos Mendoza',
      email: 'tecnico@example.test',
      role: 'technician',
      storeIds: [1, 2],
      active: true,
      passwordInitialized: false,
    },
    {
      id: 2,
      name: 'Roberto Sánchez',
      email: 'tienda@example.test',
      role: 'store_supervisor',
      storeIds: [1],
      active: true,
      passwordInitialized: true,
    },
    {
      id: 3,
      name: 'Cesar Orejuela',
      email: 'cuenta@example.test',
      role: 'account_supervisor',
      storeIds: [1, 2],
      active: true,
      passwordInitialized: true,
    },
    {
      id: 4,
      name: 'Administración NF',
      email: 'admin@example.test',
      role: 'administrator',
      storeIds: [1, 2],
      active: true,
      passwordInitialized: true,
    },
    {
      id: 5,
      name: 'Ana García',
      email: 'tecnica@example.test',
      role: 'technician',
      storeIds: [1, 2],
      active: true,
      passwordInitialized: true,
    },
    {
      id: 6,
      name: 'María Torres',
      email: 'tienda2@example.test',
      role: 'store_supervisor',
      storeIds: [2],
      active: true,
      passwordInitialized: true,
    },
  ]
  const stores: Store[] = [
    {
      id: 1,
      name: 'MASS - Los Faisanes',
      address: 'Av. Los Faisanes, Chorrillos, Lima',
      latitude: -12.1739,
      longitude: -77.0181,
      clientId: 1,
      contact: 'Roberto Sánchez',
      active: true,
    },
    {
      id: 2,
      name: 'MASS - Vargas Machuca',
      address: 'Av. Ramón Vargas Machuca 340, San Juan de Miraflores, Lima',
      latitude: -12.1504,
      longitude: -76.9718,
      clientId: 1,
      contact: 'María Torres',
      active: true,
    },
  ]
  const templates: Template[] = [
    {
      id: 1,
      name: 'Mantenimiento preventivo mensual',
      version: 1,
      active: true,
      tasks: [
        {
          id: 1,
          title: 'Inspección general del equipo climatizador',
          photoRequired: true,
          active: true,
          order: 1,
        },
        {
          id: 2,
          title: 'Revisión y limpieza profunda de filtros',
          photoRequired: true,
          active: true,
          order: 2,
        },
        {
          id: 3,
          title: 'Verificación de temperatura y presiones del gas',
          photoRequired: false,
          active: true,
          order: 3,
        },
        {
          id: 4,
          title: 'Registro fotográfico de entrada y salida',
          photoRequired: true,
          active: true,
          order: 4,
        },
      ],
    },
  ]
  const visits: Visit[] = stores.map((store) => ({
    id: store.id,
    storeId: store.id,
    origin: 'checklist',
    scheduledAt: dayOffset(0),
    status: 'available',
    tasks: structuredClone(templates[0].tasks),
    answers: [],
    evidenceIds: [],
    workDescription: '',
    radiusMeters: 100,
    timeLimitSeconds: 300,
    timeLimitExceeded: false,
  }))
  const tickets: Ticket[] = [-2, 0, 2].map((offset, index) => ({
    id: 101 + index,
    storeId: index === 2 ? 2 : 1,
    reporterId: index === 2 ? 6 : 2,
    category: index === 1 ? 'Eléctrico' : 'Climatización',
    priority: index === 2 ? 'Baja' : 'Alta',
    description:
      index === 1
        ? 'Luminarias intermitentes en el área de cajas.'
        : 'El equipo de climatización no enfría correctamente.',
    status: 'scheduled',
    createdAt: dayOffset(-4),
    technicianId: 1,
    scheduledAt: dayOffset(offset),
    evidenceIds: [],
    technicalEvidenceIds: [],
    history: [
      {
        id: `seed-${index}`,
        at: dayOffset(-3),
        actorId: 3,
        text: 'Visita asignada al técnico y programada.',
      },
    ],
  }))
  tickets.push({
    id: 104,
    storeId: 1,
    reporterId: 2,
    category: 'Plomería',
    priority: 'Media',
    description: 'Fuga de agua en los servicios higiénicos.',
    status: 'open',
    createdAt: dayOffset(0),
    evidenceIds: [],
    technicalEvidenceIds: [],
    history: [{ id: 'seed-new', at: dayOffset(0), actorId: 2, text: 'Incidencia reportada.' }],
  })
  for (const ticket of tickets.filter((item) => item.technicianId))
    visits.push({
      id: ticket.id,
      ticketId: ticket.id,
      storeId: ticket.storeId,
      origin: 'ticket',
      technicianId: ticket.technicianId,
      scheduledAt: ticket.scheduledAt!,
      status: 'claimed',
      tasks: [],
      answers: [],
      workDescription: '',
      evidenceIds: [],
      radiusMeters: 100,
    })
  return {
    version: 1,
    users,
    stores,
    templates,
    visits,
    tickets,
    clients: [
      {
        id: 1,
        name: 'Tiendas MASS (demostración)',
        taxId: '00000000000',
        email: 'contacto@example.test',
      },
    ],
    contracts: [
      {
        id: 1,
        clientId: 1,
        templateId: 1,
        startDate: `${localDate().slice(0, 7)}-01`,
        endDate: '',
        monthlyVisits: 1,
        monthlyInterventions: 2,
        radiusMeters: 100,
        active: true,
      },
    ],
  }
}
