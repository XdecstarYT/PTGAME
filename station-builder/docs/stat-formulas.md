# Station Builder — stat formulas

Everything below lives in `js/statEngine.js` (and the small graph helpers in
`js/circulation.js`). These are deliberately simple, documented
approximations - cell counts and run-lengths, not a real pedestrian
microsimulation. Walk mode (Phase 3) is the actual proof that a layout
"feels" right; these numbers are meant to give fast, legible feedback while
painting, not ground truth.

## Throughput building blocks

Each interior object contributes a per-hour passenger-throughput number when
present on a level:

| Object       | Contribution/hour | Role                          |
|--------------|--------------------|-------------------------------|
| Platform     | 90 / cell          | boarding & alighting capacity |
| Waiting area | 20 / cell          | buffer capacity                |
| Turnstile    | 600 / gate         | circulation (gate) throughput  |
| Entrance     | 400 / entrance     | circulation (gate) throughput  |
| Stairs       | 150 / cell         | vertical circulation capacity  |
| Escalator    | 400 / cell         | vertical circulation capacity  |
| Elevator     | 120 / cell         | vertical circulation capacity  |

These numbers are order-of-magnitude guesses loosely modeled on real transit
planning capacity figures (a turnstile lane clears a few hundred people per
hour; a wide staircase clears more than a narrow one), not measured data.

## Capacity

```
platformThroughput = sum over all levels of (platformCells*90 + waitingCells*20)
gateThroughput      = sum over all levels of (turnstiles*600 + entrances*400)
capacity = min(platformThroughput, gateThroughput)
```

The station's overall capacity is bottlenecked by whichever side is smaller
- a huge platform behind two turnstiles is still a two-turnstile station.
`targetThroughput` (from `TARGET_THROUGHPUT` in `config.js`) is just a
per-tier reference point shown alongside it, not a hard constraint.

## Congestion risk (0-100)

Two independent risk sources, and the worse of the two wins:

**Gate risk** - platform-side demand outrunning entrances/turnstiles:
```
gateRisk = clamp(round(100 * max(0, (platformThroughput - gateThroughput) / platformThroughput)), 0, 100)
```

**Vertical risk** - on any level above the ground floor, platform demand on
that level outrunning the stairs/escalators/elevators serving it:
```
verticalCapacity(level) = stairs*150 + escalators*400 + elevators*120
risk(level) = clamp(round(100 * max(0, (levelDemand - verticalCapacity) / levelDemand)), 0, 100)
worstVerticalRisk = max risk(level) across all non-ground levels
```

```
congestionRisk = max(gateRisk, worstVerticalRisk)
```

This is the "single narrow stairwell serving a big platform" case from the
spec: a below-ground platform with heavy demand and only one stairwell
scores high vertical risk even if the ground-floor gates are fine.

## Accessibility rating (0-100)

```
entranceScore = clamp((entranceCount / minEntrancesForTier) * 60, 0, 60)
accessScore    = accessibleRouteExists(station) ? 40 : 0
accessibilityRating = round(entranceScore + accessScore)
```

`accessibleRouteExists` (in `circulation.js`) is true for single-level
stations by definition, and for multi-level stations only if *every*
non-ground level has at least one elevator - stairs/escalators satisfy bare
connectivity (`hasVerticalLink`) but not the accessibility requirement.

`accessibilityCompliant = entranceCount >= minEntrances AND accessibleRouteExists(station)`
is the boolean gate other systems (contracts/milestones, once integrated
with the main game) would key off of.

## Platform length

```
platformLength = longest contiguous run of 'platform' cells,
                  scanned along every row and every column, in meters
```

Checked against `REQUIRED_PLATFORM_LENGTH_M[stationType]` - a rough stand-in
for "does this fit the vehicle/consist" until this tool is wired up to the
real vehicle designer's chassis/consist length.

## Dwell / transfer time estimate

```
diagonal    = footprint diagonal in meters (from the outdoor w x d footprint)
baseWalkMin = diagonal / 1.2 m/s / 60
dwellTimeMin = round(baseWalkMin * (1 + congestionRisk/100) * 10) / 10
```

A straight-line walk-time estimate across the footprint, inflated by the
congestion risk multiplier (up to 2x at 100% congestion). It is intentionally
crude - a real estimate would need an actual path from entrance to platform,
which is exactly what walk mode is for.

## Interior spend

Just a running sum of `cost` for every non-empty cell across every level,
using the unit costs in `INTERIOR_OBJECTS` (`config.js`). Painting over a
cell refunds the old object's cost and charges the new one, so this number
always matches what's actually on the grid right now.
