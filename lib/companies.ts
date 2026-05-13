export const COMPANIES = [
  "IG",
  "西村さん",
  "メビウス",
  "イルムス",
  "VERITE",
  "おふぃごは",
  "Provision",
  "BIRTHLY",
  "DB",
  "とみ田",
  "be there",
  "Less",
  "XGJ",
  "CHICKEN",
  "Alouette",
  "マルゴット",
  "FEARLESS",
] as const;

export type Company = (typeof COMPANIES)[number];

const COMPANY_SET: Set<string> = new Set(COMPANIES);

export function isKnownCompany(s: unknown): s is Company {
  return typeof s === "string" && COMPANY_SET.has(s);
}
