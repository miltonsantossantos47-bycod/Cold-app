import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

/** @type {import('next').NextConfig} */
const nextConfig = {};

export default nextConfig;

// Dá acesso aos recursos do Cloudflare durante o `next dev` (necessário pelo @opennextjs/cloudflare).
initOpenNextCloudflareForDev();
