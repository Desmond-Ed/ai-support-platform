# End-to-end tests

Install dependencies from this directory with `npm install`, then run
`npx playwright install chromium` once. Start the local Compose stack and run
`npm test` to execute the frontend/backend smoke test. The browser binary was
not installed in the current environment because the external Chromium
download timed out; retry the install from a network-enabled environment.

Set `FRONTEND_URL` and `BACKEND_URL` when the services are hosted elsewhere.
