# PR: Shared profile pictures

## Summary

- Add one site-managed portrait per verified Slack member. Import from Slack
  on the first authenticated page load in the background, with initials when
  no usable picture exists.
- Add Replace photo, Remove photo and Use Slack photo controls on Profile.
  Removal opts out of automatic reimport; deliberate Slack refresh clears it.
- Use the shared portrait component on Profile, beside names in People, and on
  member pages. People loads visible portraits as the page scrolls.
- Keep objects private in Storage and serve bytes through an authenticated
  callable. The callable resolves the owner through verified Slack identity and
  the server roster. Firestore and Storage rules deny client writes, and photo
  reads follow Who can see what.

## Local checks

- `npm run build` and `npm test`
- `git diff --check` and JavaScript syntax checks
- `firebase emulators:exec --only firestore,storage --project demo-test 'node tests/profile-photos.emulator.cjs'`
  with local Java 21. Tests use synthetic users and mocked Slack responses for
  first import, repeated import, concurrent imports, a manual replacement
  racing an import, absent/default and invalid images, fetch failure and
  retry, removal opt-out, deliberate Slack refresh, and denied client writes.
  They check signed-out, non-Slack, owner, and another member against
  Firestore and Storage rules, plus an Admin SDK Storage write.
- Static local HTML/CSS fixture rendered at 1365 px and 500 px in headless
  Chrome, with synthetic names, no scripts and no external requests.

## Rota and release handoff

The meeting rota is still on its own branch. Rebase it after this PR and use
`BOLD.photo.mount` for presenters, retaining its rota-specific portrait as a
fallback until a separately approved migration. Keep the offline preview's
local portrait files. No legacy portraits are imported here.

The client needs `profilePhoto` and the new Firestore/Storage rules deployed
together by a Firebase maintainer after review. Do not deploy a bare Firebase
target or enable Hosting. This PR does not change production Firebase, Slack,
or member data.
