/**
 * Panel-Design v2 (live seit 2026-11-05), Aufbau wie das Referenz-Video:
 * Banner · Icon + **TITEL** + Text, rechts grüne Punkt-Kachel (bzw. Profilbild)
 * · Liste mit flimmerndem Punkte-Streifen, grünem "?" und rauen Ziffern · Buttons.
 *
 * Icons: Bot-Emojis "GWSb_*" (t_* = animierte Titel-Icons; n1–n4, q, strip animiert).
 * lang "de" = Panel im Server, "en" = private Antwort auf den translate-Button.
 */
import { CONFIG } from "./config.mjs";
import { DELIVERY_LEVELS, DEFAULT_DELIVERY, E, PRICE_ITEMS, UI } from "./panels.mjs";

const { text, sep, row, media, button, linkButton, section, container, ch } = UI;

export const B = {
  bill: "<:GWSb_bill:1568012952622342286>",
  boss: "<:GWSb_boss:1568012954186686534>",
  cart: "<:GWSb_cart:1568012955621134346>",
  code: "<:GWSb_code:1568012956883492885>",
  contact: "<:GWSb_contact:1568012958389375077>",
  design: "<:GWSb_design:1568012959622369383>",
  doc: "<:GWSb_doc:1568012960566091777>",
  fast: "<:GWSb_fast:1568012962004869202>",
  gift: "<:GWSb_gift:1568014401594986639>",
  info: "<:GWSb_info:1568012964106211389>",
  left: "<:GWSb_left:1568012965721145475>",
  legal: "<:GWSb_legal:1568012966920585246>",
  liefer_gelb: "<:GWSb_liefer_gelb:1568012968174551091>",
  liefer_grun: "<:GWSb_liefer_grun:1568012969298759825>",
  liefer_orange: "<:GWSb_liefer_orange:1568012979885187072>",
  liefer_rot: "<:GWSb_liefer_rot:1568012981772488815>",
  lock: "<:GWSb_lock:1568012983190294659>",
  n1: "<a:GWSb_n1:1568012984834465863>",
  n2: "<a:GWSb_n2:1568012997094539495>",
  n3: "<a:GWSb_n3:1568012998466084924>",
  n4: "<a:GWSb_n4:1568012999871168653>",
  nextday: "<:GWSb_nextday:1568014402362417194>",
  partner: "<:GWSb_partner:1568013001276006432>",
  people: "<:GWSb_people:1568013002463256697>",
  q: "<a:GWSb_q:1568013003767418960>",
  server: "<:GWSb_server:1568013005373841498>",
  shield: "<:GWSb_shield:1568013006711816193>",
  star: "<:GWSb_star:1568013007915716618>",
  strip: "<a:GWSb_strip:1568013009446764605>",
  strip_top: "<a:GWSb_strip_top:1568013010583425024>",
  stripe: "<:GWSb_stripe:1568013011761889320>",
  t_bill: "<a:GWSb_t_bill:1568013013301198918>",
  t_boss: "<a:GWSb_t_boss:1568015458802864239>",
  t_cart: "<a:GWSb_t_cart:1568013015046033528>",
  t_contact: "<a:GWSb_t_contact:1568015454767947806>",
  t_doc: "<a:GWSb_t_doc:1568018863419949209>",
  t_fast: "<a:GWSb_t_fast:1568013016270897172>",
  t_gift: "<a:GWSb_t_gift:1568014404149321788>",
  t_info: "<a:GWSb_t_info:1568013017482797056>",
  t_legal: "<a:GWSb_t_legal:1568013018753798187>",
  t_liefer_grun: "<a:GWSb_t_liefer_grun:1568013020121006141>",
  t_lock: "<a:GWSb_t_lock:1568015460677587138>",
  t_partner: "<a:GWSb_t_partner:1568015456701386884>",
  t_shield: "<a:GWSb_t_shield:1568013021773832245>",
  t_star: "<a:GWSb_t_star:1568013023401091182>",
  t_ticket: "<a:GWSb_t_ticket:1568013025049313412>",
  t_winner: "<a:GWSb_t_winner:1568013027070967808>",
  tick: "<:GWSb_tick:1568013028165947409>",
  ticket: "<:GWSb_ticket:1568013030065831986>",
  view: "<:GWSb_view:1568013031231983666>",
  warn: "<:GWSb_warn:1568013032527765584>",
  winner: "<:GWSb_winner:1568013033836642416>",
  x: "<:GWSb_x:1568013034977362032>",
};

