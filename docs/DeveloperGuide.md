# Developer Guide

Before adding a feature, classify it as Order, Shipment, Event, or shared infrastructure.

- Order: has channel, quantity, and workflow stages.
- Shipment: groups multiple convenience-store Orders into one logistics trip.
- Event: has worker and duration but no order quantity or channel workflow.
- Shared: timer, audit, reporting, recovery, and UI primitives.

## Required invariants

- Every timed entity must be included in reporting.
- Worker and helper edits must not start, stop, or replace a timer.
- Quantity and metadata edits must retain an audit record.
- Completion must have a recovery path.
- Restoring a running stage must close the old open session at completion time and start a new session at restore time. The completed gap must not be counted.
- Completed work must not occupy the primary active-work area.

## Persistence

When changing the persisted data shape:

1. Increase the Zustand persistence version.
2. Preserve the existing storage key unless a deliberate data reset is required.
3. Add a migration path for the previous Alpha schema.
4. Run `npm run check` before packaging.
