# Local group meeting rota preview

The group meeting rota is in development. To view it with the published data from the [previous rota](https://bold-lab-meeting-rota.theo-wolf296647.chatgpt.site/), run:

```sh
npm install
npm run preview:rota
npm start
```

Open <http://localhost:8137/group-meetings-preview.html>. The Archive link shows past meetings. Search checks every meeting, and Show more reveals ten at a time.

`preview:rota` makes a read-only request to the previous rota's public API and generates an ignored `_site/group-meetings-preview.html` with that snapshot. It uses a local mock instead of Firebase, so edit controls cannot save. Running it again refreshes the snapshot. The branch does not import data into the live BOLD.OS database, deploy functions or rules, or send Slack messages.
