# Transit Tycoon 3D

A browser-based 3D public transport management and network-design game built with
Three.js, HTML, CSS and vanilla JavaScript ES modules. No build step, no bundler,
no CDN dependency — Three.js is vendored locally under `js/vendor/three/`.

## Running it

Because the game uses ES modules, it needs to be served over HTTP (opening
`index.html` directly via `file://` will be blocked by the browser's module
loader). Any static file server works, e.g. from this folder:

```
python3 -m http.server 8000
```

then open `http://localhost:8000/`.

## Controls

- **Left toolbar**: Select / Station / Route / Delete tools.
- **Station tool**: click a developed (colored) zone tile near a road to build a stop.
- **Route tool**: click existing stations in order to build a line; the side panel
  lets you pick vehicle type (Bus / Tram / Subway, the latter two unlock via
  milestones), loop vs. there-and-back, and frequency, with a live cost estimate.
  Nothing is charged until you hit **Finish Route**.
- **Vehicle toolbar button** / **Routes** (bottom bar): manage existing routes —
  add/remove vehicles, rename, delete.
- **Finance** (bottom bar): budget, fare slider, loans, daily history and
  per-route profitability.
- **Map** (top bar): toggle between the 3D view and a Mini-Metro-style 2D
  schematic overlay. Both views share the same click-to-build pipeline, so you
  can design the network from whichever is more legible.
- Orbit/pan/zoom the 3D camera with the mouse (drag to orbit, wheel to zoom).
- Speed controls (top bar): pause, 1x, 2x, 4x — simulation runs on a fixed
  timestep independent of render framerate.

## What's implemented

- Procedural low-poly city on a grid: residential/commercial/industrial/landmark
  zones, a road lattice, a river requiring bridges for surface routes, and slow
  city growth (new districts unlock every few in-game days if satisfaction holds up).
- Bus (road-following), Tram (road-following + paid track construction) and
  Subway (straight-line tunnels, ignores roads/river) with distinct cost,
  speed and capacity.
- Passenger simulation: spawning from time-of-day demand curves (rush hours,
  reverse commutes, off-peak trickle), multi-leg pathfinding with transfers
  across the whole route network, wait/crowding/transfer-based satisfaction,
  and lost-demand/car-congestion tracking for trips the network can't serve.
- Economy: budget, configurable fare, per-route operating costs, station
  maintenance, track/tunnel construction costs, an optional loan, and a finance
  dashboard with daily history and per-route profitability.
- Day/night cycle with a moving sun and sky color, calendar/week tracking,
  and milestone-driven unlocks (Tram, Subway, plus a few ridership/revenue/
  coverage achievements).
- 2D schematic ("Mini Metro style") map toggle alongside the 3D view.

## Known simplifications

- Individual passengers are rendered only while waiting at a station
  (instanced meshes) and as an occupancy bar + small figures on vehicles while
  riding; the walk-to/from-station legs aren't individually animated.
- Vehicles use regular meshes rather than instancing — fine at the vehicle
  counts this game reaches, but worth revisiting if you push frequencies much higher.
- The standalone scenario/challenge mode described as a stretch goal isn't
  built; the sandbox milestone system covers the "scoring & progression" bullet instead.
- A passenger's route plan is computed once at spawn time; if you delete a
  station/route mid-journey a passenger relying on it will just time out
  after a few in-game hours and count as lost demand, rather than replanning live.
