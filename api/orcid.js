const fetch = require("node-fetch");

const tags = [
  [
    "div",
    [
      "book",
      "body",
      "book-meta",
      "book-title-group",
      "contrib-group",
      "contrib",
      "name",
      "publisher",
      "pub-date",
      "book-part-meta",
      "title-group",
      "alternate-form",
      "sec-meta",
      "book-part",
      "back",
      "ref-list",
      "ref",
      "sec",
      "disp-quote",
      "fig",
      "book-id",
      "book-title",
      "subtitle",
      "volume",
      "surname",
      "given-names",
      "publisher-name",
      "publisher-loc",
      "isbn",
      "year",
      "day",
      "month",
      "elocation-id",
      "book-meta//title",
      "book-part-meta//title",
      "sec-meta//title",
      "book-meta//ext-link",
    ],
  ],
  ["p", ["p", "title", "mixed-citation", "label", "caption"]],
  ["h3", ["sec/title"]],
  ["ul", ["list"]],
  ["li", ["list-item"]],
  ["i", ["italic"]],
  ["b", ["bold"]],
  ["a", ["ext-link"]],
];

async function getJournalTitle(orcid, journalID) {
  var ORCIDLink = `https://pub.orcid.org/v2.0/${orcid}/work/${journalID}`;
  const response = await fetch(ORCIDLink, {
    headers: { Accept: "application/orcid+json" },
  });
  const data = await response.json();
  if (data["journal-title"] != null) return data["journal-title"]["value"];
  return "";
}

function selectRecord(records) {
  if (records.length == 1) return records[0];
  let rec = records[0];
  for (let record of records) {
    let source = record["source"]["source-name"]["value"];
    if (source == "Luc Blassel") rec = record;
    if (source == "Crossref Metadata Search") return record;
  }
  return rec;
}

function getTitle(record) {
  return record["title"]["title"]["value"];
}

function getDOI(record) {
  let doi = "";
  for (let id of record["external-ids"]["external-id"]) {
    if (id["external-id-type"] == "doi") {
      doi = id["external-id-value"];
      break;
    }
  }
  return doi;
}

function parseAuthor(author) {
  if (!author.given) return undefined;
  return {
    first: author.given,
    last: author.family,
    url: author.ORCID,
  };
}

function makeDate(parts) {
  let month = `${parts[1]}`.padStart(2, "0");
  let day = `${parts[2]}`.padStart(2, "0");
  if (day == "undefined") {
    day = "01"
  }
  return `${parts[0]}-${month}-${day}`;
  
}

function convertJATS(jats) {
  if (!jats) return "";
  let t = jats.replace(/jats:/g, "");

  for (let [htmlTag, xmlTags] of tags) {
    for (let xmlTag of xmlTags) {
      const replacer = new RegExp(xmlTag, "g");
      t = t.replace(replacer, htmlTag);
    }
  }

  t = t.replace(/\s*<p>\s*(A|a)bstract(\s|\.)*<\/p>\s*/g, "");
  t = t.replace(/\s*<p>\s*(M|m)otivation(\s|\.)*<\/p>\s*/g, "");
  t = t.replace(/\s*<p>\s*(R|e)esults(\s|\.)*<\/p>\s*/g, "");

  return t;
}

async function getMetadata(doi) {
  console.log(`http://api.crossref.org/works/${doi}`)
  const response = await fetch(`http://api.crossref.org/works/${doi}`, {
    headers: { Accept: "application/json" },
  });
  const data = await response.json();


  let authors = data["message"]["author"]
    .map((author) => parseAuthor(author))
    .filter((el) => {
      return el != null;
    });

  let date = makeDate(data["message"]["published"]["date-parts"][0]);
  let abstract = convertJATS(data["message"]["abstract"]);

  return { authors: authors, date: date, abstract: abstract };
}

module.exports = async (req, res) => {
  const { orcid = "0000-0002-6598-7673" } = req.query;
  let url = `https://pub.orcid.org/v2.0/${orcid}/works`;
  const response = await fetch(url, {
    headers: { Accept: "application/orcid+json" },
  });

  const data = await response.json();

  let records = [];
  for (let item of data["group"]) {
    let record = item["work-summary"][0];
    let journal = await getJournalTitle(orcid, record["put-code"]);
    let title = getTitle(record);
    let doi = getDOI(record);
    let meta = await getMetadata(doi);
    let source = record["source"]["source-name"]["value"];
    records = [
      ...records,
      { title: title, journal: journal, doi: doi, ...meta, source: source },
    ];
  }

  res.status(200).json(records);
};
