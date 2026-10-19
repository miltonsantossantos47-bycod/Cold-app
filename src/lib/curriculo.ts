// Currículo piloto (PLACEHOLDER). Substitui pelo teu currículo real de Matemática/Física.
export type Licao = { id: string; titulo: string; prerequisitos: string[] };
export type Modulo = { id: string; titulo: string; licoes: Licao[] };
export type Area = { area: string; modulos: Modulo[] };

export const CURRICULO: Area[] = [
  {
    area: "Matemática",
    modulos: [
      {
        id: "mat-1",
        titulo: "Números e frações",
        licoes: [
          { id: "mat-1-1", titulo: "Frações: o que são e para que servem", prerequisitos: [] },
          { id: "mat-1-2", titulo: "Operações com frações", prerequisitos: ["mat-1-1"] },
        ],
      },
      {
        id: "mat-2",
        titulo: "Álgebra básica",
        licoes: [
          { id: "mat-2-1", titulo: "Expressões e variáveis", prerequisitos: ["mat-1-2"] },
          { id: "mat-2-2", titulo: "Equações do 1.º grau", prerequisitos: ["mat-2-1"] },
        ],
      },
      {
        id: "mat-3",
        titulo: "Funções",
        licoes: [
          { id: "mat-3-1", titulo: "A ideia de função", prerequisitos: ["mat-2-2"] },
          { id: "mat-3-2", titulo: "Função afim e o seu gráfico", prerequisitos: ["mat-3-1"] },
        ],
      },
    ],
  },
  {
    area: "Física",
    modulos: [
      {
        id: "fis-1",
        titulo: "Movimento",
        licoes: [
          { id: "fis-1-1", titulo: "Posição, deslocamento e referencial", prerequisitos: [] },
          { id: "fis-1-2", titulo: "Velocidade e movimento uniforme", prerequisitos: ["fis-1-1", "mat-2-2"] },
        ],
      },
    ],
  },
];
