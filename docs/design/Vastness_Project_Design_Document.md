**VASTNESS**

Interactive Data-Driven Solar System & Spacecraft Visualization

*Detailed Design & Project Requirements Document*

Version 1.0 • November 26, 2026

1\. Executive Summary

Vastness is a free, open-source web-based interactive planetarium and
solar system visualizer. Its primary goal is to communicate the true
scale of the solar system and the locations of human spacecraft through
accurate, beautiful 3D visualization driven by authoritative public data
sources (primarily NASA/JPL Horizons).

Users can freely pan, zoom, and fly around the solar system, select
individual spacecraft or planets, view trajectories, light-time delays,
distances, and contextual information. The experience emphasizes both
scientific accuracy and the emotional sense of vast emptiness that
defines space.

2\. Vision & Goals

2.1 Vision

Create the most accessible, accurate, and visually compelling open tool
for experiencing the scale of the solar system and humanity’s robotic
explorers.

2.2 Primary Goals

- Show true relative scale of the Sun, planets, and spacecraft distances

- Display accurate real-time and historical positions of major
  deep-space probes

- Allow free exploration with intuitive camera controls

- Provide rich contextual data (distance, light-time, velocity, mission
  status)

- Remain completely free and open-source

- Run entirely in the browser with no installation required

3\. Domain Name Status

As of November 26, 2026:

|                     |                                  |
|---------------------|----------------------------------|
| **Domain**          | **Status**                       |
| vastness.com        | Registered (expires 2032)        |
| vastspace.com       | Registered (Vast Space company)  |
| vast.space          | Registered                       |
| thevastnessof.space | Registered                       |
| vastness.space      | Status unknown — check registrar |
| thevastness.space   | Status unknown — check registrar |
| solarvastness.space | Status unknown — check registrar |

**Recommendation:** Immediately check vastness.space, thevastness.space,
and solarvastness.space on Namecheap or Porkbun. .space domains are
inexpensive (often under \$2 for the first year).

4\. Functional Requirements

4.1 Core Visualization

1.  3D heliocentric view of the solar system with accurate orbital
    positions

2.  Planets rendered with realistic relative sizes and textures (or
    simplified spheres with labels)

3.  Sun rendered with accurate relative size and configurable
    luminosity/brightness glow

4.  Spacecraft markers with trajectories (past and predicted)

5.  Multi-scale camera system to handle distances from \<1 AU to \>100
    AU

6.  Free pan, zoom, orbit, and fly-to controls

4.2 Spacecraft & Object Interaction

7.  Selectable list of major deep-space missions (Voyager 1/2, New
    Horizons, Parker Solar Probe, Europa Clipper, JUICE, Lucy, Juno,
    etc.)

8.  Click or select to center camera on object and display info panel

9.  Info panel shows: current distance from Sun/Earth, light-time,
    velocity, mission status, launch date, primary science goals

10. Trajectory trail with adjustable time range

4.3 Time Control

11. Date/time picker (historical and future predictions)

12. Play/pause animation with variable speed

13. “Now” button to jump to current UTC time

4.4 Scale & Education Modes

14. True-scale mode (emphasizes emptiness)

15. Exaggerated-scale mode (planets enlarged for visibility)

16. Distance callouts and logarithmic scale indicator

17. “How vast is it?” educational overlay

5\. Non-Functional Requirements

- Performance: Smooth 60 fps on modern desktop; graceful degradation on
  mobile

- Data accuracy: Positions sourced from JPL Horizons (same system used
  by mission navigators)

- Accessibility: Keyboard navigation, screen-reader friendly labels,
  high-contrast mode

- Privacy: No user tracking; all data client-side or cached publicly

- Open source: MIT or Apache 2.0 license

- Hosting: Static site + optional serverless API proxy
  (Vercel/Cloudflare)

6\. Data Sources & APIs

|                      |                                                              |                               |
|----------------------|--------------------------------------------------------------|-------------------------------|
| **Source**           | **Data Provided**                                            | **Auth / Notes**              |
| JPL Horizons API     | Positions, velocities, trajectories for planets & spacecraft | Free, no key. Primary source. |
| SSD/CNEOS APIs       | Small bodies, close approaches, mission design               | Free, no key                  |
| NASA DONKI           | Space weather events                                         | Free NASA API key             |
| Public mission pages | Mission descriptions, status, science goals                  | Static / scraped once         |
| Standard constants   | Sun luminosity, planet radii, AU conversion                  | Hard-coded from IAU/NASA      |

7\. Technical Architecture

7.1 Recommended Stack

- Frontend: React + React Three Fiber (or vanilla Three.js)

- 3D Engine: Three.js with logarithmic depth buffer or multi-camera
  scale system

- Data fetching: Client-side fetch to Horizons API with local caching
  (IndexedDB or memory)

- Optional backend: Lightweight proxy (Cloudflare Workers / Vercel
  serverless) for CORS and rate limiting

- State management: Zustand or React context for selected object, time,
  camera mode

7.2 Key Technical Challenges

- Scale handling: Distances span \>10 orders of magnitude

- Horizon API rate limits and response parsing (text or JSON)

- Smooth camera transitions between objects at extreme distances

- Trajectory interpolation between discrete ephemeris points

8\. Initial Spacecraft Catalog

Priority missions available in Horizons (examples):

- Voyager 1 & 2 (interstellar)

- New Horizons (Kuiper Belt)

- Parker Solar Probe

- Europa Clipper, JUICE

- Juno (Jupiter)

- Lucy, Psyche, OSIRIS-APEX

- LRO, CAPSTONE (lunar)

9\. Development Roadmap

Phase 1 — MVP (4–6 weeks)

18. Basic Three.js scene with Sun + 8 planets

19. Horizons integration for planet positions

20. Camera controls and simple spacecraft markers

21. Static info panels

Phase 2 — Core Experience (4–8 weeks)

22. Full spacecraft catalog with trajectories

23. Time controls and animation

24. Multi-scale camera system

25. True vs. exaggerated scale toggle

Phase 3 — Polish & Expansion

26. Textures, lighting, and visual polish

27. Mobile support and performance optimization

28. Educational overlays and shareable views

29. Optional space-weather or radiation context

10\. Risks & Mitigations

|                                     |                                                                                      |
|-------------------------------------|--------------------------------------------------------------------------------------|
| **Risk**                            | **Mitigation**                                                                       |
| Horizons rate limits / availability | Aggressive client-side caching; optional proxy; fallback to pre-computed ephemerides |
| Scale visualization complexity      | Start with logarithmic or multi-view modes; iterate based on user feedback           |
| Domain availability                 | Secure a .space domain immediately; use temporary subdomain if needed                |
| Scope creep                         | Strict MVP definition; defer advanced features to Phase 3                            |

11\. Success Criteria

- Users can freely explore the solar system and view accurate spacecraft
  positions

- The sense of scale is communicated effectively (true-scale mode feels
  empty)

- Data matches Horizons within expected precision

- Tool is free, open-source, and runs in modern browsers

- Positive feedback on visual quality and educational value

*Document generated November 26, 2026. Data sources and domain status
should be re-verified before project kickoff.*
