export const PLANET_ORBIT_SCALE = 1;
export const MOON_SPREAD = 1;
export const MOON_SIZE_SCALE = 1.15;

const minimumMoonRadius = 0.65;
const minimumMoonOrbitMultiplier = 1.6;
const progressiveOrbitGap = 0.18;

export const solarSystemConfig = {
  sun: { radius: 20, axialTilt: 7.25 },
  planets: [
    { id: 'mercury', radius: 3, orbitRadius: 70, eccentricity: 0.2056, ringInnerRadius: 0, ringOuterRadius: 0, axialTilt: 0.034, moons: [] },
    { id: 'venus', radius: 5, orbitRadius: 140, eccentricity: 0.0068, ringInnerRadius: 0, ringOuterRadius: 0, axialTilt: 177.4, moons: [] },
    { id: 'earth', radius: 5.5, orbitRadius: 230, eccentricity: 0.0167, ringInnerRadius: 0, ringOuterRadius: 0, axialTilt: 23.44, moons: [
      { name: 'Moon', color: 0xd9dce2, sizeRatio: 0.14, orbitMultiplier: 2.2, inclination: 2.1, phase: 0.4, speed: (2 * Math.PI) / 19 },
    ] },
    { id: 'mars', radius: 4, orbitRadius: 330, eccentricity: 0.0934, ringInnerRadius: 0, ringOuterRadius: 0, axialTilt: 25.19, moons: [
      { name: 'Phobos', color: 0xaaa59b, sizeRatio: 0.075, orbitMultiplier: 1.8, inclination: -2.4, phase: 0.3, speed: (2 * Math.PI) / 12 },
      { name: 'Deimos', color: 0xc4b9a9, sizeRatio: 0.055, orbitMultiplier: 2.6, inclination: 3.2, phase: 2.2, speed: (2 * Math.PI) / 17 },
    ] },
    { id: 'jupiter', radius: 16, orbitRadius: 560, eccentricity: 0.0484, ringInnerRadius: 0, ringOuterRadius: 0, axialTilt: 3.13, moons: [
      { name: 'Io', color: 0xd8b967, sizeRatio: 0.1, orbitMultiplier: 1.7, inclination: 1.8, phase: 0.2, speed: (2 * Math.PI) / 12 },
      { name: 'Europa', color: 0xd8c9aa, sizeRatio: 0.085, orbitMultiplier: 2.2, inclination: -2.7, phase: 1.4, speed: (2 * Math.PI) / 16 },
      { name: 'Ganymede', color: 0x9a8972, sizeRatio: 0.145, orbitMultiplier: 2.8, inclination: 3.4, phase: 2.9, speed: (2 * Math.PI) / 22 },
      { name: 'Callisto', color: 0x766f68, sizeRatio: 0.12, orbitMultiplier: 3.5, inclination: -1.9, phase: 4.3, speed: (2 * Math.PI) / 28 },
    ] },
    { id: 'saturn', radius: 14, orbitRadius: 820, eccentricity: 0.0539, ringInnerRadius: 15, ringOuterRadius: 28, axialTilt: 26.73, moons: [
      { name: 'Enceladus', color: 0xe1e3dd, sizeRatio: 0.065, orbitMultiplier: 1.5, inclination: -2.1, phase: 5.3, speed: (2 * Math.PI) / 11 },
      { name: 'Dione', color: 0xc8c4b9, sizeRatio: 0.075, orbitMultiplier: 1.8, inclination: 2.8, phase: 4.1, speed: (2 * Math.PI) / 14 },
      { name: 'Rhea', color: 0xb6b2a9, sizeRatio: 0.09, orbitMultiplier: 2.2, inclination: -3.3, phase: 2.3, speed: (2 * Math.PI) / 17 },
      { name: 'Titan', color: 0xd8a956, sizeRatio: 0.14, orbitMultiplier: 2.8, inclination: 1.7, phase: 0.6, speed: (2 * Math.PI) / 24 },
    ] },
    { id: 'uranus', radius: 9, orbitRadius: 1100, eccentricity: 0.0473, ringInnerRadius: 11, ringOuterRadius: 16, axialTilt: 97.77, moons: [
      { name: 'Miranda', color: 0xa8a59c, sizeRatio: 0.055, orbitMultiplier: 1.7, inclination: -2.2, phase: 0.4, speed: (2 * Math.PI) / 12 },
      { name: 'Ariel', color: 0xc2bfb7, sizeRatio: 0.07, orbitMultiplier: 2.1, inclination: 2.9, phase: 1.6, speed: (2 * Math.PI) / 16 },
      { name: 'Umbriel', color: 0x77756f, sizeRatio: 0.075, orbitMultiplier: 2.6, inclination: -3.6, phase: 2.8, speed: (2 * Math.PI) / 20 },
      { name: 'Titania', color: 0xaaa69d, sizeRatio: 0.1, orbitMultiplier: 3.2, inclination: 1.9, phase: 4.1, speed: (2 * Math.PI) / 25 },
      { name: 'Oberon', color: 0x908d84, sizeRatio: 0.09, orbitMultiplier: 3.9, inclination: -2.6, phase: 5.4, speed: (2 * Math.PI) / 30 },
    ] },
    { id: 'neptune', radius: 8.8, orbitRadius: 1400, eccentricity: 0.0086, ringInnerRadius: 0, ringOuterRadius: 0, axialTilt: 28.32, moons: [
      { name: 'Triton', color: 0xc4d0d0, sizeRatio: 0.12, orbitMultiplier: 2.4, inclination: 2.5, phase: 0.9, speed: (2 * Math.PI) / 22 },
    ] },
  ],
};

