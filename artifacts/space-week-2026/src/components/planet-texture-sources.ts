const textureRoot = 'https://www.solarsystemscope.com/textures/download';

const surfaceFiles: Record<string, string> = {
  sun: 'sun',
  mercury: 'mercury',
  venus: 'venus_surface',
  earth: 'earth_daymap',
  mars: 'mars',
  jupiter: 'jupiter',
  saturn: 'saturn',
  uranus: 'uranus',
  neptune: 'neptune',
};

export function planetSurfaceTextureUrl(id: string, resolution: '2k' | '4k' = '2k') {
  const file = surfaceFiles[id];
  return file ? `${textureRoot}/${resolution}_${file}.jpg` : null;
}

export const planetExtraTextureUrls = {
  earthClouds: `${textureRoot}/2k_earth_clouds.jpg`,
  earthNight: `${textureRoot}/2k_earth_nightmap.jpg`,
  venusClouds: `${textureRoot}/2k_venus_atmosphere.jpg`,
  saturnRings: `${textureRoot}/2k_saturn_ring_alpha.png`,
  moon: `${textureRoot}/2k_moon.jpg`,
};