const N = [B.n1, B.n2, B.n3, B.n4];
const LEVEL_ICON = { "3-5": B.liefer_grun, "6-10": B.liefer_gelb, "11-20": B.liefer_orange, "21+": B.liefer_rot };
const thumb = (url) => ({ type: 11, media: { url } });
const L = (lang, de, en) => (lang === "en" ? en : de);
const translate = (id) => button(2, "translate", E.english, `gevo:tr:${id}`);

/** Kopf: Icon + **TITEL**, darunter die Textzeilen; rechts Kachel bzw. Profilbild */
const head = (icon, title, lines, thumbUrl) => {
  const body = `${icon} **${title}**\n${lines}`;
  return thumbUrl ? section(body, thumb(thumbUrl)) : text(body);
};

/** Liste: Streifen links durchgehend (erste Zeile grün), dann Icon + Text.
 *  Zeile als String → Ziffer 1–4, als [icon, text] → eigenes Icon. */
const list = (headIcon, heading, rows) =>
  text([
    `${B.strip_top}${headIcon} ${heading}`,
    ...rows.map((r, k) => (Array.isArray(r) ? `${B.strip}${r[0]} ${r[1]}` : `${B.strip}${N[k]} ${r}`)),
  ].join("\n"));

/** Liste ohne Zusatz-Icon: nur Streifen + Text (Adressen, Preise) */
const plain = (headIcon, heading, lines) =>
  text([`${B.strip_top}${headIcon} ${heading}`, ...lines.map((l) => `${B.strip} ${l}`)].join("\n"));

/* ---------- Ticket-System ------------------------------------------------------ */

export const TICKET_TYPES = {
  support: { de: "Support", en: "Support", icon: B.contact, title: B.t_contact },
  kauf: { de: "Kauf", en: "Purchase", icon: B.cart, title: B.t_cart },
  partner: { de: "Partner", en: "Partner", icon: B.partner, title: B.t_partner },
  geschaeftsfuehrung: { de: "Geschäftsführung", en: "Management", icon: B.boss, title: B.t_boss },
};

export function ticketPanel({ banner, thumb: t, lang = "de" }) {
  return container([
    banner && media(banner),
    head(B.t_ticket, "TICKET SYSTEM", L(lang,
      "Öffne ein Ticket, wenn du Hilfe zu einem Projekt brauchst oder etwas kaufen möchtest.\nWir helfen bei Fragen, Problemen und neuen Aufträgen – schnell und klar.",
      "Open a ticket if you need help with a project or want to buy something.\nWe help with questions, issues and new orders – fast and clear."), t),
    list(B.q, L(lang, "Warum Gevo Studio?", "Why Gevo Studio?"), L(lang,
      ["Hochwertiges **UI/UX Design**", "Performante **Entwicklung**", "Klarer Ablauf und zuverlässige **Lieferung**"],
      ["High-quality **UI/UX design**", "Performance-focused **development**", "Clear process and reliable **delivery**"])),
    sep(),
    row(
      ...Object.entries(TICKET_TYPES).map(([type, x]) => button(2, x[lang], x.icon, `gevo:ticket_open:${type}`)),
      ...(lang === "de" ? [translate("tickets_panel")] : []),
    ),
  ]);
}

