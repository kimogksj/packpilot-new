# Architecture Decision Records

## ADR-001 Shipment batches
Convenience-store shipping is modeled as a Shipment because several channels are commonly transported in one trip.

## ADR-002 Events are separate from Orders
Inbound handling and inventory-system use have no order quantity or channel workflow, so they are Events.

## ADR-003 Independent time tracking
Timers remain independent from worker, helper, quantity, and channel edits.

## ADR-004 Automatic timing for all workers
Automatic timing is the default. Manual time editing remains a correction tool rather than the normal workflow.
