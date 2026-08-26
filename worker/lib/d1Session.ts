/**
 * Public payment reads must see a token the moment it is written from the
 * admin hostname. D1 replicas can lag; first-primary avoids a 1–2 minute
 * "link unavailable" window after create/send.
 */
export function consistentDb(db: D1Database): D1Database {
  if (typeof db.withSession === 'function') {
    return db.withSession('first-primary') as unknown as D1Database
  }
  return db
}
