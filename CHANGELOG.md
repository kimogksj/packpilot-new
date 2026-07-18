# PackPilot Changelog

## v0.6.0 Alpha Revision 1

### Added
- Shipment batches: one timed trip can complete multiple convenience-store jobs.
- Independent activity events for inbound handling and inventory-system use.
- Editable work quantity, channel, delivery type, and note.
- Independent worker editing that does not replace or stop the timer.
- Automatic timing for every worker by default.
- Channel recognition colors and larger channel-first work cards.
- Audit records for work, event, shipment, and workday changes.

### Changed
- Removed inventory-system from order channels and modeled it as an event.
- Removed per-order convenience-store shipping stage.
- Home delivery still completes by moving packages to the hallway.
- Reports now distinguish completed orders from shipment trips.
- Persistence schema upgraded to version 8 with migration from v0.5 data.

### Known Alpha Notes
- This is an architecture revision intended for field testing.
- Existing v0.5 inventory-system jobs are excluded during migration; prior inbound sessions are migrated to events.
