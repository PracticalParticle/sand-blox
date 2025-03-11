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
  
  // Define your Ganache endpoint
  const GANACHE_ENDPOINT = 'remote-ganache-1.tailb0865.ts.net';
  const GANACHE_DOMAIN = GANACHE_ENDPOINT.split('.').slice(1).join('.');
  
  const baseCSP = {
    'default-src': [
      "'self'",
      `https://${GANACHE_ENDPOINT}`,
      `https://*.${GANACHE_DOMAIN}`
    ],
    'connect-src': [
      "'self'",
      // Ganache specific endpoints with full coverage
      `https://${GANACHE_ENDPOINT}`,
      `wss://${GANACHE_ENDPOINT}`,
      `https://*.${GANACHE_DOMAIN}`,
      `wss://*.${GANACHE_DOMAIN}`,
      // Development allowances
      ...(isDev ? [
        "*",  // Allow all connections in development
        "ws://*",
        "wss://*"
      ] : []),
      // WalletConnect
      "https://*.walletconnect.org",
      "wss://*.walletconnect.org",
      "https://*.walletconnect.com",
      "wss://*.walletconnect.com",
      "https://explorer-api.walletconnect.com",
      // Development endpoints
      ...(isDev ? [
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
    'script-src': [
      "'self'",
      "'unsafe-inline'",
      ...(isDev ? ["'unsafe-eval'", "*"] : [])
    ],
    'style-src': ["'self'", "'unsafe-inline'", "https:", "http:"],
    'img-src': ["'self'", "data:", "https:", "http:", "blob:"],
    'media-src': ["'self'", "blob:", "https:", "http:"],
    'worker-src': ["'self'", "blob:"],
    'frame-src': ["'self'", "https:", "http:"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"]
  };

  // Convert CSP object to string with semicolon delimiter
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
      extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json']
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
        preserveEntrySignatures: 'strict'
      },
      assetsInclude: ['**/*.sol', '**/*.abi.json', '**/*.bin', '**/*.md'],
    },
    optimizeDeps: {
      esbuildOptions: {
        target: 'es2020',
      },
      include: ['particle-core']
    },
    server: {
      port: 5173,
      strictPort: true,
      host: true,
      open: true,
      middlewareMode: false,
      cors: {
        origin: '*',  // More permissive for development
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        credentials: true,
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
      },
      proxy: {
        '/local-node': {
          target: 'http://127.0.0.1:8545',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/local-node/, '')
        },
        '/remote-ganache': {
          target: `https://${GANACHE_ENDPOINT}`,
          changeOrigin: true,
          secure: true,
          ws: true
        }
      },
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Resource-Policy': 'cross-origin',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Content-Security-Policy': isDev ? 
          // Development CSP - more permissive
          "default-src * 'unsafe-inline' 'unsafe-eval'; connect-src * 'unsafe-eval' ws: wss:; script-src * 'unsafe-inline' 'unsafe-eval'; style-src * 'unsafe-inline';" :
          // Production CSP - strict
          cspString
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