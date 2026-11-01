const assert = require('node:assert/strict');
const admin = require('../functions/node_modules/firebase-admin');
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_STORAGE_EMULATOR_HOST) throw new Error('Local emulators required.');
if (process.env.PHOTO_SLACK_MOCK !== 'on') throw new Error('Preload tests/profile-photos.mock-slack.cjs so this test cannot contact Slack.');
admin.initializeApp({ projectId: 'demo-test', storageBucket: 'demo-test.appspot.com' });
const db = admin.firestore();
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
const endpoint = 'http://127.0.0.1:5001/demo-test/europe-west2/profilePhoto';
function jwt(email, slack) {
  const b64 = x => Buffer.from(JSON.stringify(x)).toString('base64url');
  const now = Math.floor(Date.now()/1000);
  return b64({alg:'none',typ:'JWT'}) + '.' + b64({
    aud:'demo-test',iss:'https://securetoken.google.com/demo-test',sub:email,user_id:email,iat:now,exp:now+3600,email,
    firebase:{identities:slack?{'oidc.slack':[email.startsWith('owner')?'UOWNER':email.startsWith('other')?'UOTHER':email.startsWith('new')?'UNEW':'UOUT']}:{'google.com':[email]},sign_in_provider:slack?'oidc.slack':'google.com'},
  }) + '.';
}
async function call(action, email, slack, extra) {
  const response = await fetch(endpoint, {method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+jwt(email,slack)},body:JSON.stringify({data:Object.assign({action},extra||{})})});
  return { status:response.status, body:await response.json() };
}
async function signedOutCall(action) {
  const response = await fetch(endpoint, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({data:{action}}) });
  return { status:response.status, body:await response.json() };
}
(async()=>{
  await db.collection('roles').doc('pis').set({emails:[]});
  await db.collection('roles').doc('admins').set({emails:[]});
  await db.collection('settings').doc('access').set({pages:{people:{view:'exec'},profile:{view:'everyone',edit:'everyone'}}});
  await db.collection('people').doc('UOWNER').set({slackId:'UOWNER',email:'owner@example.test',name:'Owner'});
  await db.collection('people').doc('UOTHER').set({slackId:'UOTHER',email:'other@example.test',name:'Other'});
  await db.collection('people').doc('UOUT').set({slackId:'UOUT',email:'out@example.test',name:'Out'});
  await db.collection('people').doc('UNEW').set({slackId:'UNEW',email:'new@example.test',name:'New'});
  await db.collection('members').doc('other@example.test').set({category:'exec'});
  const imported = await call('ensure','new@example.test',true);
  assert.equal(imported.body.result.result.state,'active',JSON.stringify(imported));
  assert.equal((await db.collection('profilePhotos').doc('UNEW').get()).data().source,'slack');
  const repeated = await call('ensure','new@example.test',true);
  assert.equal(repeated.body.result.result.state,'unchanged',JSON.stringify(repeated));
  const mine = await call('mine','owner@example.test',true);
  assert.equal(mine.status,200,JSON.stringify(mine));
  assert.equal(mine.body.result.slackId,'UOWNER');
  assert.equal(mine.body.result.photo.state,'missing');
  const signedOut = await signedOutCall('mine');
  assert.equal(signedOut.body.error.status,'UNAUTHENTICATED',JSON.stringify(signedOut));
  const replaced = await call('replace','owner@example.test',true,{image:jpeg.toString('base64')});
  assert.equal(replaced.body.result.result.state,'active',JSON.stringify(replaced));
  assert.equal((await db.collection('profilePhotos').doc('UOWNER').get()).data().source,'manual');
  const invalid = await call('replace','owner@example.test',true,{image:'not-base64'});
  assert.equal(invalid.body.error.status,'FAILED_PRECONDITION',JSON.stringify(invalid));
  assert.equal((await db.collection('profilePhotos').doc('UOWNER').get()).data().source,'manual');
  const read = await call('get','other@example.test',true,{slackId:'UOWNER'});
  assert.equal(read.body.result.image,jpeg.toString('base64'),JSON.stringify(read));
  const restricted = await call('get','out@example.test',true,{slackId:'UOWNER'});
  assert.equal(restricted.body.error.status,'PERMISSION_DENIED',JSON.stringify(restricted));
  const ownRead = await call('get','owner@example.test',true,{slackId:'UOWNER'});
  assert.equal(ownRead.body.result.image,jpeg.toString('base64'),JSON.stringify(ownRead));
  const denied = await call('remove','owner@example.test',false);
  assert.equal(denied.body.error.status,'PERMISSION_DENIED',JSON.stringify(denied));
  const otherRemove = await call('remove','other@example.test',true);
  assert.equal(otherRemove.body.result.slackId,'UOTHER',JSON.stringify(otherRemove));
  assert.equal((await db.collection('profilePhotos').doc('UOWNER').get()).data().state,'active');
  const removed = await call('remove','owner@example.test',true);
  assert.equal(removed.body.result.result.state,'removed',JSON.stringify(removed));
  const ensured = await call('ensure','owner@example.test',true);
  assert.equal(ensured.body.result.result.state,'unchanged',JSON.stringify(ensured));
  console.log('Callable integration passed with demo-test functions, Firestore and Storage emulators');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>admin.app().delete());
