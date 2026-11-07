import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Sem cache incremental (R2): o Cold não usa páginas regeneradas periodicamente (ISR);
// as rotas da API e as páginas com dados são todas dinâmicas.
export default defineCloudflareConfig({});
