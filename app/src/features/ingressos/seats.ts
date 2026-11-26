// Vagas (R05): ocupadas = pending + confirmed; disponíveis = lotação − ocupadas (0 em evento
// cancelado). Leituras sem trava (valor do instante); a compra conta sob a trava do evento.
import type { Queryable } from '../../db/pool.js';
import { isEventId, type EventRecord, type EventStatus } from '../eventos/public.js';
import type { SeatAvailability } from './types.js';

/** pending + confirmed do evento. É também o provedor de vagas registrado na F04. */
export async function countOccupiedSeats(db: Queryable, eventId: string): Promise<number> {
  const { rows } = await db.query<{ occupied: number }>(
    "SELECT count(*) AS occupied FROM tickets WHERE event_id = $1 AND status IN ('pending', 'confirmed')",
    [eventId],
  );
  return Number(rows[0]?.occupied ?? 0);
}

/** Uma consulta agrupada; ids sem ingresso ocupando vaga → 0 no mapa. */
export async function countOccupiedSeatsByEvent(db: Queryable, eventIds: readonly string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  const ids = [...new Set(eventIds.filter((id): id is string => typeof id === 'string'))];
  for (const id of ids) result.set(id, 0);
  if (ids.length === 0) return result;
  const { rows } = await db.query<{ event_id: string; occupied: number }>(
    `SELECT event_id, count(*) AS occupied FROM tickets
      WHERE event_id = ANY($1::text[]) AND status IN ('pending', 'confirmed')
      GROUP BY event_id`,
    [ids],
  );
  for (const row of rows) result.set(row.event_id, Number(row.occupied));
  return result;
}

/** cancelado → 0; senão max(0, capacity − occupied) (em rascunho, a lotação). */
export function computeAvailableSeats(event: Pick<EventRecord, 'capacity' | 'status'>, occupied: number): number {
  if (event.status === 'cancelado') return 0;
  return Math.max(0, event.capacity - occupied);
}

function availability(eventId: string, status: EventStatus, capacity: number, occupied: number): SeatAvailability {
  return { eventId, eventStatus: status, capacity, occupied, available: computeAvailableSeats({ capacity, status }, occupied) };
}

/** Evento + ocupadas numa consulta; null se o evento não existir (ou id fora do formato). */
export async function getSeatAvailability(db: Queryable, eventId: string): Promise<SeatAvailability | null> {
  if (!isEventId(eventId)) return null;
  const { rows } = await db.query<{ id: string; status: EventStatus; capacity: number; occupied: number }>(
    `SELECT e.id, e.status, e.capacity,
            (SELECT count(*) FROM tickets t WHERE t.event_id = e.id AND t.status IN ('pending', 'confirmed')) AS occupied
       FROM events e WHERE e.id = $1`,
    [eventId],
  );
  const row = rows[0];
  return row === undefined ? null : availability(row.id, row.status, row.capacity, Number(row.occupied));
}

/** Para listas (vitrine, API): uma consulta de ocupadas para todos os eventos dados. */
export async function getSeatAvailabilityForEvents(
  db: Queryable,
  events: readonly Pick<EventRecord, 'id' | 'capacity' | 'status'>[],
): Promise<Map<string, SeatAvailability>> {
  const occupied = await countOccupiedSeatsByEvent(
    db,
    events.map((event) => event.id),
  );
  const result = new Map<string, SeatAvailability>();
  for (const event of events) {
    result.set(event.id, availability(event.id, event.status, event.capacity, occupied.get(event.id) ?? 0));
  }
  return result;
}
