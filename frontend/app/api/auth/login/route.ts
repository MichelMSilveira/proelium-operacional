export async function POST(request: Request) {
  const origin = process.env.PROELIUM_NEST_API_ORIGIN || 'http://localhost:4174';
  const upstream = await fetch(`${origin}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': request.headers.get('content-type') || 'application/json' },
    body: await request.text(),
    redirect: 'manual',
  });
  const headers = new Headers({ 'content-type': upstream.headers.get('content-type') || 'application/json' });
  const setCookie = upstream.headers.get('set-cookie');
  if (setCookie) headers.set('set-cookie', setCookie);
  return new Response(await upstream.text(), { status: upstream.status, headers });
}