function buildMoonLayout(planet, spread) {
  const clearanceRadius = Math.max(planet.radius, planet.ringOuterRadius);
  const moons = [...planet.moons]
    .sort((a, b) => a.orbitMultiplier - b.orbitMultiplier)
    .map((moon) => ({
      ...moon,
      radius: Math.min(
        planet.radius * 0.32,
        Math.max(minimumMoonRadius, planet.radius * moon.sizeRatio * MOON_SIZE_SCALE),
      ),
    }));

  let previousOrbitRadius = 0;
  let previousGap = 0;
  const laidOutMoons = moons.map((moon, index) => {
    const requestedOrbit = clearanceRadius * (1 + (moon.orbitMultiplier - 1) * spread);
    let orbitRadius = Math.max(clearanceRadius * minimumMoonOrbitMultiplier, requestedOrbit);
    if (index > 0) {
      const requiredGap = Math.max(
        3 * Math.max(moons[index - 1].radius, moon.radius) + index * progressiveOrbitGap,
        previousGap + progressiveOrbitGap,
      );
      orbitRadius = Math.max(orbitRadius, previousOrbitRadius + requiredGap);
    }
    const actualGap = index ? orbitRadius - previousOrbitRadius : 0;
    previousOrbitRadius = orbitRadius;
    previousGap = actualGap;
    return { ...moon, orbitRadius };
  });

  const outermostMoon = laidOutMoons.at(-1);
  const territoryRadius = Math.max(
    clearanceRadius,
    outermostMoon ? outermostMoon.orbitRadius + outermostMoon.radius : clearanceRadius,
  );
  return { clearanceRadius, moons: laidOutMoons, territoryRadius };
}

function moonSpreadThatFits(planet, availableRadius) {
  const fits = (spread) => buildMoonLayout(planet, spread).territoryRadius <= availableRadius;
  if (fits(MOON_SPREAD)) return MOON_SPREAD;
  if (!fits(0)) return null;

  let low = 0;
  let high = MOON_SPREAD;
  for (let iteration = 0; iteration < 36; iteration++) {
    const middle = (low + high) / 2;
    if (fits(middle)) low = middle;
    else high = middle;
  }
  return low;
}

