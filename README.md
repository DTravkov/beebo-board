# Beebo Board

A privacy-first whiteboard for tutoring, study groups, and thinking together. Sketch, write notes, add images, and collaborate with up to **eight people**—without accounts or tracking.

Boards stay in your browser unless you choose to save or export them.

The **Spinner** button in the left rail opens a full-window break mode. All board content rotates over the usual stationary board background. Drag anywhere, including any corner, then release for long, gently slowing inertia. Use the mouse wheel to zoom in and out while spinning; offscreen objects remain available as you zoom out. Arrow keys spin, Space stops, and Escape returns to editing. Reduced-motion preferences disable inertia. Rotation and zoom stay local and do not change shared objects or your editing viewport.

## Quickstart

### Docker

```sh
docker compose -f docker-compose.dev.yml up --build
```

Open **http://localhost:5173**. To test sharing locally, select **Allow direct connections** in Share board.

### npm

For local editing with Node.js 22.12+:

```sh
npm --prefix frontend ci
npm --prefix frontend run dev
```

Open **http://localhost:5173**. This starts the frontend; use Docker above to include the sharing service.

See [deployment](docs/DEPLOYMENT.md) for guidelines about hosting in production environment and [contributing](CONTRIBUTING.md) for development.

## License

[Apache-2.0](LICENSE). See [third-party notices](THIRD_PARTY_NOTICES.txt) for included dependencies.
