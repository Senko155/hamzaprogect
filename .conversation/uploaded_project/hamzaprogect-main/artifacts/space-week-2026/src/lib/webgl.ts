let webglAvailable: boolean | null = null;

export function canCreateWebGLContext(): boolean {
  if (webglAvailable !== null) return webglAvailable;

  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    webglAvailable = context !== null;
    context?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    webglAvailable = false;
  }

  return webglAvailable;
}
