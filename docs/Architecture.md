# PackPilot Architecture

## Order
A channel job with an order quantity and operational stages: picking, sorting, packing, waiting for logistics, and optionally moving home-delivery packages to the hallway.

An Order stores a completion snapshot immediately before it enters the completed state. Undo and Restore use this snapshot to recover the prior workflow state without counting the completed gap as active work time.

## Shipment
A timed logistics trip containing one or more convenience-store Orders. Completing the Shipment completes all linked Orders without multiplying the trip duration.

Shipment time is a first-class reporting category. A shipment batch completed by mistake can be undone for 30 seconds, restoring its linked Orders to waiting for logistics and continuing the batch timer.

## Event
A standalone timed activity with a worker but no channel, quantity, or order workflow. v0.6 includes inbound handling and inventory-system use.

## Time Tracking
Every worker uses automatic timing by default. Worker assignment and time records are edited independently so changing helpers never converts a running timer into a manual record.

Daily totals are computed from the time intervals that overlap the selected local calendar day. This prevents an interval crossing midnight from being assigned entirely to one day.

## Reporting
Every timed entity is reportable.

Today's total is:

```text
Order time + Shipment time + Event time
```

Waiting-for-logistics sessions remain visible on an Order but are excluded from Order work-time totals.

## Persistence
The current persistence schema is version 9. It keeps the existing `packpilot-data-v6-alpha-r1` local-storage key so Alpha Revision 1 field data migrates in place instead of appearing to disappear.