export function ticketWelcome({ type, banner, avatar, lang = "de" }) {
  const x = TICKET_TYPES[type] ?? TICKET_TYPES.support;
  return container([
    banner && media(banner),
    head(x.title, `TICKET – ${x[lang].toUpperCase()}`, L(lang,
      `Willkommen in deinem ${x.de}-Ticket!\nEin Teammitglied meldet sich schnellstmöglich bei dir.`,
      `Welcome to your ${x.en} ticket!\nA team member will get back to you as soon as possible.`), avatar),
    list(B.q, L(lang, "So geht es weiter", "What happens next"), L(lang,
      ["Beschreibe dein Anliegen **so detailliert wie möglich**", "Bitte **keine** einzelnen Teammitglieder pingen", "Es gelten unsere **AGB** und **Richtlinien**"],
      ["Describe your request **in as much detail as possible**", "Please **don't** ping individual team members", "Our **terms** and **guidelines** apply"])),
    sep(),
    row(
      button(4, L(lang, "Ticket schließen", "Close ticket"), B.lock, "gevo:ticket_close"),
      ...(lang === "de" ? [translate("ticket")] : []),
    ),
  ]);
}

export function ticketCloseConfirm() {
  return container([
    text(`${B.t_lock} **TICKET SCHLIESSEN?**\nDer Kanal wird danach gelöscht.`),
    row(
      button(4, "Ja, schließen", B.lock, "gevo:ticket_close_confirm"),
      button(2, "Abbrechen", B.left, "gevo:ticket_close_cancel"),
    ),
  ]);
}

export const notice = (icon, content) => container([text(`${icon} ${content}`)]);

/** Karte mit Transcript-Link — für den Log-Kanal und per DM an den Kunden */
export function transcriptCard({ meta, url, forOwner, thumb: t, file }) {
  const x = TICKET_TYPES[meta.type];
  const closed = Math.floor(meta.closedAt / 1000);
  return container([
    head(B.t_doc, forOwner ? "DEIN TICKET-TRANSCRIPT" : "TICKET-TRANSCRIPT", forOwner
      ? `Dein Ticket **#${meta.channelName}** bei Gevo Studio wurde geschlossen.\nHier ist der komplette Verlauf – mit allen Nachrichten, Bildern und Dateien.`
      : `Ticket **#${meta.channelName}** wurde geschlossen und dauerhaft archiviert.\nAlle Nachrichten, Bilder und Dateien sind gespeichert.`, t),
    plain(B.info, "Ticket-Details", [
      `Art: **${x?.de ?? "Ticket"}** · Nummer **#${meta.nr}**`,
      `Geöffnet von <@${meta.ownerId}>`,
      `Geschlossen von <@${meta.closedById}> · <t:${closed}:f>`,
      `**${meta.messages}** Nachrichten · **${meta.files}** Dateien · **${meta.participants}** Teilnehmer`,
    ]),
    ...(file ? [{ type: 13, file: { url: file } }] : []),
    text(`-# Der Link ist privat – teile ihn nur mit Beteiligten.${file ? " Die Datei ist eine Sicherungskopie des Verlaufs." : ""}`),
    sep(),
    row(linkButton("Transcript öffnen", B.doc, url)),
  ]);
}

/* ---------- Verifizieren --------------------------------------------------------- */

export function verifyPanel({ banner, thumb: t, lang = "de" }) {
  return container([
    banner && media(banner),
    head(B.t_shield, L(lang, "VERIFIZIERUNG", "VERIFICATION"), L(lang,
      "Lies dir unsere Hausregeln durch und bestätige sie mit dem Button unten.\nDanach hast du Zugriff auf alle Bereiche von Gevo Studio.",
      "Read our house rules and confirm them with the button below.\nAfterwards you have access to all areas of Gevo Studio."), t),
    list(B.q, L(lang, "Was gilt bei uns?", "What applies here?"), L(lang,
      ["**Zahlung** ausschließlich per Vorkasse über Stripe",
        "**Fehlerbehebungen** sind kostenlos, Design-Änderungen in Maßen inklusive",
        "**Keine Weitergabe** von Dateien oder Chatverläufen an Dritte",
        "Es gelten die Discord **ToS** und **Community-Richtlinien**"],
      ["**Payment** by advance payment via Stripe only",
        "**Bug fixes** are free, design changes are included within reason",
        "**No sharing** of files or chat logs with third parties",
        "The Discord **ToS** and **Community Guidelines** apply"])),
    text(L(lang,
      `-# [Discord ToS](https://discord.com/terms) · [Community-Richtlinien](https://discord.com/guidelines) · Weitere Infos in ${ch("legal")}`,
      `-# [Discord ToS](https://discord.com/terms) · [Community Guidelines](https://discord.com/guidelines) · More info in ${ch("legal")}`)),
    sep(),
    row(
      button(3, L(lang, "Verifizieren", "Verify"), B.tick, "gevo:verify"),
      ...(lang === "de" ? [translate("verify")] : []),
    ),
  ]);
}

