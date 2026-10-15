#!/usr/bin/env node
// Build a local, read-only preview from the published old rota. Nothing here
// connects to BOLD.OS Firebase or sends a write to the source rota.
import { readFile, writeFile } from 'node:fs/promises';

const sourceUrl = 'https://bold-lab-meeting-rota.theo-wolf296647.chatgpt.site/api/rota';
const sourcePath = process.argv[2];
const source = sourcePath
  ? JSON.parse(await readFile(sourcePath, 'utf8'))
  : await (async () => {
      const response = await fetch(sourceUrl);
      if (!response.ok) throw new Error(`Rota download failed: HTTP ${response.status}`);
      return response.json();
    })();

if (!source.scheduleId || !Array.isArray(source.meetings) || !Array.isArray(source.members) || !Array.isArray(source.changes)) {
  throw new Error('The source rota did not return the expected meeting, member and change lists.');
}

const docs = {
  groupMeetings: [], groupRotaSlots: [], groupRotaMembers: [], people: [],
  groupMeetingSeasons: [], projectWorkspaces: [], changelog: [],
};
for (const meeting of source.meetings) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meeting.date) || !Array.isArray(meeting.slots)) throw new Error('Invalid meeting in source rota.');
  docs.groupMeetings.push([meeting.date, {
    date: meeting.date, seasonId: source.scheduleId, format: meeting.format,
    startTime: meeting.meetingTime, durationMinutes: meeting.durationMinutes,
    timeZone: meeting.timeZone || 'Europe/London', location: 'Oxford',
    status: meeting.skipped ? 'skipped' : 'scheduled', skipReason: meeting.skipReason || '', origin: 'import',
  }]);
  meeting.slots.forEach((slot, index) => {
    const presenterId = slot.presenterId || '';
    docs.groupRotaSlots.push([slot.id, {
      meetingId: meeting.date, date: meeting.date, slotNumber: index + 1,
      format: meeting.format, presenterSlackId: presenterId ? `preview-${presenterId}` : '',
      legacyMemberId: presenterId, legacyName: slot.presenter || '', topic: slot.topic || '',
      slidesUrl: '', projectId: '', outcome: 'unconfirmed', revision: slot.version || 0, origin: 'import',
    }]);
  });
}
for (const member of source.members) {
  const id = `preview-${member.id}`;
  docs.groupRotaMembers.push([id, { active: member.active !== false, category: member.memberType || 'associate', legacyMemberId: member.id }]);
  docs.people.push([id, { slackId: id, name: member.name }]);
}
docs.groupMeetingSeasons.push([source.scheduleId, { label: source.scheduleId, regularTime: '11:00', location: 'Oxford' }]);
for (const change of source.changes) {
  const details = [];
  for (const [key, label] of [['presenterChange', 'Presenter'], ['topicChange', 'Topic']]) {
    const diff = change[key];
    if (diff) details.push(`${label}: ${diff.from || '(empty)'} → ${diff.to || '(empty)'}`);
  }
  docs.changelog.push([`source-change-${change.id}`, {
    at: Date.parse(change.changedAt), by: null, note: details.join('; ') || 'Slot details saved',
    kind: 'edited', collection: 'groupRotaSlots', docId: change.slotId,
    date: change.meetingDate, slotNumber: change.slotNumber,
  }]);
}

const inlineJson = JSON.stringify(docs).replace(/</g, '\\u003c');
const snapshotDate = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const mock = `const data = ${inlineJson};\n` + String.raw`
const docs = items => ({ docs: items.map(([id, data]) => ({ id, data: () => data })), empty: !items.length });
window.BOLD = {
  getAuth: () => true, getApp: () => ({}),
  escapeHtml: value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]),
  onUser: callback => setTimeout(() => callback({ email: 'preview@example.test' }), 0),
  mountMasthead: () => { document.getElementById('authRegion').textContent = 'Local preview · source rota snapshot'; },
  mountShell: () => { document.getElementById('shell').hidden = false; document.getElementById('pageGate').hidden = true; },
};
const previewCollection = name => {
  const query = { get: () => Promise.resolve(docs(data[name] || [])), where: () => query,
    orderBy: () => query, startAfter: () => query, limit: () => query };
  return query;
};
window.firebase = {
  firestore: () => ({ collection: previewCollection }),
  app: () => ({ functions: () => ({ httpsCallable: name => () => name === 'groupRotaAccess'
    ? Promise.resolve({ data: { slackId: 'preview-ola-kalisz', registered: true, eligible: true, admin: false, swaps: [] } })
    : Promise.reject(new Error('Local preview only — changes are not saved.')) }) }),
};
document.addEventListener('click', event => {
  const link = event.target.closest('a[href]');
  if (!link) return;
  const url = new URL(link.href);
  if (url.origin === location.origin && url.pathname.endsWith('/group-meetings.html')) {
    event.preventDefault();
    location.href = 'group-meetings-preview.html' + url.search + url.hash;
  }
});
document.addEventListener('DOMContentLoaded', () => {
  const shell = document.getElementById('shell');
  const toggle = document.getElementById('navToggle');
  toggle.addEventListener('click', () => {
    const open = shell.classList.toggle('is-nav-open');
    toggle.setAttribute('aria-expanded', String(open));
  });
  document.getElementById('sidebarBackdrop').addEventListener('click', () => {
    shell.classList.remove('is-nav-open'); toggle.setAttribute('aria-expanded', 'false');
  });
  document.getElementById('sidebarCollapse').addEventListener('click', () => shell.classList.toggle('is-collapsed'));
  document.querySelectorAll('.nav-group-toggle').forEach(button => button.addEventListener('click', () => {
    const group = button.closest('.nav-group');
    group.classList.toggle('is-pinned');
    group.classList.toggle('is-shut', !group.classList.contains('is-pinned'));
  }));
});
`;

const pagePath = '_site/group-meetings.html';
let page = await readFile(pagePath, 'utf8');
page = page.replace(/<script src="https:\/\/www\.gstatic\.com\/firebasejs\/[^\"]+"><\/script>\n/g, '');
page = page.replace(/<script>window\.BOLD_CONFIG = [^<]+<\/script>\n/, '');
page = page.replace(/<script src="assets\/js\/bold\.js[^\"]*"><\/script>\n/, '');
page = page.replace('</head>', `<script>\n${mock}\n</script>\n</head>`);
if (page.includes('firebase-app-compat.js') || page.includes('window.BOLD_CONFIG')) throw new Error('Could not isolate the preview from production Firebase.');
page = page.replace('Local preview · source rota snapshot', `Local preview · source rota snapshot (${snapshotDate})`);
await writeFile('_site/group-meetings-preview.html', page);
console.log(`Created local preview from ${docs.groupMeetings.length} meetings, ${docs.groupRotaSlots.length} slots, ${docs.people.length} members and ${docs.changelog.length} changes.`);
