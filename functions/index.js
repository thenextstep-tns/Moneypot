const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
admin.initializeApp();

const CLIENT_ID = defineSecret('DISCORD_CLIENT_ID');
const CLIENT_SECRET = defineSecret('DISCORD_CLIENT_SECRET');

// GET ?code=...&redirect_uri=...  →  { token } (Firebase custom token, uid = "discord:<id>")
exports.discordAuth = onRequest({ secrets: [CLIENT_ID, CLIENT_SECRET], cors: true }, async (req, res) => {
  const { code, redirect_uri } = req.query;
  if (!code || !redirect_uri) return res.status(400).json({ error: 'missing code' });

  const tok = await (await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID.value(), client_secret: CLIENT_SECRET.value(), grant_type: 'authorization_code', code, redirect_uri }),
  })).json();
  if (!tok.access_token) return res.status(401).json(tok);

  const u = await (await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${tok.access_token}` } })).json();
  const uid = `discord:${u.id}`;
  const profile = { displayName: u.global_name || u.username };
  if (u.avatar) profile.photoURL = `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png`;
  try { await admin.auth().updateUser(uid, profile); } catch { await admin.auth().createUser({ uid, ...profile }); }

  res.json({ token: await admin.auth().createCustomToken(uid, { provider: 'discord' }) });
});
