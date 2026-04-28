export async function onRequest(context: any) {
  const API_KEY = context.env.XF_API_KEY || '0a5185249a162c22def9acde30a55001';
  const API_SECRET = context.env.XF_API_SECRET || 'ZGU1Zjg1YjlmMGI4MGE5MTJmN2QyYjgy';

  const host = 'iat-api.xfyun.cn';
  const path = '/v2/iat';
  const date = new Date().toUTCString();

  const signatureOrigin = `host: ${host}\ndate: ${date}\nGET ${path} HTTP/1.1`;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(API_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, encoder.encode(signatureOrigin));
  const sigBytes = new Uint8Array(sigBuf);
  let sigBinary = '';
  for (let i = 0; i < sigBytes.length; i++) sigBinary += String.fromCharCode(sigBytes[i]);
  const signature = btoa(sigBinary);

  const authOrigin = `api_key="${API_KEY}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`;
  const authorization = btoa(authOrigin);

  const url = `wss://${host}${path}?authorization=${encodeURIComponent(authorization)}&date=${encodeURIComponent(date)}&host=${host}`;

  return new Response(JSON.stringify({ url, appid: 'fb756a4d' }), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
