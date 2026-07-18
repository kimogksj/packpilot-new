# Developer Guide

Before adding a feature, classify it as Order, Shipment, Event, or shared infrastructure.

- Order: has channel, quantity, and workflow stages.
- Shipment: groups multiple convenience-store Orders into one logistics trip.
- Event: has worker and duration but no order quantity or channel workflow.
- Shared: timer, audit, reporting, UI primitives.

All mutable operational data should retain an audit record. Do not couple worker edits to timer state.
