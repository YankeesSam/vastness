// VN-SCN-001, VN-SCN-003: body colours for spheres, markers and orbits. Placeholders until the catalog carries them.
export const BODY_COLOURS: Readonly<Record<number, string>> = {
  10: "#ffd27a",
  199: "#9a948c",
  299: "#e3cf9a",
  399: "#4f7fc9",
  301: "#b9b6ae",
  499: "#c1623b",
  599: "#d6b48c",
  699: "#e2cf98",
  799: "#9fd6dc",
  899: "#5577d8",
};

export const colourOf = (id: number): string => BODY_COLOURS[id] ?? "#ffffff";
