// SQL da tabela events (seção 6 da spec). Só o módulo eventos escreve nela; as outras features
// leem pelas funções reexportadas em public.ts (ou por SELECT/JOIN).
import type { DbClient, Queryable } from '../../db/pool.js';
import { EVENT_ID_PATTERN, type EventRecord, type EventStatus } from './types.js';

const COLS =
  'id, organizer_id, name, starts_at, location, capacity, price_cents, status, published_at, cancelled_at, created_at, updated_at';

export interface EventRow {
  id: string;
  organizer_id: string;
  name: string;
  starts_at: Date;
  location: string;
  capacity: number;
  price_cents: number;
  status: EventStatus;
  published_at: Date | null;
  cancelled_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

/** Dados editáveis do evento, já validados. */
export interface EventDetails {
  name: string;
  startsAt: Date;
  location: string;
  capacity: number;
  priceCents: number;
}

export function toEventRecord(row: EventRow): EventRecord {
  return {
    id: row.id,
    organizerId: row.organizer_id,
    name: row.name,
    startsAt: row.starts_at,
    location: row.location,
    capacity: row.capacity,
    priceCents: row.price_cents,
    status: row.status,
    publishedAt: row.published_at,
    cancelledAt: row.cancelled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function hasIdFormat(id: unknown): id is string {
  return typeof id === 'string' && EVENT_ID_PATTERN.test(id);
}

async function one(db: Queryable, sql: string, params: readonly unknown[]): Promise<EventRecord | null> {
  const { rows } = await db.query<EventRow>(sql, [...params]);
  const row = rows[0];
  return row === undefined ? null : toEventRecord(row);
}

async function many(db: Queryable, sql: string, params: readonly unknown[]): Promise<EventRecord[]> {
  const { rows } = await db.query<EventRow>(sql, [...params]);
  return rows.map(toEventRecord);
}

export async function insertEvent(db: Queryable, id: string, organizerId: string, details: EventDetails): Promise<EventRecord> {
  const event = await one(
    db,
    `INSERT INTO events (id, organizer_id, name, starts_at, location, capacity, price_cents)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${COLS}`,
    [id, organizerId, details.name, details.startsAt, details.location, details.capacity, details.priceCents],
  );
  if (event === null) throw new Error('eventos: INSERT não devolveu a linha criada');
  return event;
}

/** Qualquer status e qualquer dono; null se não existir ou se o id não tiver o formato evt_…. */
export async function findEventById(db: Queryable, id: string): Promise<EventRecord | null> {
  if (!hasIdFormat(id)) return null;
  return one(db, `SELECT ${COLS} FROM events WHERE id = $1`, [id]);
}

/** Uma consulta (id = ANY); ids ausentes não entram no mapa. */
export async function findEventsByIds(db: Queryable, ids: readonly string[]): Promise<Map<string, EventRecord>> {
  const wanted = [...new Set(ids.filter(hasIdFormat))];
  const result = new Map<string, EventRecord>();
  if (wanted.length === 0) return result;
  for (const event of await many(db, `SELECT ${COLS} FROM events WHERE id = ANY($1::text[])`, [wanted])) {
    result.set(event.id, event);
  }
  return result;
}

/** Evento do organizador: id E dono na mesma consulta (alheio = inexistente). */
export async function findOwnedEvent(db: Queryable, id: string, organizerId: string): Promise<EventRecord | null> {
  if (!hasIdFormat(id)) return null;
  return one(db, `SELECT ${COLS} FROM events WHERE id = $1 AND organizer_id = $2`, [id, organizerId]);
}

/** SELECT … FOR UPDATE da linha do evento; segura a trava até o fim da transação do client. */
export async function lockEventForUpdate(client: DbClient, id: string): Promise<EventRecord | null> {
  if (!hasIdFormat(id)) return null;
  return one(client, `SELECT ${COLS} FROM events WHERE id = $1 FOR UPDATE`, [id]);
}

export async function lockOwnedEventForUpdate(client: DbClient, id: string, organizerId: string): Promise<EventRecord | null> {
  if (!hasIdFormat(id)) return null;
  return one(client, `SELECT ${COLS} FROM events WHERE id = $1 AND organizer_id = $2 FOR UPDATE`, [id, organizerId]);
}

export async function listEventsByOrganizer(db: Queryable, organizerId: string): Promise<EventRecord[]> {
  return many(db, `SELECT ${COLS} FROM events WHERE organizer_id = $1 ORDER BY starts_at, created_at, id`, [organizerId]);
}

/** Eventos à venda: publicados (portanto não cancelados), de todos os organizadores, por data. */
export async function listEventsOnSale(db: Queryable): Promise<EventRecord[]> {
  return many(db, `SELECT ${COLS} FROM events WHERE status = 'publicado' ORDER BY starts_at, id`, []);
}

export async function updateEventDetails(db: Queryable, id: string, details: EventDetails): Promise<EventRecord | null> {
  return one(
    db,
    `UPDATE events
        SET name = $2, starts_at = $3, location = $4, capacity = $5, price_cents = $6, updated_at = now()
      WHERE id = $1 AND status IN ('rascunho', 'publicado')
      RETURNING ${COLS}`,
    [id, details.name, details.startsAt, details.location, details.capacity, details.priceCents],
  );
}

export async function markPublished(db: Queryable, id: string): Promise<EventRecord | null> {
  return one(
    db,
    `UPDATE events SET status = 'publicado', published_at = now(), updated_at = now()
      WHERE id = $1 AND status = 'rascunho'
      RETURNING ${COLS}`,
    [id],
  );
}

export async function markCancelled(db: Queryable, id: string): Promise<EventRecord | null> {
  return one(
    db,
    `UPDATE events SET status = 'cancelado', cancelled_at = now(), updated_at = now()
      WHERE id = $1 AND status = 'publicado'
      RETURNING ${COLS}`,
    [id],
  );
}
