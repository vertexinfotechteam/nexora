/**
 * Builds the Vertex Infotech brochure as a PDF.
 *
 *   npx tsx scripts/make-brochure.tsx [output.pdf]
 *
 * Content comes from src/lib/company.ts, so the brochure and the website
 * cannot drift apart - correcting a phone number in one place corrects both.
 */
import {
  renderToFile,
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Svg,
  Rect,
  Path,
  Circle,
} from "@react-pdf/renderer";
import React from "react";
import { VERTEX, PROBLEMS, ADVANTAGES, SERVICES, PRINCIPLES } from "../src/lib/company";

/*
 * The built-in PDF fonts cover WinAnsi only. An em dash or a curly quote
 * renders as an unrelated glyph rather than failing loudly, so every string is
 * mapped before it reaches the document.
 */
const GLYPHS: [RegExp, string][] = [
  [/[—–]/g, "-"],
  [/[‘’]/g, "'"],
  [/[“”]/g, '"'],
  [/…/g, "..."],
  [/−/g, "-"],
];

const t = (value: string): string =>
  GLYPHS.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), value)
    .replace(/[^ -ÿ]/g, "");

const C = {
  ink: "#07151B",
  deep: "#0F5B51",
  accent: "#2B9485",
  bright: "#32A895",
  paper: "#FFFFFF",
  panel: "#F2F7F5",
  line: "#D9E5E1",
  body: "#3F5450",
  muted: "#6B807B",
  white: "#F5FAF9",
};

const s = StyleSheet.create({
  page: { paddingTop: 0, paddingBottom: 42, fontSize: 9.5, color: C.body, fontFamily: "Helvetica" },
  band: { backgroundColor: C.ink, paddingHorizontal: 44, paddingTop: 38, paddingBottom: 34 },
  brand: { fontSize: 25, fontFamily: "Helvetica-Bold", color: C.white, letterSpacing: 0.4 },
  brandSub: { fontSize: 10, color: C.bright, marginTop: 5, fontFamily: "Helvetica-Bold", letterSpacing: 1.4 },
  tagline: { fontSize: 12.5, color: "#C6D8D3", marginTop: 14, lineHeight: 1.5, maxWidth: 380 },
  body: { paddingHorizontal: 44, paddingTop: 24 },
  h2: { fontSize: 14, fontFamily: "Helvetica-Bold", color: C.ink, marginBottom: 3 },
  eyebrow: { fontSize: 8, fontFamily: "Helvetica-Bold", color: C.accent, letterSpacing: 1.3, marginBottom: 5 },
  lede: { fontSize: 9.5, color: C.muted, marginBottom: 13, lineHeight: 1.5, maxWidth: 430 },
  row: { flexDirection: "row", gap: 12, marginBottom: 11 },
  col: { flex: 1 },
  card: { borderWidth: 1, borderColor: C.line, borderRadius: 7, padding: 11, backgroundColor: C.paper },
  cardDark: { borderRadius: 7, padding: 11, backgroundColor: C.panel, borderLeftWidth: 2.5, borderLeftColor: C.accent },
  cardTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", color: C.ink, marginBottom: 3.5 },
  cardBody: { fontSize: 8.5, lineHeight: 1.5, color: C.body },
  sectionGap: { marginTop: 20 },
  foot: {
    position: "absolute",
    bottom: 20,
    left: 44,
    right: 44,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7.5,
    color: C.muted,
    borderTopWidth: 1,
    borderTopColor: C.line,
    paddingTop: 6,
  },
  contactBar: { backgroundColor: C.deep, borderRadius: 8, padding: 15, marginTop: 6 },
  contactLabel: { fontSize: 7.5, color: "#9FC7BE", letterSpacing: 1.1, fontFamily: "Helvetica-Bold" },
  contactValue: { fontSize: 11, color: C.white, fontFamily: "Helvetica-Bold", marginTop: 3 },
});

const Mark = () => (
  <Svg width={34} height={34} viewBox="0 0 64 64">
    <Rect x="8" y="14" width="11" height="36" rx="5.5" fill={C.white} />
    <Path d="M14.5 17.5 L44 47.5" stroke={C.white} strokeWidth="11" strokeLinecap="round" />
    <Rect x="45" y="14" width="11" height="36" rx="5.5" fill={C.bright} />
    <Circle cx="50.5" cy="24" r="2.6" fill={C.ink} />
  </Svg>
);

const Card = ({ title, body, dark = false }: { title: string; body: string; dark?: boolean }) => (
  <View style={dark ? s.cardDark : s.card}>
    <Text style={s.cardTitle}>{t(title)}</Text>
    <Text style={s.cardBody}>{t(body)}</Text>
  </View>
);

/** Two per row, so a card never sits alone across a wide page. */
const Pairs = ({
  items,
  dark = false,
}: {
  items: readonly { title: string; body: string }[];
  dark?: boolean;
}) => (
  <>
    {Array.from({ length: Math.ceil(items.length / 2) }, (_, i) => (
      <View style={s.row} key={i}>
        <View style={s.col}>
          <Card {...items[i * 2]} dark={dark} />
        </View>
        <View style={s.col}>
          {items[i * 2 + 1] ? <Card {...items[i * 2 + 1]} dark={dark} /> : null}
        </View>
      </View>
    ))}
  </>
);

