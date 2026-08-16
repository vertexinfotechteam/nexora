/** The people behind NEXORA AI at Vertex Infotech. */
export type TeamMember = {
  name: string;
  role: string;
  focus: string;
  initials: string;
};

export const TEAM: TeamMember[] = [
  {
    name: "Tarang Vasoya",
    role: "Project Lead & CEO",
    focus:
      "Sets the product direction and holds the line on the rule everything else follows: no number reaches a user unless the engine computed it.",
    initials: "TV",
  },
  {
    name: "Het Aghera",
    role: "AI & Backend",
    focus:
      "Builds the analysis orchestrator, the sealed query engine and the verification layer that rejects any figure the AI cannot prove.",
    initials: "HA",
  },
  {
    name: "Om Bardoliya",
    role: "Frontend & UI/UX",
    focus:
      "Designs the interface and the live activity stream, so a non-technical reader can follow exactly how an answer was reached.",
    initials: "OB",
  },
  {
    name: "Dharm Senjaliya",
    role: "Product & Database",
    focus:
      "Shapes the data model, multi-tenant isolation and the row level security policies that keep every workspace separate.",
    initials: "DS",
  },
  {
    name: "Navneet Radadiya",
    role: "QA & Product",
    focus:
      "Tests the statistics, the SQL guard and the export pipeline, and pushes back whenever an output could mislead.",
    initials: "NR",
  },
];

export const COMPANY = {
  name: "Vertex Infotech",
  product: "NEXORA AI",
  tagline: "Analytics you can check, not just trust.",
} as const;
