import fs from "fs";

const html = fs.readFileSync("referencia/pagina-vendas-referencia.html", "utf8");
const emblem = html.match(/nav-mark[^>]+src="data:image\/png;base64,([^"]+)"/);
const wordHero = html.match(
  /class="hero"[\s\S]*?<img[^>]+src="data:image\/png;base64,([^"]+)"/
);
if (!emblem || !wordHero) {
  console.error("extract failed");
  process.exit(1);
}
fs.mkdirSync("public", { recursive: true });
fs.mkdirSync("referencia", { recursive: true });
const emblemBuf = Buffer.from(emblem[1], "base64");
const wordBuf = Buffer.from(wordHero[1], "base64");
for (const dir of ["public", "referencia"]) {
  fs.writeFileSync(`${dir}/cold-logo-emblem.png`, emblemBuf);
  fs.writeFileSync(`${dir}/cold-logo-wordmark.png`, wordBuf);
}
console.log("logos written");
