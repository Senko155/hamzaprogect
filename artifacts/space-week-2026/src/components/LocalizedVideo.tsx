import { useEffect, useRef, useState } from 'react';
import { CirclePlay } from 'lucide-react';

export function resolveVideoSource(raw: string): { kind: 'youtube' | 'mp4'; src: string } | null {
  const value = raw.trim();
  if (!value) return null;
  try {
    const url = new URL(value, window.location.origin);
    const host = url.hostname.toLowerCase();
    const isYouTube = host === 'youtu.be' || host === 'youtube.com' || host.endsWith('.youtube.com')
      || host === 'youtube-nocookie.com' || host.endsWith('.youtube-nocookie.com');
    if (isYouTube) {
      const parts = url.pathname.split('/').filter(Boolean);
      const id = host === 'youtu.be'
        ? parts[0]
        : url.searchParams.get('v') || (['embed', 'shorts', 'live', 'v'].includes(parts[0] ?? '') ? parts[1] : parts.at(-1));
      if (!id || !/^[\w-]{11}$/.test(id)) return null;
      const embed = new URL(`https://www.youtube-nocookie.com/embed/${id}`);
      embed.searchParams.set('enablejsapi', '1');
      embed.searchParams.set('rel', '0');
      embed.searchParams.set('origin', window.location.origin);
      return { kind: 'youtube', src: embed.href };
    }
    const isLocalVideo = url.origin === window.location.origin
      && url.pathname.startsWith('/videos/')
      && /\.mp4$/i.test(url.pathname)
      && !url.pathname.split('/').includes('..');
    const isRemoteMp4 = url.origin !== window.location.origin && /\.mp4$/i.test(url.pathname)
      && (url.protocol === 'https:' || url.protocol === 'http:');
    if ((isLocalVideo || isRemoteMp4) && (url.protocol === 'https:' || url.protocol === 'http:')) {
      return { kind: 'mp4', src: url.href };
    }
    return null;
  } catch {
    return null;
  }
}

export default function LocalizedVideo({
  raw,
  title,
  emptyLabel,
  placeholderClassName,
  mediaClassName,
  testId,
}: {
  raw: string;
  title: string;
  emptyLabel: string;
  placeholderClassName: string;
  mediaClassName: string;
  testId: string;
}) {
  const source = resolveVideoSource(raw);
  const videoRef = useRef<HTMLVideoElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [failed, setFailed] = useState(false);
  const [useWebmFallback, setUseWebmFallback] = useState(false);
  const webmFallback = source?.kind === 'mp4'
    && source.src.startsWith(`${window.location.origin}/videos/`)
    && /\.mp4$/i.test(source.src)
    ? source.src.replace(/\.mp4$/i, '.webm')
    : null;

  useEffect(() => {
    const video = videoRef.current;
    const iframe = iframeRef.current;
    setFailed(false);
    setUseWebmFallback(false);
    return () => {
      if (video) {
        video.pause();
      }
      if (iframe?.contentWindow) {
        iframe.contentWindow.postMessage(JSON.stringify({
          event: 'command',
          func: 'stopVideo',
          args: [],
        }), 'https://www.youtube-nocookie.com');
      }
    };
  }, [source?.src]);

  if (source?.kind === 'youtube' && !failed) {
    return (
      <iframe
        className={mediaClassName}
        ref={iframeRef}
        src={source.src}
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        data-testid={testId}
      />
    );
  }
  if (source?.kind === 'mp4' && !failed) {
    return (
      <video
        className={mediaClassName}
        ref={videoRef}
        src={useWebmFallback && webmFallback ? webmFallback : source.src}
        controls
        playsInline
        preload="metadata"
        aria-label={title}
        data-testid={testId}
        onError={() => {
          videoRef.current?.pause();
          if (webmFallback && !useWebmFallback) setUseWebmFallback(true);
          else setFailed(true);
        }}
      />
    );
  }
  return (
    <div className={placeholderClassName} data-testid={`${testId}-placeholder`}>
      <CirclePlay size={33} strokeWidth={1.4} aria-hidden="true" />
      <span>{emptyLabel}</span>
    </div>
  );
}