/* ---------- Rechtliches ------------------------------------------------------------- */

const DOCS = {
  impressum: { icon: B.doc, path: "/impressum", de: ["Impressum", "Angaben gemäß § 5 DDG"], en: ["Legal notice", "Information according to § 5 DDG"] },
  datenschutz: { icon: B.lock, path: "/datenschutz", de: ["Datenschutz", "Umgang mit deinen Daten"], en: ["Privacy", "How we handle your data"] },
  agb: { icon: B.legal, path: "/agb", de: ["AGB", "Allgemeine Geschäftsbedingungen"], en: ["Terms", "General terms and conditions"] },
  widerruf: { icon: B.left, path: "/widerruf", de: ["Widerruf", "Widerrufsbelehrung"], en: ["Withdrawal", "Right of withdrawal"] },
};

export function legalPanel({ banner, thumb: t, lang = "de" }) {
  return container([
    banner && media(banner),
    head(B.t_legal, L(lang, "RECHTLICHES", "LEGAL"), L(lang,
      "Alle rechtlichen Informationen zu Gevo Studio an einem Ort.\nWähle unten einen Bereich – die Details siehst nur du.",
      "All legal information about Gevo Studio in one place.\nChoose an area below – only you will see the details."), t),
    list(B.q, L(lang, "Welche Dokumente gibt es?", "Which documents are there?"),
      Object.values(DOCS).map((d) => `**${d[lang][0]}** · ${d[lang][1]}`)),
    sep(),
    row(
      ...Object.entries(DOCS).map(([key, d]) => button(2, d[lang][0], d.icon, `gevo:legal:${key}`)),
      ...(lang === "de" ? [translate("legal")] : []),
    ),
  ]);
}

/** Private Antwort auf einen Rechtliches-Button */
export function legalDetail(key) {
  const d = DOCS[key];
  if (!d) return null;
  const I = CONFIG.impressum;
  const website = row(linkButton(`${d.de[0]} auf der Website`, d.icon, `${CONFIG.website}${d.path}`));
  if (key === "impressum") {
    return container([
      text(`${d.icon} **IMPRESSUM**\nAngaben gemäß § 5 DDG`),
      plain(B.info, "Anbieter", [`**${I.name}**`, I.company, I.street, I.city]),
      plain(B.contact, "Kontakt", [`Telefon: ${I.phone}`, `E-Mail: ${I.email}`]),
      text("-# Gemäß § 19 UStG wird keine Umsatzsteuer berechnet."),
      sep(),
      website,
    ]);
  }
  const about = {
    datenschutz: "Wie wir deine Daten erheben, verarbeiten und schützen – etwa bei Bestellungen, Zahlungen über Stripe und im Discord – steht in unserer Datenschutzerklärung.",
    agb: "Unsere Allgemeinen Geschäftsbedingungen regeln Angebote, Vertragsschluss, Zahlung (Vorkasse), Lieferung, Revisionen und Nutzungsrechte für alle Aufträge bei Gevo Studio.",
    widerruf: "Wie und bis wann du einen Vertrag widerrufen kannst – und wann das Widerrufsrecht bei digitalen Leistungen vorzeitig erlischt – steht in unserer Widerrufsbelehrung.",
  }[key];
  return container([text(`${d.icon} **${d.de[0].toUpperCase()}**\n${about}`), sep(), website]);
}

/* ---------- Lieferzeit ----------------------------------------------------------------- */

