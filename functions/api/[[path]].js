import worker from '../../worker/index.js';

// Pages handles the static site; the existing API uses its Preview D1 binding.
export function onRequest({ request, env }) {
  return worker.fetch(request, env);
}
