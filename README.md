# PackPilot v0.6.0 Alpha Revision 2

A mobile-first warehouse workflow tracker for figurine packing operations.

## Run locally

```bash
npm ci
npm run dev
```

## Verify and build

```bash
npm run check
```

The deployable static site is generated in `dist/` and is compatible with the project's existing GitHub Pages workflow.

## Core modules

- Order
- Shipment
- Event
- Time Tracker
- Reporting
- Completion Recovery

## Alpha Revision 2 highlights

- Shipment duration is included in today's statistics.
- Total time equals Order + Shipment + Event.
- Completed work supports Undo and Restore.
- Completed work is folded by default with an always-visible summary.

See `docs/Architecture.md`, `docs/ADR.md`, and `docs/ProductPrinciples.md` for the current design rules.