/*
 * Page numbers are rendered by the PDF engine, not written by hand.
 *
 * The first version hardcoded "1 of 2" and "2 of 2". The content overflowed to
 * a third page, so the last page carried a footer claiming it was the second
 * of two - a small lie, on the page a reader is most likely to check for a
 * phone number.
 */
const Foot = () => (
  <View style={s.foot} fixed>
    <Text>{t(VERTEX.name + " - " + VERTEX.location)}</Text>
    <Text render={({ pageNumber, totalPages }) => `${pageNumber} of ${totalPages}`} />
  </View>
);

const site = VERTEX.website.replace(/^https?:\/\//, "");

const Brochure = () => (
  <Document title={VERTEX.name + " - Company Brochure"} author={VERTEX.name}>
    <Page size="A4" style={s.page}>
      <View style={s.band}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Mark />
          <View>
            <Text style={s.brand}>{t(VERTEX.name.toUpperCase())}</Text>
            <Text style={s.brandSub}>{t("AI DATA INTELLIGENCE")}</Text>
          </View>
        </View>
        <Text style={s.tagline}>{t(VERTEX.tagline)}</Text>
      </View>

      <View style={s.body}>
        <Text style={s.eyebrow}>{t("BEFORE")}</Text>
        <Text style={s.h2}>{t("What running a business on spreadsheets costs you")}</Text>
        <Text style={s.lede}>
          {t(
            "None of these are unusual. They are what every growing business runs into once there is more data than one person can hold in their head.",
          )}
        </Text>
        <Pairs items={PROBLEMS} />

        <View style={s.sectionGap}>
          <Text style={s.eyebrow}>{t("AFTER")}</Text>
          <Text style={s.h2}>{t("What changes once Nexus is in place")}</Text>
          <Text style={s.lede}>
            {t("Each of these answers one of the problems above, in the same order.")}
          </Text>
          <Pairs items={ADVANTAGES} dark />
        </View>
      </View>
      <Foot />
    </Page>

    <Page size="A4" style={s.page}>
      <View style={{ ...s.body, paddingTop: 34 }}>
        <Text style={s.eyebrow}>{t("WHAT WE BUILD")}</Text>
        <Text style={s.h2}>{t("Our services")}</Text>
        <Text style={s.lede}>
          {t(
            "Nexus is our own product. We also build software to order for businesses that need something specific.",
          )}
        </Text>
        <Pairs items={SERVICES} />

        <View style={s.sectionGap}>
          <Text style={s.eyebrow}>{t("WHO WE ARE")}</Text>
          <Text style={s.h2}>{t(VERTEX.name + ", founded " + VERTEX.founded)}</Text>
          <Text style={s.lede}>
            {t(
              "A small software company in Gujarat, India. We build the analysis tool we wanted to use ourselves: one that shows its working, so a figure can be checked rather than believed. These three rules decide how the product behaves.",
            )}
          </Text>
          {PRINCIPLES.map((p) => (
            <View key={p.title} style={{ ...s.cardDark, marginBottom: 8 }}>
              <Text style={s.cardTitle}>{t(p.title)}</Text>
              <Text style={s.cardBody}>{t(p.body)}</Text>
            </View>
          ))}
        </View>

        <View style={s.sectionGap}>
          <Text style={s.eyebrow}>{t("CONTACT US")}</Text>
          <Text style={s.h2}>{t("Talk to us about your data")}</Text>

          <View style={s.contactBar}>
            <View style={{ flexDirection: "row", gap: 18 }}>
              <View style={{ flex: 1.3 }}>
                <Text style={s.contactLabel}>{t("WEBSITE")}</Text>
                <Text style={s.contactValue}>{t(site)}</Text>
              </View>
              <View style={{ flex: 1.4 }}>
                <Text style={s.contactLabel}>{t("EMAIL")}</Text>
                <Text style={s.contactValue}>{t(VERTEX.email)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.contactLabel}>{t("PHONE")}</Text>
                <Text style={s.contactValue}>
                  {t(VERTEX.phoneDisplay || VERTEX.phone || "[ add your number ]")}
                </Text>
              </View>
            </View>
          </View>

          <Text style={{ ...s.cardBody, marginTop: 10, color: C.muted }}>
            {t("Try it free at " + site + " - ten analyses, no card required.")}
          </Text>
        </View>
      </View>
      <Foot />
    </Page>
  </Document>
);

// Wrapped rather than top-level await: tsx transforms this file to CJS, which
// has no top-level await.
async function main() {
  const out = process.argv[2] ?? "vertex-infotech-brochure.pdf";
  await renderToFile(<Brochure />, out);
  console.log("written:", out);
  if (!VERTEX.phone) {
    console.log("NOTE: VERTEX.phone is empty in src/lib/company.ts - the phone box shows a placeholder.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
