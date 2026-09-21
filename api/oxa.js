export const config = { runtime: 'edge' };

const enc = new TextEncoder();
const OXA_AVATAR = process.env.OXA_AVATAR_URL || 'https://docs.0xarchive.io/mintlify-assets/_mintlify/favicons/0xarchive-e895b8e7/epsl9cg6_-QmFjTh/_generated/favicon/android-chrome-192x192.png';

async function hmacHex(secret, msg) {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEq(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verify(secret, header, body, toleranceS = 300) {
  if (!header) return false;
  let t = null, v1s = [];
  for (const part of header.split(',')) {
    const [k, v] = part.split('=');
    if (k === 't') t = v;
    else if (k === 'v1') v1s.push(v);
  }
  if (!t || !v1s.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > toleranceS) return false;
  const expected = await hmacHex(secret, `${t}.${body}`);
  return v1s.some(s => timingSafeEq(expected, s));
}

const fmtUSD = n => n == null ? 'n/a'
  : n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M`
  : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}k`
  : `$${n.toFixed(0)}`;
const shortAddr = a => a ? `${a.slice(0, 6)}…${a.slice(-4)}` : 'n/a';

function titleFor(env) {
  const d = env.data || {};
  switch (env.type) {
    case 'market.liquidation':
      return `${d.symbol || '?'} ${(d.direction || 'liq').replace('Close ', '')} liquidated ${fmtUSD(d.notional_usd)}`;
    case 'market.liquidation_burst':
      return `${d.symbol || 'venue-wide'} burst ${fmtUSD(d.notional_usd || 0)} in ${d.window_s || '?'}s`;
    case 'account.liquidated':
      return `${shortAddr(d.account)} liquidated ${d.symbol || '?'} ${(d.direction || '').replace('Close ', '')} ${fmtUSD(d.notional_usd)}`;
    case 'account.fill':
      return `${shortAddr(d.account)} ${d.side === 'B' ? 'bought' : 'sold'} ${d.symbol || '?'} ${fmtUSD(d.notional_usd)}`;
    case 'account.transfer':
      return `${shortAddr(d.account)} ${d.role || ''} ${d.amount || ''} ${d.symbol || ''} (${fmtUSD(d.usdc_value)})`;
    case 'account.order_rejected':
      return `${shortAddr(d.account)} orders rejected on ${d.symbol || d.venue || ''}`;
    case 'account.twap_lifecycle':
      return `${shortAddr(d.account)} TWAP ${d.status || ''} on ${d.symbol || ''}`;
    case 'account.hip4_settled':
      return `${shortAddr(d.account)} HIP-4 settled ${fmtUSD(d.settlement_value)}`;
    case 'market.funding_flip':
      return `${d.symbol || '?'} funding flipped to ${((d.magnitude || 0) * 1e4).toFixed(2)}bp`;
    case 'market.listed':
      return `New listing: ${d.symbol || '?'} on ${d.venue || '?'}`;
    case 'market.oi_delta':
      return `${d.symbol || '?'} OI Δ ${d.threshold_pct ?? '?'}% over ${d.window_s ?? '?'}s`;
    case 'market.breadth_cross':
      return `Breadth crossed ${d.threshold}% (hyst ${d.hysteresis_pct}%)`;
    case 'market.pga_payment':
      return `PGA payment ${fmtUSD(d.notional_usd)} (${d.amount} HYPE)`;
    case 'hip4.settlement':
      return `HIP-4 outcome settled ${d.symbol || '?'}`;
    case 'oracle.jump':
      return `Oracle jump ${d.symbol || '?'} ${d.threshold_pct}%`;
    case 'chain.upgrade_detected':
      return `Hyperliquid upgrade ${d.state || ''} commit ${(d.commit || '').slice(0, 8)}`;
    case 'archive.gap_detected': return `Archive gap: ${d.venue} ${d.symbol || ''}`;
    case 'archive.gap_resolved': return `Archive gap resolved: ${d.venue} ${d.symbol || ''}`;
    case 'ingest.stall':         return `Ingest stall: ${d.venue} ${d.symbol || ''} (${d.threshold_s}s)`;
    case 'ingest.recovered':     return `Ingest recovered: ${d.venue} ${d.symbol || ''}`;
    case 'export.job.completed': return `Export ${d.job_id || ''} complete`;
    case 'export.job.failed':    return `Export ${d.job_id || ''} failed: ${d.error_message || ''}`;
    case 'webhook.test':         return `0xArchive test delivery OK`;
    case 'billing.credit_low':   return `Credit low: ${d.remaining_pct ?? '?'}%`;
    default:                     return env.type;
  }
}

function colorFor(type) {
  if (type === 'market.liquidation' || type === 'market.liquidation_burst' || type === 'account.liquidated') return 0xe74c3c;
  if (type === 'ingest.stall' || type === 'archive.gap_detected' || type === 'chain.upgrade_detected' || type === 'export.job.failed') return 0xf39c12;
  if (type === 'webhook.test' || type === 'archive.gap_resolved' || type === 'ingest.recovered') return 0x2ecc71;
  if (type === 'market.listed') return 0x9b59b6;
  return 0x3498db;
}

function embed(env) {
  const d = env.data || {};
  const fields = [];
  if (env.late_ms != null) fields.push({ name: 'late_ms', value: String(env.late_ms), inline: true });
  if (d.api_url) fields.push({ name: 'api', value: `\`${d.api_url}\``, inline: false });
  return {
    title: titleFor(env),
    color: colorFor(env.type),
    timestamp: env.observed_at,
    footer: { text: `${env.type} · id ${env.id || ''}` },
    fields,
  };
}

async function postDiscord(url, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.ok;
}

export default async function handler(request) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const raw = await request.text();
  const secret = process.env.OXARCHIVE_WHSEC;
  if (!secret) return new Response('misconfigured', { status: 500 });

  const sigHeader = request.headers.get('0xa-signature');
  if (!await verify(secret, sigHeader, raw)) return new Response('bad signature', { status: 401 });

  let env;
  try { env = JSON.parse(raw); } catch { return new Response('bad json', { status: 400 }); }

  if (env.type === 'webhook.test') {
    const testUrl = process.env.DISCORD_WEBHOOK_URL_OXA_TEST || process.env.DISCORD_WEBHOOK_URL_OXA;
    if (testUrl) await postDiscord(testUrl, { username: '0xArchive', avatar_url: OXA_AVATAR, content: '`webhook.test` received and signature verified' });
    return Response.json({ ok: true });
  }

  const url = process.env.DISCORD_WEBHOOK_URL_OXA;
  if (!url) return new Response('no discord url', { status: 500 });

  await postDiscord(url, { username: '0xArchive', avatar_url: OXA_AVATAR, embeds: [embed(env)] });
  return Response.json({ ok: true });
}