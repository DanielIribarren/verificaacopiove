import type { AppState } from "./types";

// La app arranca vacia: no se siembran centros ni zonas inventadas.
// Los puntos los crean los reportes reales (acopio que recibe, o zona que necesita)
// y se llenan a traves del panel voluntario y los reportes comunitarios.
// Solo se conservan las fuentes como referencia de procedencia de futuros datos.
export const initialState: AppState = {
  sources: [
    {
      id: "community",
      name: "Reporte comunitario",
      trustLevel: 0,
      importedAt: "2026-06-25T00:00:00.000Z",
    },
  ],
  centers: [],
  needs: [],
  verifications: [],
  reports: [],
};
