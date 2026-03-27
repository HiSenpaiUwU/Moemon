import { handleRequest } from '../src/server.js';

export default async function handler(request, response) {
  const url = new URL(request.url || '/', 'http://localhost');
  if (url.searchParams.has('__moemon_path')) {
    const originalPath = url.searchParams.get('__moemon_path') || '/';
    url.searchParams.delete('__moemon_path');
    const search = url.searchParams.toString();
    request.url = `${originalPath.startsWith('/') ? originalPath : '/' + originalPath}${search ? `?${search}` : ''}`;
  }
  return handleRequest(request, response);
}
