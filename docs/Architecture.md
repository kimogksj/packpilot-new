# PackPilot Architecture

## Order
A channel job with an order quantity and operational stages: picking, sorting, packing, waiting for logistics, and optionally moving home-delivery packages to the hallway.

## Shipment
A timed logistics trip containing one or more convenience-store Orders. Completing the Shipment completes all linked Orders without multiplying the trip duration.

## Event
A standalone timed activity with a worker but no channel, quantity, or order workflow. v0.6 includes inbound handling and inventory-system use.

## Time Tracking
Every worker uses automatic timing by default. Worker assignment and time records are edited independently so changing helpers never converts a running timer into a manual record.
