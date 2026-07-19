# Architecture Decision Records

## ADR-001 Shipment batches
Convenience-store shipping is modeled as a Shipment because several channels are commonly transported in one trip.

## ADR-002 Events are separate from Orders
Inbound handling and inventory-system use have no order quantity or channel workflow, so they are Events.

## ADR-003 Independent time tracking
Timers remain independent from worker, helper, quantity, and channel edits.

## ADR-004 Automatic timing for all workers
Automatic timing is the default. Manual time editing remains a correction tool rather than the normal workflow.

## ADR-005 Every timed entity is reportable
Order, Shipment, and Event durations must all appear in the dashboard and daily report. Total work time is the sum of those three categories.

## ADR-006 Completion must be reversible
An Order stores its pre-completion state. Completion has a 30-second Undo path and a later Restore path, with both actions written to the audit history.

## ADR-007 Completed work yields screen priority
Completed work is folded by default so active and waiting work remain visible without unnecessary scrolling. The folded header still exposes completed job count, order count, and work time.
