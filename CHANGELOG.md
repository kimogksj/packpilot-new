# PackPilot Changelog

## v0.6.0 Alpha Revision 2

### Added
- Shipment duration is now included in the dashboard, daily report, and total work time.
- Dashboard time categories for Order, Shipment, Event, and Total.
- A 30-second undo action after completing a home-delivery job or shipment batch.
- Restore action for completed work after the undo window has expired.
- Completion snapshots that return work to its prior stage without counting the completed gap as active time.
- Audit records for undo, restore, and removing restored work from a shipment batch.
- A compact completed-work summary showing completed jobs, orders, and work duration.
- `docs/ProductPrinciples.md` with the product rules established during Alpha testing.

### Changed
- Completed work is separated from active work and folded by default.
- A new completion automatically folds the completed section again.
- Today's total time is calculated as Order + Shipment + Event.
- Daily report now includes shipment duration and the complete time breakdown.
- Persistence schema upgraded from 8 to 9 while preserving the existing v0.6 Alpha Revision 1 storage key and data.

### Fixed
- Shipment timers no longer disappear from daily statistics.
- Accidentally completed work can be recovered.
- Accidentally completed shipment batches can be undone within 30 seconds.
- Completed jobs no longer push active work down the page.

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
