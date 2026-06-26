import { describe, expect, it } from "vitest";
import {
  addCommunityReport,
  addVerification,
  applyExpiration,
  buildWhatsAppShare,
  deriveCenters,
  exportCentersCsv,
  isPublicCenter,
} from "./domain";
import { initialState } from "./seed";
import type { AppState, Center } from "./types";

const baseCenter: Center = {
  id: "test",
  kind: "acopio",
  name: "Centro Test",
  organization: "Org",
  state: "Distrito Capital",
  city: "Caracas",
  address: "Direccion",
  contact: "0412",
  trustStatus: "verificado",
  trustLevel: 2,
  sourceId: "community",
  receives: ["agua"],
  doesNotReceive: [],
  notes: "",
  createdAt: "2026-06-25T00:00:00.000Z",
  updatedAt: "2026-06-25T00:00:00.000Z",
};

describe("moderation rules", () => {
  it("moves verified centers to re-verification after 12 hours", () => {
    const center = applyExpiration(
      { ...baseCenter, lastVerifiedAt: "2026-06-25T00:00:00.000Z" },
      new Date("2026-06-25T13:00:00.000Z"),
    );

    expect(center.trustStatus).toBe("requiere_reverificacion");
    expect(center.hiddenFromPublic).toBeUndefined();
  });

  it("hides stale centers after 24 hours and archives after 48 hours", () => {
    const hidden = applyExpiration(
      { ...baseCenter, lastVerifiedAt: "2026-06-25T00:00:00.000Z" },
      new Date("2026-06-26T01:00:00.000Z"),
    );
    const archived = applyExpiration(
      { ...baseCenter, lastVerifiedAt: "2026-06-25T00:00:00.000Z" },
      new Date("2026-06-27T01:00:00.000Z"),
    );

    expect(hidden.hiddenFromPublic).toBe(true);
    expect(archived.trustStatus).toBe("archivado");
  });

  it("does not publish suggested centers by default", () => {
    expect(isPublicCenter({ ...baseCenter, trustStatus: "sugerido" })).toBe(false);
    expect(isPublicCenter({ ...baseCenter, trustStatus: "sugerido" }, true)).toBe(true);
  });

  it("keeps centers without contact out of the default public view", () => {
    expect(isPublicCenter({ ...baseCenter, contact: "" })).toBe(false);
    expect(isPublicCenter({ ...baseCenter, contact: "" }, true)).toBe(true);
  });

  it("turns two negative reports into hidden status", () => {
    let state: AppState = { ...initialState, centers: [baseCenter], reports: [] };
    state = addCommunityReport(state, "test", {
      type: "falso",
      note: "No existe",
      reporterName: "A",
    });
    state = addCommunityReport(state, "test", {
      type: "falso",
      note: "Direccion incorrecta",
      reporterName: "B",
    });

    const [center] = deriveCenters(state);
    expect(center.trustStatus).toBe("rechazado");
    expect(center.hiddenFromPublic).toBe(true);
  });

  it("verification promotes a pending center to verified", () => {
    const pending: Center = {
      ...baseCenter,
      id: "pendiente-1",
      trustStatus: "pendiente_verificacion",
      trustLevel: 1,
      lastVerifiedAt: undefined,
    };
    const start: AppState = { ...initialState, centers: [pending] };
    const state = addVerification(start, "pendiente-1", {
      method: "whatsapp",
      volunteerName: "Ana",
      result: "confirmado",
      notes: "Confirmado por encargada.",
    });

    const center = state.centers.find((item) => item.id === "pendiente-1");
    expect(center?.trustStatus).toBe("verificado");
    expect(center?.lastVerifiedAt).toBeTruthy();
  });

  it("exports public CSV with kind column and without private volunteer notes", () => {
    const csv = exportCentersCsv([baseCenter]);
    expect(csv).toContain("kind");
    expect(csv).toContain("trustStatus");
    expect(csv).not.toContain("volunteerName");
  });

  it("labels needs vs receives in the whatsapp share by kind", () => {
    const need = decodeURIComponent(
      buildWhatsAppShare({ ...baseCenter, kind: "necesidad" }),
    );
    const acopio = decodeURIComponent(buildWhatsAppShare(baseCenter));
    expect(need).toContain("Necesitan:");
    expect(acopio).toContain("Reciben:");
  });
});
