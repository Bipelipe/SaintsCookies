export async function databaseHealth(env) {
  const bindings = Object.entries(env)
    // Service Fetchers can expose arbitrary RPC methods; they are not D1.
    .filter(([,value]) => value && typeof value.fetch !== 'function' && typeof value.prepare === 'function' && typeof value.batch === 'function' && typeof value.exec === 'function')
    .map(([name]) => name);
  const diagnostic = {
    expected_binding: 'DB',
    database_bindings: bindings,
    deployment: { branch: env.CF_PAGES_BRANCH || null, commit: env.CF_PAGES_COMMIT_SHA || null },
  };
  const db = env.DB;
  if (!bindings.includes('DB')) return {
    status: 503,
    data: { status: 'binding_missing', error: 'O banco do site ainda não foi conectado ao vínculo D1 DB.', ...diagnostic },
  };
  try {
    // Validate every runtime table without reading any customer records.
    await db.prepare(`SELECT u.id, s.token_hash, o.status, l.attempts, c.phone, w.payment_status, i.quantity, n.status
      FROM users u, sessions s, orders o, rate_limits l, customer_profiles c, checkout_orders w, checkout_items i, whatsapp_outbox n LIMIT 0`).first();
    return { status: 200, data: { status: 'ok', environment: 'test', ...diagnostic } };
  } catch (error) {
    if (String(error).includes('no such table')) return {
      status: 503,
      data: { status: 'initialization_required', error: 'O banco está conectado, mas falta executar o SQL inicial completo no Console D1.', ...diagnostic },
    };
    return { status: 500, data: { status: 'query_failed', error: 'O vínculo existe, mas a verificação do banco falhou. Consulte os logs da Function.', ...diagnostic } };
  }
}