export function deliveryPanel({ banner, thumb: t, state, lang = "de" }) {
  const s = { ...DEFAULT_DELIVERY, ...state };
  const cur = DELIVERY_LEVELS.find((l) => l.key === s.level) ?? DELIVERY_LEVELS[0];
  const ok = (b) => (b ? B.tick : B.x);
  const label = (l) => (lang === "en" ? l.en : l.label);
  const orders = L(lang, `offene Bestellung${s.open === 1 ? "" : "en"}`, `open order${s.open === 1 ? "" : "s"}`);
  const slots = `Fast Delivery Slot${s.fastSlots === 1 ? "" : "s"}`;
  return container([
    banner && media(banner),
    head(B.t_liefer_grun, L(lang, "LIEFERZEIT", "DELIVERY TIME"), L(lang,
      `Aktuell ca. **${cur.label}** · **${s.open}** ${orders} · **${s.fastSlots}** ${slots}\nWir arbeiten Montag bis Freitag von 08:00 bis 18:00 Uhr.`,
      `Currently approx. **${cur.en}** · **${s.open}** ${orders} · **${s.fastSlots}** ${slots}\nWe work Monday to Friday from 08:00 to 18:00.`), t),
    list(B.q, L(lang, "Wie lange dauert es?", "How long does it take?"), DELIVERY_LEVELS.map((l) =>
      [LEVEL_ICON[l.key], l.key === cur.key ? `**${label(l)}** – ${L(lang, "aktuell", "current")}` : label(l)])),
    list(B.t_fast, L(lang, "Zusätzliche Lieferoptionen", "Additional delivery options"), [
      `**${L(lang, "Bevorzugte Bearbeitung", "Priority processing")}** · +80% ${L(lang, "Aufschlag", "surcharge")} ${ok(s.priority)}`,
      `**Next Day Delivery** · +120% ${L(lang, "Aufschlag", "surcharge")} ${ok(s.nextDay)}`,
    ]),
    text(L(lang, "-# Angegebene Lieferzeiten sind ein Richtwert und nicht verbindlich.",
      "-# Delivery times are a guideline and not binding.")),
    ...(lang === "de" ? [sep(), row(translate("delivery"))] : []),
  ]);
}

/* ---------- Preisliste ------------------------------------------------------------------ */

const PRICE_ICON = {
  "price_detail:ui": B.design,
  "price_detail:frontend": B.code,
  "price_detail:backend": B.server,
  "price_bundle:rp_core": B.people,
  "price_bundle:economy": B.bill,
};

export function pricingPanel({ banner, thumb: t, lang = "de" }) {
  const item = (key) => {
    const p = PRICE_ITEMS[key];
    const [name, desc] = lang === "en" ? p.en : [p.name, p.text];
    const prices = key.startsWith("price_bundle")
      ? `\n-# ${p.prices.map(([n, eur]) => `${n} (${eur}€)`).join(" • ")}`
      : "";
    return section(`${PRICE_ICON[key]} **${name}**\n${desc}${prices}`,
      button(2, L(lang, "Details ansehen", "View details"), B.view, `gevo:${key}`));
  };
  return container([
    banner && media(banner),
    head(B.t_bill, L(lang, "PREISLISTE", "PRICE LIST"), L(lang,
      "Design, Frontend und Backend aus einer Hand.\nWähle unten eine Leistung und klicke auf **Details ansehen** für alle Preise.",
      "Design, frontend and backend from a single source.\nChoose a service below and click **View details** for all prices."), t),
    list(B.q, L(lang, "So einfach geht’s", "It's that simple"), L(lang,
      ["Leistung oder Bundle auswählen", "Details & Preise ansehen", "Kaufticket eröffnen und persönliches Angebot erhalten"],
      ["Choose a service or bundle", "View details & prices", "Open a purchase ticket and get your personal offer"])),
    text(L(lang,
      "-# Alle Preise sind Startpreise in EUR und können je nach Umfang variieren. Gemäß `§ 19 UStG` wird keine Umsatzsteuer berechnet.",
      "-# All prices are starting prices in EUR and may vary depending on scope. According to `§ 19 UStG` no VAT is charged.")),
    sep(),
    text(`${B.t_star} **${L(lang, "EINZELLEISTUNGEN", "INDIVIDUAL SERVICES")}**`),
    item("price_detail:ui"),
    item("price_detail:frontend"),
    item("price_detail:backend"),
    sep(),
    text(`${B.t_gift} **${L(lang, "SPAR-BUNDLES", "VALUE BUNDLES")}**\n-# ${L(lang,
      "Mehrere Systeme im Paket – günstiger als einzeln gekauft.",
      "Several systems in one package – cheaper than buying them separately.")}`),
    item("price_bundle:rp_core"),
    item("price_bundle:economy"),
    sep(),
    text([
      `${B.t_fast} **${L(lang, "EXPRESS GEFÄLLIG?", "NEED IT FASTER?")}**`,
      `${B.strip_top}${B.fast} **Fast Delivery** · +80% ${L(lang, "Aufpreis", "surcharge")}`,
      `${B.strip}${B.nextday} **Next Day Delivery** · +120% ${L(lang, "Aufpreis", "surcharge")}`,
    ].join("\n")),
    ...(lang === "de" ? [sep(), row(translate("pricing_main"))] : []),
  ]);
}

