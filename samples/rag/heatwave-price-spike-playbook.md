# Heatwave Price-Spike Playbook (August 2025 replay)

On 2025-08-14 the regional spot price jumped from $52 to $395/MWh during a
39°C heatwave afternoon peak.

## What worked

- BESS-Alpha discharged 45 MW and BESS-Beta 35 MW within the first 5 minutes
  of the price ramp, exporting 62 MW to the wholesale market.
- Apex Steel flexible arc-furnace load was shed 12 MW under the ISO demand
  response tariff at $85/MWh incentive.
- Battery SOC fell from 78% to 32%, staying well above the 15% emergency floor.

## Outcome

- Net economic benefit of +$28,400 in 60 minutes with zero carbon penalty.
- Zero guardrail violations; IEEE-1547 frequency response never triggered.

## Lesson for the orchestrator

Dispatch storage EARLY ahead of a confirmed price plateau rather than waiting
for the peak print. Early discharge captures margin while preserving the
option to re-charge on the evening wind ramp.
