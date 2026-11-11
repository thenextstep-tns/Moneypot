const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret, defineString } = require('firebase-functions/params');
const admin = require('firebase-admin');
admin.initializeApp();

const CLIENT_ID = defineSecret('DISCORD_CLIENT_ID');
const CLIENT_SECRET = defineSecret('DISCORD_CLIENT_SECRET');
// Comma-separated list of app URLs allowed as OAuth redirect URIs (and CORS origins), e.g.
// "https://thenextstep-tns.github.io/Moneypot/,http://localhost:5173/"
const ALLOWED_REDIRECTS = defineString('DISCORD_ALLOWED_REDIRECTS', {
  default: 'https://thenextstep-tns.github.io/Moneypot/,http://localhost:5173/',
});

const allowedRedirects = () => ALLOWED_REDIRECTS.value().split(',').map(s => s.trim()).filter(Boolean);
const allowedOrigins = () => allowedRedirects().map(u => new URL(u).origin);

// POST { code, redirect_uri }  →  { token } (Firebase custom token, uid = "discord:<id>")
exports.discordAuth = onRequest({ secrets: [CLIENT_ID, CLIENT_SECRET] }, async (req, res) => {
  const origin = req.get('origin');
  if (origin && allowedOrigins().includes(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
    res.set('Access-Control-Allow-Methods', 'POST');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const { code, redirect_uri } = req.body || {};
  if (typeof code !== 'string' || !code || code.length > 200 || typeof redirect_uri !== 'string') {
    return res.status(400).json({ error: 'missing code' });
  }
  if (!allowedRedirects().includes(redirect_uri)) return res.status(400).json({ error: 'redirect not allowed' });

  try {
    const tokRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID.value(),
        client_secret: CLIENT_SECRET.value(),
        grant_type: 'authorization_code',
        code,
        redirect_uri,
      }),
    });
    const tok = await tokRes.json().catch(() => ({}));
    if (!tokRes.ok || !tok.access_token) return res.status(401).json({ error: 'Discord rejected the sign-in. Please try again.' });

    const userRes = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${tok.access_token}` } });
    const u = await userRes.json().catch(() => ({}));
    // Never mint a token without a real Discord user id (e.g. on rate-limit responses)
    if (!userRes.ok || typeof u.id !== 'string' || !/^\d{5,25}$/.test(u.id)) {
      return res.status(502).json({ error: 'Could not read your Discord profile. Please try again.' });
    }

    const uid = `discord:${u.id}`;
    const profile = { displayName: String(u.global_name || u.username || 'Discord user').slice(0, 100) };
    if (u.avatar) profile.photoURL = `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png`;
    try {
      await admin.auth().updateUser(uid, profile);
    } catch (e) {
      if (e && e.code === 'auth/user-not-found') await admin.auth().createUser({ uid, ...profile });
      else throw e;
    }
    return res.json({ token: await admin.auth().createCustomToken(uid, { provider: 'discord' }) });
  } catch (e) {
    console.error('discordAuth failed', e);
    return res.status(500).json({ error: 'Sign-in failed. Please try again.' });
  }
});