/** Private Antwort auf "Details ansehen": alle Preise am Punkte-Streifen */
export function priceDetail(key) {
  const p = PRICE_ITEMS[key];
  if (!p) return null;
  const rows = p.prices
    ? p.prices.map(([n, eur]) => `${n} · **${eur.toFixed(2)}€**`)
    : ["Preis auf Anfrage – du bekommst im Kaufticket ein persönliches Angebot."];
  return container([
    text(`${PRICE_ICON[key]} **${p.name.toUpperCase()}**\n${p.text}`),
    plain(B.q, "Was kostet was?", rows),
    text("-# Startpreise in EUR, je nach Umfang. Gemäß `§ 19 UStG` wird keine Umsatzsteuer berechnet."),
    sep(),
    row(linkButton("Kaufticket eröffnen", B.cart, `https://discord.com/channels/${CONFIG.guildId}/${CONFIG.channels.ticket}`)),
  ]);
}

/* ---------- Willkommen & Bewertungen --------------------------------------------------------- */

export function welcome({ banner, avatar, userId }) {
  return container([
    banner && media(banner),
    head(B.t_star, "WILLKOMMEN",
      `Schön, dass du da bist, <@${userId}>!\nBei Gevo Studio bekommst du UI/UX Design und Entwicklung aus einer Hand.`, avatar),
    list(B.q, "Wie startest du?", [
      `Verifiziere dich in ${ch("verify")}`,
      `Eröffne ein ${ch("ticket")} für dein Projekt`,
      `Alle Rechtstexte findest du in ${ch("legal")}`,
    ]),
  ]);
}

/** Private Nachricht an den Kunden, nachdem sein Kauf-Ticket geschlossen wurde */
export function reviewPrompt({ banner, nr }) {
  return container([
    banner && media(banner),
    text(`${B.t_winner} **WIE ZUFRIEDEN WARST DU?**\nDein Kauf-Ticket #${nr} bei Gevo Studio wurde geschlossen.\nBewerte uns mit 1 bis 5 Sternen – deine Bewertung erscheint in ${ch("feedback")}.`),
    sep(),
    row(...[1, 2, 3, 4, 5].map((n) => button(2, String(n), B.star, `gevo:review:${nr}:${n}`))),
  ]);
}

export function reviewThanks(stars) {
  return container([
    text(`${B.tick} **DANKE FÜR DEINE BEWERTUNG!**\n${B.star.repeat(stars)}  (${stars}/5) – dein Feedback ist jetzt in ${ch("feedback")} zu sehen.`),
  ]);
}

/** Bewertung in #feedback */
export function review({ banner, avatar, userId, nr, stars, feedback }) {
  return container([
    banner && media(banner),
    head(B.t_winner, "NEUE BEWERTUNG", `von <@${userId}>\nTicket #${nr}`, avatar),
    list(B.t_star, `**Bewertung** · ${B.star.repeat(stars)}  (${stars}/5)`, [
      [B.doc, "**Feedback des Kunden**"],
      [B.info, `„${feedback.trim().replace(/\s*\r?\n\s*/g, " ")}“`],
    ]),
  ]);
}
