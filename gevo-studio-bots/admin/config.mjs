/**
 * IDs für den Bot "GWS | Administration" auf dem Server [Wartungsarbeiten] Gevo Web Studio.
 * Alle Werte stammen aus dem Server (per Discord-API ausgelesen).
 */
export const CONFIG = {
  clientId: "1517164510194962532",
  guildId: "1505666452835799073",

  channels: {
    welcome: "1505666454127906958", // 👋〣willkommen
    verify: "1517172589859176502", // ✅〣verifizieren
    legal: "1517172690245648546", // 📑〢rechtliches
    delivery: "1517248766632132729", // ⌛〣lieferzeit
    pricing: "1505666454295675145", // 💎〣preisliste
    ticket: "1505666454433960059", // 🎫〣ticket
    feedback: "1505666454295675150", // 👍〣feedback — Bewertungen nach Kauf-Tickets
    transcripts: "1568018798265503815", // 📜〣transcripts — nur Team, Transcripts geschlossener Tickets
  },

  // Transcripts: Ablage auf dem Server (nginx liefert sie unter baseUrl aus)
  transcripts: {
    dir: process.env.TRANSCRIPT_DIR ?? new URL("./data/transcripts/", import.meta.url).pathname,
    baseUrl: process.env.TRANSCRIPT_BASE_URL ?? "https://gevo-studio.de/transcripts",
  },

  // Kategorien, in denen neue Ticket-Kanäle angelegt werden
  ticketCategories: {
    support: "1517195640525029376", // TICKETS ・ SUPPORT
    kauf: "1517226654701846558", // TICKETS ・ KAUF
    partner: "1517252616877375599", // TICKETS ・ PARTNER
    geschaeftsfuehrung: "1517252582311985293", // TICKETS ・ GESCHÄFTSFÜHRUNG
  },

  roles: {
    team: "1505666453221802192", // » Team — sieht alle Tickets, wird beim Öffnen angepingt
    member: "1505666452835799076", // » Member — bekommt man über "Verifizieren"
  },

  // Bestehende Panel-Nachrichten: daraus wird das aktuelle Banner gelesen,
  // und /lieferzeit bearbeitet die Lieferzeit-Nachricht direkt.
  panelMessages: {
    ticket: { channelId: "1505666454433960059", messageId: "1528428949967868007" },
    verify: { channelId: "1517172589859176502", messageId: "1518327399073452223" },
    legal: { channelId: "1517172690245648546", messageId: "1529854719638507553" },
    delivery: { channelId: "1517248766632132729", messageId: "1524804887995744448" },
    pricing: { channelId: "1505666454295675145", messageId: "1535278673551163465" },
    welcome: { channelId: "1505666454127906958", messageId: "1539359111282696296" },
  },

  website: "https://gevo-studio.de",

  // Impressum (gleiche Angaben wie auf gevo-studio.de/impressum)
  impressum: {
    name: "Karen Gevorgyan",
    company: "Gevo Web Studio",
    street: "Weg Am Sportplatz 13b",
    city: "22850 Norderstedt",
    phone: "+49 176 67494606",
    email: "gevo.web.studio@gmail.com",
  },
};