export function computeLayout(config = solarSystemConfig) {
  const orbitScale = PLANET_ORBIT_SCALE;
  const planets = config.planets.map((planet) => ({
    ...planet,
    orbitRadius: planet.orbitRadius * orbitScale,
  }));
  const firstPlanet = planets[0];
  const firstOrbitPerihelion = firstPlanet.orbitRadius * (1 - firstPlanet.eccentricity);
  const safeFirstOrbit = (config.sun.radius + firstPlanet.radius + 1) / (1 - firstPlanet.eccentricity);
  if (firstOrbitPerihelion <= config.sun.radius + firstPlanet.radius) {
    const shift = safeFirstOrbit - firstPlanet.orbitRadius;
    planets.forEach((planet) => { planet.orbitRadius += shift; });
  }
  const gapToPrevious = (index) => index === 0
    ? planets[index].orbitRadius * (1 - planets[index].eccentricity) - config.sun.radius
    : planets[index].orbitRadius * (1 - planets[index].eccentricity)
      - planets[index - 1].orbitRadius * (1 + planets[index - 1].eccentricity);
  const gapToNext = (index) => index === planets.length - 1
    ? Number.POSITIVE_INFINITY
    : planets[index + 1].orbitRadius * (1 - planets[index + 1].eccentricity)
      - planets[index].orbitRadius * (1 + planets[index].eccentricity);

  // First fit each moon system into the collision budget available from its
  // current neighboring orbits. If that is impossible, open only the nearest
  // gap and carry the outer planets with it so orbital order is preserved.
  for (let pass = 0; pass < 24; pass++) {
    let widened = false;
    for (let index = 0; index < planets.length; index++) {
      const planet = planets[index];
      if (!planet.moons.length) continue;
      const leftGap = gapToPrevious(index);
      const rightGap = gapToNext(index);
      const nearestGap = Math.min(leftGap, rightGap);
      const availableRadius = nearestGap * 0.25;
      const spread = moonSpreadThatFits(planet, availableRadius);
      if (spread !== null) continue;

      const requiredRadius = buildMoonLayout(planet, 0).territoryRadius;
      const targetGap = requiredRadius * 4 + 0.01;
      if (leftGap <= rightGap && index > 0) {
        const shift = (targetGap - leftGap) / (1 - planet.eccentricity);
        for (let moveIndex = index; moveIndex < planets.length; moveIndex++) {
          planets[moveIndex].orbitRadius += shift;
        }
      } else if (index < planets.length - 1) {
        const nextPlanet = planets[index + 1];
        const shift = (targetGap - rightGap) / (1 - nextPlanet.eccentricity);
        for (let moveIndex = index + 1; moveIndex < planets.length; moveIndex++) {
          planets[moveIndex].orbitRadius += shift;
        }
      }
      widened = true;
    }

    // Preserve progressively larger gaps after any local widening.
    let previousGap = 0;
    for (let index = 1; index < planets.length; index++) {
      let gap = planets[index].orbitRadius - planets[index - 1].orbitRadius;
      const progressiveMinimum = previousGap * 1.04;
      if (gap < progressiveMinimum) {
        const shift = progressiveMinimum - gap;
        for (let moveIndex = index; moveIndex < planets.length; moveIndex++) {
          planets[moveIndex].orbitRadius += shift;
        }
        gap = progressiveMinimum;
        widened = true;
      }
      previousGap = gap;
    }
    if (!widened) break;
  }

  const laidOutPlanets = planets.map((planet, index) => {
    const leftGap = gapToPrevious(index);
    const rightGap = gapToNext(index);
    const nearestGap = Math.min(leftGap, rightGap);
    const spread = moonSpreadThatFits(planet, nearestGap * 0.25);
    const finalSpread = spread ?? 0;
    const moonLayout = buildMoonLayout(planet, finalSpread);
    const collisionLimit = nearestGap * 0.25;

    if (import.meta.env?.DEV && moonLayout.territoryRadius > collisionLimit + 1e-5) {
      console.warn(`[orbits] ${planet.id}: moon territory exceeds 25% of the nearest orbital gap.`);
    }
    if (import.meta.env?.DEV && planet.orbitRadius * (1 - planet.eccentricity) - planet.radius <= config.sun.radius) {
      console.warn(`[orbits] ${planet.id}: planetary orbit intersects the Sun surface.`);
    }
    if (import.meta.env?.DEV && planet.ringOuterRadius > moonLayout.territoryRadius + 1e-5) {
      console.warn(`[orbits] ${planet.id}: ring extends outside its territory.`);
    }

    return {
      ...planet,
      ...moonLayout,
      moonSpread: finalSpread,
      leftGap,
      rightGap,
      nearestGap,
      collisionLimit,
    };
  });

  return {
    sunRadius: config.sun.radius,
    planets: laidOutPlanets,
    systemExtent: Math.max(...laidOutPlanets.map((planet) => planet.orbitRadius * (1 + planet.eccentricity) + planet.territoryRadius)),
  };
}
