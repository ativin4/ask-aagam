import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Ask-aagam',
    short_name: 'Askaagam',
    description: 'An offline-capable AI book reader',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#000000',
    icons: [
      {
        src: '/ask-aagam.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/ask-aagam.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  }
}