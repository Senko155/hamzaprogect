import * as THREE from 'three';

export type PlanetSpec = {
  id: string;
  name: string;
  color: number;
  size: number;
  a: number;
  e: number;
  inclination: number;
  longitude: number;
  longitudeRate: number;
  perihelion: number;
  perihelionRate: number;
  node: number;
  rotation: number;
};

// Approximate J2000 mean orbital elements and secular rates (degrees/century).
// This is the single source of truth for both the home scene and science explorer.
export const planets: PlanetSpec[] = [
  { id: 'mercury', name: 'عطارد', color: 0xaaa9b0, size: .17, a: .3871, e: .2056, inclination: 7.005, longitude: 252.2503, longitudeRate: 149472.6741, perihelion: 77.4578, perihelionRate: .1605, node: 48.3308, rotation: .004 },
  { id: 'venus', name: 'الزهرة', color: 0xe8b985, size: .25, a: .7233, e: .0068, inclination: 3.395, longitude: 181.9791, longitudeRate: 58517.8154, perihelion: 131.6025, perihelionRate: .0027, node: 76.6798, rotation: -.002 },
  { id: 'earth', name: 'الأرض', color: 0x3b9fff, size: .31, a: 1.0000, e: .0167, inclination: 0, longitude: 100.4646, longitudeRate: 35999.3724, perihelion: 102.9377, perihelionRate: .3233, node: 0, rotation: .009 },
  { id: 'mars', name: 'المريخ', color: 0xe76e58, size: .23, a: 1.5237, e: .0934, inclination: 1.850, longitude: -4.5534, longitudeRate: 19140.3027, perihelion: -23.9436, perihelionRate: .4444, node: 49.5595, rotation: .008 },
  { id: 'jupiter', name: 'المشتري', color: 0xd6b391, size: .58, a: 5.2029, e: .0484, inclination: 1.304, longitude: 34.3964, longitudeRate: 3034.7461, perihelion: 14.7285, perihelionRate: .2125, node: 100.4739, rotation: .006 },
  { id: 'saturn', name: 'زحل', color: 0xd8ca9e, size: .49, a: 9.5367, e: .0539, inclination: 2.486, longitude: 49.9542, longitudeRate: 1222.4936, perihelion: 92.5989, perihelionRate: -.4190, node: 113.6624, rotation: .005 },
  { id: 'uranus', name: 'أورانوس', color: 0x8bd8dc, size: .39, a: 19.1892, e: .0473, inclination: .773, longitude: 313.2381, longitudeRate: 428.4820, perihelion: 170.9543, perihelionRate: .4081, node: 74.0169, rotation: .004 },
  { id: 'neptune', name: 'نبتون', color: 0x627bff, size: .38, a: 30.0699, e: .0086, inclination: 1.770, longitude: -55.1200, longitudeRate: 218.4595, perihelion: 44.9648, perihelionRate: -.3224, node: 131.7842, rotation: .004 },
];

export const J2000_EPOCH = Date.UTC(2000, 0, 1, 12);
export const CENTURY_MS = 86400000 * 36525;
export const visualSemiMajorAxis = (a: number) => 2 + Math.log(a / .3871) * 1.78;

export function orbitalPoint(spec: PlanetSpec, trueAnomaly: number, centuries: number): THREE.Vector3 {
  const semiMajor = visualSemiMajorAxis(spec.a);
  const perihelion = THREE.MathUtils.degToRad(spec.perihelion + spec.perihelionRate * centuries);
  const node = THREE.MathUtils.degToRad(spec.node);
  const inclination = THREE.MathUtils.degToRad(spec.inclination);
  const radius = (semiMajor * (1 - spec.e * spec.e)) / (1 + spec.e * Math.cos(trueAnomaly));
  const argumentOfLatitude = trueAnomaly + perihelion - node;
  const xPlane = radius * Math.cos(argumentOfLatitude);
  const yPlane = radius * Math.sin(argumentOfLatitude);
  return new THREE.Vector3(
    xPlane * Math.cos(node) - yPlane * Math.sin(node) * Math.cos(inclination),
    xPlane * Math.sin(node) + yPlane * Math.cos(node) * Math.cos(inclination),
    yPlane * Math.sin(inclination),
  );
}

export function positionFor(spec: PlanetSpec, centuries: number): THREE.Vector3 {
  const longitude = spec.longitude + spec.longitudeRate * centuries;
  const perihelion = spec.perihelion + spec.perihelionRate * centuries;
  const mean = THREE.MathUtils.degToRad(longitude - perihelion);
  let eccentric = mean;
  for (let i = 0; i < 4; i++) eccentric -= (eccentric - spec.e * Math.sin(eccentric) - mean) / (1 - spec.e * Math.cos(eccentric));
  const trueAnomaly = Math.atan2(
    Math.sqrt(1 - spec.e * spec.e) * Math.sin(eccentric),
    Math.cos(eccentric) - spec.e,
  );
  return orbitalPoint(spec, trueAnomaly, centuries);
}
