// =========================================================
// MILO COMMAND PARSER
// =========================================================

const PLAY_TRIGGERS = [
  "play",
  "bajao",
  "chalao",
  "sunao",
  "song",
  "gaana",

  "बजाओ",
  "चलाओ",
  "सुनाओ",
  "गाना",
  "दे",
];

const YOUTUBE_WORDS = [
  "youtube",
  "yt",
  "यूट्यूब",
  "युट्यूब",
];


// =========================================================
// CLEAN YOUTUBE QUERY
// =========================================================

function extractYoutubeQuery(text) {

  let query = text.trim();

  // Remove wake word
  query = query.replace(/\bmilo\b/gi, "");

  // Remove YouTube words
  query = query.replace(/\byoutube\b/gi, "");
  query = query.replace(/\byt\b/gi, "");

  query = query.replace(/यूट्यूब/g, "");
  query = query.replace(/युट्यूब/g, "");

  // Remove play triggers
  query = query.replace(/\bplay\b/gi, "");
  query = query.replace(/\bbajao\b/gi, "");
  query = query.replace(/\bchalao\b/gi, "");
  query = query.replace(/\bsunao\b/gi, "");
  query = query.replace(/\bsong\b/gi, "");
  query = query.replace(/\bgaana\b/gi, "");

  // Hindi triggers
  query = query.replace(/बजाओ/g, "");
  query = query.replace(/चलाओ/g, "");
  query = query.replace(/सुनाओ/g, "");
  query = query.replace(/गाना/g, "");
  query = query.replace(/दे/g, "");

  // Remove common filler phrases
  query = query.replace(/\bka\b/gi, "");
  query = query.replace(/\bki\b/gi, "");
  query = query.replace(/\bke\b/gi, "");

  query = query.replace(/का/g, "");
  query = query.replace(/की/g, "");
  query = query.replace(/के/g, "");

  // Clean spaces
  query = query
    .replace(/\s+/g, " ")
    .trim();

  return query;
}


// =========================================================
// DETECT MUSIC COMMAND
// =========================================================

function hasMusicTrigger(text) {

  const lower = text.toLowerCase();

  return PLAY_TRIGGERS.some((trigger) => {

    if (
      trigger === "बजाओ" ||
      trigger === "चलाओ" ||
      trigger === "सुनाओ" ||
      trigger === "गाना" ||
      trigger === "दे"
    ) {
      return text.includes(trigger);
    }

    return lower.includes(trigger.toLowerCase());
  });
}


// =========================================================
// DETECT YOUTUBE WORD
// =========================================================

function hasYoutubeWord(text) {

  const lower = text.toLowerCase();

  return YOUTUBE_WORDS.some((word) => {

    if (
      word === "यूट्यूब" ||
      word === "युट्यूब"
    ) {
      return text.includes(word);
    }

    return lower.includes(word.toLowerCase());
  });
}


// =========================================================
// MAIN PARSER
// =========================================================

export function parseCommand(text) {

  if (!text) {
    return {
      type: "chat",
      payload: ""
    };
  }

  const original = text.trim();
  const lower = original.toLowerCase();

  // -------------------------------------------------------
  // OPEN COMMAND
  // -------------------------------------------------------

  const isOpenCommand =
    /\b(open|khol|kholna|start|launch)\b/i.test(lower);


  // -------------------------------------------------------
  // YOUTUBE MUSIC
  // -------------------------------------------------------
  // YouTube music gets priority over opening YouTube.
  //
  // "Play Kesariya on YouTube"
  // "Kesariya bajao"
  // "दे केसरिया गाना यूट्यूब"
  // -------------------------------------------------------

  const musicTrigger = hasMusicTrigger(original);
  const youtubeWord = hasYoutubeWord(original);

  if (
    musicTrigger &&
    !isOpenCommand
  ) {

    const query = extractYoutubeQuery(original);

    if (query) {

      return {
        type: "youtube",
        payload: query
      };
    }
  }


  // -------------------------------------------------------
  // OPEN APP / WEBSITE
  // -------------------------------------------------------

  if (isOpenCommand) {

    let app = lower
      .replace(/\b(open|khol|kholna|start|launch)\b/gi, "")
      .replace(/\bmilo\b/gi, "")
      .trim();

    if (app) {

      return {
        type: "app",
        payload: app
      };
    }
  }


  // -------------------------------------------------------
  // WEATHER
  // -------------------------------------------------------

  if (
    lower.includes("weather") ||
    lower.includes("mausam") ||
    original.includes("मौसम")
  ) {

    return {
      type: "weather",
      payload: ""
    };
  }


  // -------------------------------------------------------
  // TIME
  // -------------------------------------------------------

  if (
    lower.includes("time") ||
    lower.includes("samay") ||
    original.includes("समय")
  ) {

    return {
      type: "time",
      payload: ""
    };
  }


  // -------------------------------------------------------
  // DATE
  // -------------------------------------------------------

  if (
    lower.includes("date") ||
    lower.includes("today") ||
    lower.includes("aaj") ||
    original.includes("आज")
  ) {

    return {
      type: "date",
      payload: ""
    };
  }


  // -------------------------------------------------------
  // NORMAL CHAT
  // -------------------------------------------------------

  return {
    type: "chat",
    payload: original
  };
}


// =========================================================
// DEFAULT EXPORT
// =========================================================

export default parseCommand;