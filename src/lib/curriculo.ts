// Currículo piloto do Cold: Área → Fase → Módulo → Lição.
// Só as fases com ativa=true são ensinadas. As outras aparecem como mapa do percurso.
// As outras áreas não precisam de estar aqui: ver percursoLivre.
// Ids: area-fase.módulo.lição (ex.: fis-1.2.3 = Física, Fase 1, Módulo 2, Lição 3).
export type Licao = { id: string; titulo: string; prerequisitos: string[] };
export type Modulo = { id: string; titulo: string; licoes: Licao[] };
export type Fase = { id: string; titulo: string; semanas: string; ativa: boolean; modulos: Modulo[] };
export type Area = { id: "mat" | "fis"; area: string; fases: Fase[] };

export const CURRICULO: Area[] = [
  {
    id: "mat",
    area: "Matemática",
    fases: [
      {
        id: "mat-1",
        titulo: "Base Sólida",
        semanas: "1-12",
        ativa: true,
        modulos: [
          {
            id: "mat-1.1",
            titulo: "Números e frações",
            licoes: [
              { id: "mat-1.1.1", titulo: "Números e operações", prerequisitos: [] },
              { id: "mat-1.1.2", titulo: "Frações: o que são e para que servem", prerequisitos: ["mat-1.1.1"] },
              { id: "mat-1.1.3", titulo: "Operações com frações", prerequisitos: ["mat-1.1.2"] },
            ],
          },
          {
            id: "mat-1.2",
            titulo: "Proporções",
            licoes: [
              { id: "mat-1.2.1", titulo: "Razão e proporção", prerequisitos: ["mat-1.1.3"] },
              { id: "mat-1.2.2", titulo: "Regra de três e percentagens", prerequisitos: ["mat-1.2.1"] },
            ],
          },
          {
            id: "mat-1.3",
            titulo: "Potências e raízes",
            licoes: [
              { id: "mat-1.3.1", titulo: "Potências e as suas propriedades", prerequisitos: ["mat-1.1.3"] },
              { id: "mat-1.3.2", titulo: "Raízes e radicais", prerequisitos: ["mat-1.3.1"] },
            ],
          },
          {
            id: "mat-1.4",
            titulo: "Expressões algébricas",
            licoes: [
              { id: "mat-1.4.1", titulo: "Variáveis e expressões", prerequisitos: ["mat-1.3.1"] },
              { id: "mat-1.4.2", titulo: "Produtos notáveis e fatorização", prerequisitos: ["mat-1.4.1"] },
            ],
          },
          {
            id: "mat-1.5",
            titulo: "Equações",
            licoes: [
              { id: "mat-1.5.1", titulo: "Equações do 1.º grau", prerequisitos: ["mat-1.4.1"] },
              { id: "mat-1.5.2", titulo: "Inequações do 1.º grau", prerequisitos: ["mat-1.5.1"] },
              { id: "mat-1.5.3", titulo: "Equações do 2.º grau", prerequisitos: ["mat-1.4.2", "mat-1.3.2", "mat-1.5.1"] },
            ],
          },
          {
            id: "mat-1.6",
            titulo: "Funções",
            licoes: [
              { id: "mat-1.6.1", titulo: "A ideia de função", prerequisitos: ["mat-1.5.1"] },
              { id: "mat-1.6.2", titulo: "Função afim e o seu gráfico", prerequisitos: ["mat-1.6.1"] },
              { id: "mat-1.6.3", titulo: "Função quadrática e o seu gráfico", prerequisitos: ["mat-1.6.2", "mat-1.5.3"] },
            ],
          },
          {
            id: "mat-1.7",
            titulo: "Geometria básica",
            licoes: [
              { id: "mat-1.7.1", titulo: "Áreas e perímetros", prerequisitos: ["mat-1.1.3"] },
              { id: "mat-1.7.2", titulo: "Teorema de Pitágoras", prerequisitos: ["mat-1.3.2", "mat-1.7.1"] },
              {
                id: "mat-1.7.3",
                titulo: "Trigonometria no triângulo retângulo (seno, cosseno, tangente)",
                prerequisitos: ["mat-1.7.2", "mat-1.2.1"],
              },
            ],
          },
        ],
      },
      { id: "mat-2", titulo: "Pré-Cálculo", semanas: "13-24", ativa: false, modulos: [] },
      { id: "mat-3", titulo: "Cálculo", semanas: "25-52", ativa: false, modulos: [] },
      { id: "mat-4", titulo: "Matemática para Engenharia", semanas: "53-78", ativa: false, modulos: [] },
    ],
  },
  {
    id: "fis",
    area: "Física",
    fases: [
      {
        id: "fis-1",
        titulo: "Fundamentos",
        semanas: "1-12",
        ativa: true,
        modulos: [
          {
            id: "fis-1.1",
            titulo: "Medidas, SI e notação científica",
            licoes: [
              { id: "fis-1.1.1", titulo: "Grandezas e unidades", prerequisitos: [] },
              { id: "fis-1.1.2", titulo: "O Sistema Internacional e conversão de unidades", prerequisitos: ["fis-1.1.1", "mat-1.2.1"] },
              { id: "fis-1.1.3", titulo: "Notação científica e ordens de grandeza", prerequisitos: ["fis-1.1.2", "mat-1.3.1"] },
            ],
          },
          {
            id: "fis-1.2",
            titulo: "Cinemática",
            licoes: [
              { id: "fis-1.2.1", titulo: "Referencial, posição e deslocamento", prerequisitos: ["fis-1.1.2"] },
              { id: "fis-1.2.2", titulo: "Velocidade e movimento uniforme", prerequisitos: ["fis-1.2.1", "mat-1.5.1"] },
              { id: "fis-1.2.3", titulo: "Aceleração e movimento uniformemente variado", prerequisitos: ["fis-1.2.2", "mat-1.6.2"] },
              { id: "fis-1.2.4", titulo: "Gráficos do movimento", prerequisitos: ["fis-1.2.3", "mat-1.6.2"] },
            ],
          },
          {
            id: "fis-1.3",
            titulo: "Movimento em 2D",
            licoes: [
              { id: "fis-1.3.1", titulo: "Vetores", prerequisitos: ["fis-1.2.1", "mat-1.7.3"] },
              { id: "fis-1.3.2", titulo: "Lançamento horizontal e oblíquo", prerequisitos: ["fis-1.3.1", "fis-1.2.3"] },
              { id: "fis-1.3.3", titulo: "Movimento circular uniforme", prerequisitos: ["fis-1.3.1", "mat-1.7.1"] },
            ],
          },
          {
            id: "fis-1.4",
            titulo: "Leis de Newton",
            licoes: [
              { id: "fis-1.4.1", titulo: "Inércia: a primeira lei", prerequisitos: ["fis-1.2.3"] },
              { id: "fis-1.4.2", titulo: "F = ma: a segunda lei", prerequisitos: ["fis-1.4.1", "fis-1.3.1"] },
              { id: "fis-1.4.3", titulo: "Ação e reação: a terceira lei", prerequisitos: ["fis-1.4.2"] },
              { id: "fis-1.4.4", titulo: "Forças comuns: peso, normal e atrito", prerequisitos: ["fis-1.4.3"] },
            ],
          },
          {
            id: "fis-1.5",
            titulo: "Trabalho e energia",
            licoes: [
              { id: "fis-1.5.1", titulo: "Trabalho de uma força", prerequisitos: ["fis-1.4.2", "mat-1.7.3"] },
              { id: "fis-1.5.2", titulo: "Energia cinética e potencial", prerequisitos: ["fis-1.5.1"] },
              { id: "fis-1.5.3", titulo: "Conservação da energia", prerequisitos: ["fis-1.5.2"] },
              { id: "fis-1.5.4", titulo: "Potência", prerequisitos: ["fis-1.5.1"] },
            ],
          },
          {
            id: "fis-1.6",
            titulo: "Quantidade de movimento",
            licoes: [
              { id: "fis-1.6.1", titulo: "Momento linear e impulso", prerequisitos: ["fis-1.4.2"] },
              { id: "fis-1.6.2", titulo: "Conservação da quantidade de movimento", prerequisitos: ["fis-1.6.1", "fis-1.4.3"] },
              { id: "fis-1.6.3", titulo: "Colisões", prerequisitos: ["fis-1.6.2", "fis-1.5.3"] },
            ],
          },
        ],
      },
      { id: "fis-2", titulo: "Eletromagnetismo e Ondas", semanas: "13-24", ativa: false, modulos: [] },
      { id: "fis-3", titulo: "Física Universitária Inicial", semanas: "25-52", ativa: false, modulos: [] },
      { id: "fis-4", titulo: "Física para Engenharia", semanas: "53-78", ativa: false, modulos: [] },
    ],
  },
];

