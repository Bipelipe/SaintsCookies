export async function api(path, data) {
  let response;
  try { response = await fetch(`/api${path}`, { method: data ? 'POST' : 'GET', credentials: 'same-origin', headers: data ? { 'Content-Type': 'application/json' } : {}, body: data ? JSON.stringify(data) : undefined }); }
  catch { throw new Error('Não foi possível conectar. Confira sua conexão e tente novamente.'); }
  if (!response.headers.get('Content-Type')?.includes('application/json')) throw new Error('O clube ainda não está disponível neste endereço. Tente novamente mais tarde.');
  const result = await response.json().catch(() => ({ error: 'O clube está indisponível no momento. Tente novamente mais tarde.' }));
  if (!response.ok) { const error = new Error(result.error || 'Não foi possível concluir agora.'); error.status = response.status; throw error; }
  return result;
}
