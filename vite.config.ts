import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Aplicação inteiramente estática: sem backend, sem API, sem banco de dados.
// O conteúdo decisório vive em src/conteudo/*.json e é empacotado no build.
export default defineConfig({
  // Caminhos relativos no HTML gerado (`./assets/...` em lugar de `/assets/...`),
  // para que o `dist/` funcione servido da raiz de um domínio ou de qualquer
  // subdiretório — caso de GitHub Pages, de pasta em servidor institucional ou de
  // pen drive servido localmente. Publicação estática, sem reescrita de URL.
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    // Os JSON de src/conteudo são importados por src/dominio/carga.ts e entram
    // embutidos no bundle: não há requisição de rede em tempo de execução, então
    // o pacote não depende de MIME type nem de pasta public/.
    assetsDir: 'assets',
  },
  test: {
    // Ambiente de testes de componente (React) e de módulos de domínio.
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/teste/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    css: false,
  },
});