// Para ativar as outras \u00e1reas e a op\u00e7\u00e3o "Outra \u00e1rea (escrever)", basta p\u00f4r isto a true.
export const OUTRAS_AREAS_ATIVAS = true;

const AREAS_COM_CURRICULO = CURRICULO.map((a) => a.area);
const AREAS_DESATIVADAS = [
  "Qu\u00edmica",
  "Biologia",
  "L\u00edngua Portuguesa",
  "Ingl\u00eas",
  "Franc\u00eas",
  "Hist\u00f3ria",
  "Geografia",
  "Filosofia",
  "Economia",
  "Contabilidade",
  "Direito",
  "Programa\u00e7\u00e3o",
];
export const AREAS = OUTRAS_AREAS_ATIVAS ? [...AREAS_COM_CURRICULO, ...AREAS_DESATIVADAS] : AREAS_COM_CURRICULO;

function semAcentos(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export function areaDisponivel(nomeArea?: string): boolean {
  return OUTRAS_AREAS_ATIVAS || AREAS_COM_CURRICULO.some((a) => semAcentos(a) === semAcentos(nomeArea ?? ""));
}

// Áreas sem currículo escrito: o método é o mesmo, só o percurso é construído pelo modelo.
function percursoLivre(nomeArea?: string): string {
  return `Área: ${nomeArea || "a que o aluno indicar"}. Esta área não tem currículo pré-definido, por isso constrói tu o percurso, com o mesmo rigor de um currículo oficial:
- Depois do diagnóstico, organiza a área em fases, módulos e lições, do mais básico ao mais avançado, com os pré-requisitos de cada lição, ajustados ao nível e ao objetivo do aluno. A fase em que ele deve estar é a fase ativa; as seguintes são só o mapa do percurso.
- Mostra-lhe o percurso de forma resumida e segue essa ordem, sem mudar de método.
- Como aqui não há ids, na linha [[ESTADO]] usa o título curto do módulo e da lição (no máximo 50 caracteres, sem ";" nem "=").
- Nos vídeos de reforço, sugere esses canais só se tratarem mesmo deste tema; se não, não sugiras nenhum.`;
}

// Currículo compacto para o prompt: só a área escolhida, com as fases inativas reduzidas a título,
// mais os títulos dos pré-requisitos que pertencem à outra área.
export function curriculoParaPrompt(nomeArea?: string): string {
  const area = CURRICULO.find((a) => semAcentos(a.area) === semAcentos(nomeArea ?? ""));
  if (!area) return percursoLivre(nomeArea);

  const proprios = new Set<string>();
  for (const f of area.fases) for (const m of f.modulos) for (const l of m.licoes) proprios.add(l.id);

  const externos = new Set<string>();
  for (const f of area.fases)
    for (const m of f.modulos)
      for (const l of m.licoes) for (const p of l.prerequisitos) if (!proprios.has(p)) externos.add(p);

  const titulos = new Map<string, string>();
  for (const a of CURRICULO)
    for (const f of a.fases) for (const m of f.modulos) for (const l of m.licoes) titulos.set(l.id, l.titulo);

  return JSON.stringify({
    area: area.area,
    fases: area.fases.map((f) =>
      f.ativa ? f : { id: f.id, titulo: f.titulo, semanas: f.semanas, ativa: false }
    ),
    prerequisitos_de_outras_areas: Array.from(externos).map((id) => ({ id, titulo: titulos.get(id) ?? id })),
  });
}
