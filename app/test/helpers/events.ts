// Eventos de teste para qualquer feature (F05–F09): insere direto na tabela events, em qualquer
// status, com published_at e cancelled_at coerentes com o status.
import { newId, randomToken } from '../../src/core/ids.js';
import type { Queryable } from '../../src/db/pool.js';
import type { EventRecord, EventStatus } from '../../src/features/eventos/public.js';
import { toEventRecord, type EventRow } from '../../src/features/eventos/repository.js';

export interface TestEventData {
  organizerId: string;
  /** Padrão: "Evento de teste <aleatório>". */
  name?: string;
  /** Padrão: daqui a 30 dias. */
  startsAt?: Date;
  /** Padrão: "Local de teste". */
  location?: string;
  /** Padrão: 10. */
  capacity?: number;
  /** Padrão: 10000 (R$ 100,00). */
  priceCents?: number;
  /** Padrão: publicado. */
  status?: EventStatus;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export async function insertTestEvent(db: Queryable, data: TestEventData): Promise<EventRecord> {
  const status = data.status ?? 'publicado';
  const { rows } = await db.query<EventRow>(
    `INSERT INTO events (id, organizer_id, name, starts_at, location, capacity, price_cents, status,
                         published_at, cancelled_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
             CASE WHEN $8 = 'rascunho' THEN NULL ELSE now() END,
             CASE WHEN $8 = 'cancelado' THEN now() ELSE NULL END)
     RETURNING id, organizer_id, name, starts_at, location, capacity, price_cents, status, published_at,
               cancelled_at, created_at, updated_at`,
    [
      newId('evt'),
      data.organizerId,
      data.name ?? `Evento de teste ${randomToken(6)}`,
      data.startsAt ?? new Date(Date.now() + 30 * DAY_MS),
      data.location ?? 'Local de teste',
      data.capacity ?? 10,
      data.priceCents ?? 10000,
      status,
    ],
  );
  const row = rows[0];
  if (row === undefined) throw new Error('insertTestEvent: INSERT não devolveu a linha');
  return toEventRecord(row);
}
