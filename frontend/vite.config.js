import path from "path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), "");
    const devPort = Number(env.VITE_DEV_PORT || 5174);
    const isDev = mode === "development";

    return {
        plugins: [react()],
        resolve: {
            alias: {
                "@": path.resolve(__dirname, "./resources/js"),
            },
        },
        base: isDev ? "/" : "/Student%20Attedance%20Analytics/public/",
        build: {
            outDir: path.resolve(__dirname, "../public"),
            emptyOutDir: true,
        },
        appType: "spa",
        server: {
            host: "0.0.0.0",
            port: devPort,
            strictPort: false,
            hmr: {
                protocol: "ws",
                host: env.VITE_HMR_HOST || undefined,
            },
        },
    };
});
