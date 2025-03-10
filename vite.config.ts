/// <reference types="vitest" />
import { defineConfig, loadEnv, Plugin } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

// Plugin to replace CSP placeholder
function cspPlugin(isDev: boolean): Plugin {
  return {
    name: 'vite-plugin-csp',
    transformIndexHtml(html) {
      return html.replace(
        '%VITE_CSP_SCRIPT_SRC%',
        isDev ? "'unsafe-eval'" : ''
      );
    },
  };
}

export default defineConfig(({ mode }) => {
  const isDev = mode === 'development';
  
  // Base CSP directives that are common between dev and prod
  const baseCSP = {
    'default-src': ["'self'"],
    'connect-src': [
      "'self'",
      // WalletConnect
      "https://*.walletconnect.org",
      "wss://*.walletconnect.org",
      "https://*.walletconnect.com",
      "wss://*.walletconnect.com",
      "https://explorer-api.walletconnect.com",
      // Development endpoints
      ...(isDev ? [
        "http://127.0.0.1:8545/",
        "ws://127.0.0.1:8545/",
        "http://localhost:8545/",
        "ws://localhost:8545/",
        "http://127.0.0.1:*",
        "ws://127.0.0.1:*",
        "http://localhost:*",
        "ws://localhost:*"
      ] : []),
      // Additional services
      "https://*.merkle.io",
      "https://*.infura.io",
      "wss://*.infura.io",
      "https://*.alchemyapi.io",
      "wss://*.alchemyapi.io",
      "https://eth-mainnet.g.alchemy.com",
      "https://polygon-mainnet.g.alchemy.com"
    ],
    'font-src': ["'self'", "data:", "https://fonts.googleapis.com", "https://rsms.me"],
    'script-src': [
      "'self'",
      ...(isDev ? ["'unsafe-eval'", "'unsafe-inline'"] : ["'unsafe-inline'"]),
    ],
    'style-src': ["'self'", "'unsafe-inline'", "https://rsms.me"],
    'img-src': ["'self'", "data:", "https:", "blob:"],
    'media-src': ["'self'", "blob:"],
    'worker-src': ["'self'", "blob:"],
    'frame-src': ["'self'", "https://*.walletconnect.org", "https://*.walletconnect.com"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"]
  };

  // Convert CSP object to string
  const cspString = Object.entries(baseCSP)
    .map(([key, values]) => `${key} ${values.join(' ')}`)
    .join('; ');

  return {
    base: '/',
    plugins: [
      react(),
      cspPlugin(isDev)
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@/components': path.resolve(__dirname, './src/components'),
        '@/lib': path.resolve(__dirname, './src/lib'),
        '@/hooks': path.resolve(__dirname, './src/hooks')
      },
    },
    build: {
      target: 'es2020',
      outDir: 'dist',
      sourcemap: true,
      assetsDir: 'assets',
      modulePreload: {
        polyfill: true
      },
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html')
        },
        output: {
          manualChunks: {
            'react-vendor': ['react', 'react-dom', 'react-router-dom'],
            'web3-vendor': ['@rainbow-me/rainbowkit', 'wagmi', 'viem'],
            'ui-vendor': ['framer-motion', '@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu'],
          },
          format: 'es',
          entryFileNames: 'assets/[name]-[hash].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]'
        },
        external: [/particle-core\/.*/]
      },
    },
    optimizeDeps: {
      esbuildOptions: {
        target: 'es2020',
      },
    },
    server: {
      port: 5173,
      strictPort: true,
      host: true,
      open: true,
      middlewareMode: false,
      cors: true,
      proxy: {
        '/local-node': {
          target: 'http://127.0.0.1:8545',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/local-node/, '')
        }
      },
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/javascript',
        'Content-Security-Policy': cspString
      }
    },
    preview: {
      port: 4173,
      strictPort: true,
      host: true,
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      css: true,
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json', 'html'],
        exclude: [
          'node_modules/',
          'src/test/',
        ]
      }
    }
  };
}); 