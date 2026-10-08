# End-to-end tests

Install dependencies from this directory with `npm install`, then run
`npx playwright install chromium` once. Start the local Compose stack and run
`npm test` to execute the browser suite, including frontend/backend health,
authentication, ticket, conversation, notification, and analytics scenarios.
Rebuild the frontend container after changing its dependencies so its image has
the same packages as `frontend/package.json`.

Set `FRONTEND_URL` and `BACKEND_URL` when the services are hosted elsewhere.
