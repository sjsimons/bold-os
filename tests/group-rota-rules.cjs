const assert = require('node:assert/strict');
const admin = require('../functions/node_modules/firebase-admin');
const projectId = 'demo-test';
const host = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
process.env.FIRESTORE_EMULATOR_HOST = host;
admin.initializeApp({ projectId });
const db = admin.firestore();
const root = `http://${host}/v1/projects/${projectId}/databases/(default)/documents`;
const b64 = x => Buffer.from(JSON.stringify(x)).toString('base64url');
const jwt = (email, slackId) => {
  const now = Math.floor(Date.now() / 1000);
  return b64({ alg: 'none', typ: 'JWT' }) + '.' + b64({ iss: `https://securetoken.google.com/${projectId}`, aud: projectId, auth_time: now, iat: now, exp: now + 3600, sub: slackId, user_id: slackId, email, firebase: { identities: { 'oidc.slack': [slackId] }, sign_in_provider: 'oidc.slack' } }) + '.';
};
const get = (path, token) => fetch(root + '/' + path, { headers: token ? { Authorization: 'Bearer ' + token } : {} });
const write = (path, token) => fetch(root + '/' + path, { method: 'PATCH', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { test: { stringValue: 'bad' } } }) });
(async () => {
  await db.collection('roles').doc('admins').set({ emails: ['admin@example.org'] });
  await db.collection('roles').doc('pis').set({ emails: [] });
  await db.collection('people').doc('U1').set({ email: 'one@example.org', slackId: 'U1' });
  await db.collection('people').doc('U2').set({ email: 'two@example.org', slackId: 'U2' });
  await db.collection('people').doc('UA').set({ email: 'admin@example.org', slackId: 'UA' });
  await db.collection('groupMeetings').doc('2099-01-05').set({ date: '2099-01-05' });
  await db.collection('groupRotaSlots').doc('s1').set({ date: '2099-01-05', meetingId: '2099-01-05' });
  await db.collection('groupRotaSlots').doc('s1').collection('versions').doc('v1').set({ at: 1 });
  await db.collection('groupRotaSwaps').doc('swap').set({ requesterSlackId: 'U1', recipientSlackId: 'U2' });
  await db.collection('groupRotaDeclines').doc('decline').set({ byEmail: 'one@example.org', reason: 'private' });
  await db.collection('groupRotaEligibility').doc('U1').set({ eligible: true });
  await db.collection('groupRotaNotifications').doc('n1').set({ status: 'sent' });
  const one = jwt('one@example.org', 'U1'), two = jwt('two@example.org', 'U2'), adm = jwt('admin@example.org', 'UA');
  const cases = [
    ['signed out rota', await get('groupRotaSlots/s1'), 403],
    ['signed in rota', await get('groupRotaSlots/s1', one), 200],
    ['signed in meeting', await get('groupMeetings/2099-01-05', one), 200],
    ['version readable', await get('groupRotaSlots/s1/versions/v1', one), 200],
    ['direct slot write denied', await write('groupRotaSlots/s1', one), 403],
    ['requester swap', await get('groupRotaSwaps/swap', one), 200],
    ['requester swap with email case variation', await get('groupRotaSwaps/swap', jwt('One@Example.org', 'U1')), 200],
    ['recipient swap', await get('groupRotaSwaps/swap', two), 200],
    ['own decline', await get('groupRotaDeclines/decline', one), 200],
    ['other decline denied', await get('groupRotaDeclines/decline', two), 403],
    ['admin decline', await get('groupRotaDeclines/decline', adm), 200],
    ['eligibility hidden', await get('groupRotaEligibility/U1', one), 403],
    ['delivery hidden', await get('groupRotaNotifications/n1', one), 403]
  ];
  for (const [label, response, code] of cases) assert.equal(response.status, code, `${label}: ${response.status} ${await response.text()}`);
  console.log(`Rota Firestore rules: ${cases.length} cases passed`);
})().catch(e => { console.error(e); process.exitCode = 1; });
