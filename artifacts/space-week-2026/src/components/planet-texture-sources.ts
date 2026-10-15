const textureRoot = 'https://www.solarsystemscope.com/textures/download';
const earthTextureRoot = `${import.meta.env.BASE_URL}textures/earth`;

const surfaceFiles: Record<string, string> = {
  sun: 'sun',
  mercury: 'mercury',
  venus: 'venus_surface',
  mars: 'mars',
  jupiter: 'jupiter',
  saturn: 'saturn',
  uranus: 'uranus',
  neptune: 'neptune',
};

export function planetSurfaceTextureUrl(id: string, resolution: '2k' | '4k' = '2k') {
  if (id === 'earth') {
    return `${earthTextureRoot}/${resolution === '4k' ? '4k_earth_daymap.jpg' : '2k_earth_daymap.jpg'}`;
  }
  const file = surfaceFiles[id];
  return file ? `${textureRoot}/${resolution}_${file}.jpg` : null;
}

export const planetExtraTextureUrls = {
  earthClouds: `${earthTextureRoot}/2k_earth_clouds.jpg`,
  earthNight: `${earthTextureRoot}/2k_earth_nightmap.jpg`,
  earthNormal: `${earthTextureRoot}/2k_earth_normal_map.png`,
  earthSpecular: `${earthTextureRoot}/2k_earth_specular_map.png`,
  venusClouds: `${textureRoot}/2k_venus_atmosphere.jpg`,
  saturnRings: `${textureRoot}/2k_saturn_ring_alpha.png`,
  moon: `${textureRoot}/2k_moon.jpg`,
};
