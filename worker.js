"use strict";

/* =========================================================
   PLANIX PRIME 2.0
   Archivo: worker.js
   Procesa, clasifica y busca el catálogo automáticamente
   ========================================================= */

const catalog = [];
const knownUrls = new Set();

const categories = {
  estrenos: [],
  peliculas: [],
  series: [],
  superheroes: [],
  familia: [],
  terror: [],
  documentales: [],
  navidad: []
};


/* =========================================================
   RECIBIR INSTRUCCIONES DESDE app.js
   ========================================================= */

self.addEventListener("message", event => {
  const message = event.data;

  if (!message || !message.type) {
    return;
  }

  switch (message.type) {
    case "RESET_CATALOG":
      resetCatalog();
      break;

    case "PARSE_PART":
      parseCatalogPart(
        message.text,
        message.partNumber,
        message.totalParts
      );
      break;

    case "FINISH_CATALOG":
      finishCatalog();
      break;

    case "SEARCH":
      searchCatalog(
        message.query,
        message.limit
      );
      break;

    case "GET_CATEGORY":
      sendCategory(
        message.category,
        message.limit,
        message.offset
      );
      break;

    default:
      console.warn(
        "Instrucción desconocida:",
        message.type
      );
  }
});


/* =========================================================
   REINICIAR CATÁLOGO
   ========================================================= */

function resetCatalog() {
  catalog.length = 0;
  knownUrls.clear();

  Object.keys(categories).forEach(category => {
    categories[category].length = 0;
  });

  self.postMessage({
    type: "CATALOG_RESET"
  });
}


/* =========================================================
   PROCESAR CADA ARCHIVO TXT
   ========================================================= */

function parseCatalogPart(
  text,
  partNumber,
  totalParts
) {
  if (!text) {
    sendPartProgress(
      partNumber,
      totalParts,
      0
    );

    return;
  }

  const lines = String(text)
    .replace(/\r/g, "")
    .split("\n");

  let pendingTitle = "";
  let addedItems = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      continue;
    }

    if (line.startsWith("Channel name:")) {
      pendingTitle = cleanTitle(
        line.slice("Channel name:".length)
      );

      continue;
    }

    if (
      pendingTitle &&
      line.startsWith("URL:")
    ) {
      const url = line
        .slice("URL:".length)
        .trim();

      if (
        url &&
        !knownUrls.has(url)
      ) {
        const item = createCatalogItem(
          pendingTitle,
          url
        );

        knownUrls.add(url);
        catalog.push(item);

        classifyItem(item);

        addedItems += 1;
      }

      pendingTitle = "";
    }
  }

  sendPartProgress(
    partNumber,
    totalParts,
    addedItems
  );
}


/* =========================================================
   CREAR PELÍCULA NORMALIZADA
   ========================================================= */

function createCatalogItem(title, url) {
  const normalizedTitle =
    normalizeText(title);

  const year =
    detectYear(title);

  const format =
    detectFormat(url);

  const type =
    detectContentType(
      normalizedTitle,
      url
    );

  return {
    id: createId(url),
    title,
    year,
    category: "Películas",
    type,
    format,
    url,

    poster: "",
    background: "",

    description:
      "Disponible en Planix Prime.",

    searchTitle: normalizedTitle
  };
}


/* =========================================================
   CLASIFICAR AUTOMÁTICAMENTE
   ========================================================= */

function classifyItem(item) {
  const title = item.searchTitle;

  if (item.type === "serie") {
    item.category = "Series";
    categories.series.push(item);
  } else {
    categories.peliculas.push(item);
  }

  if (
    item.year === "2026" ||
    item.year === "2025"
  ) {
    categories.estrenos.push({
      ...item,
      category: "Estrenos"
    });
  }

  if (
    containsAny(title, [
      "spider man",
      "x men",
      "avengers",
      "vengadores",
      "iron man",
      "thor",
      "hulk",
      "captain america",
      "capitan america",
      "black panther",
      "deadpool",
      "logan",
      "daredevil",
      "doctor strange",
      "guardianes de la galaxia",
      "guardians of the galaxy",
      "ant man",
      "wolverine",
      "venom",
      "batman",
      "superman",
      "wonder woman",
      "aquaman",
      "justice league",
      "liga de la justicia",
      "flash",
      "supergirl",
      "shazam",
      "catwoman",
      "watchmen",
      "fantastic four",
      "cuatro fantasticos"
    ])
  ) {
    categories.superheroes.push({
      ...item,
      category: "Superhéroes"
    });
  }

  if (
    containsAny(title, [
      "disney",
      "pixar",
      "mickey",
      "donald",
      "goofy",
      "aladdin",
      "mulan",
      "tarzan",
      "cenicienta",
      "sirenita",
      "toy story",
      "ralph",
      "winnie",
      "phineas",
      "ferb",
      "dalmata",
      "hermano oso",
      "rey leon",
      "ice age",
      "shrek",
      "madagascar",
      "kung fu panda",
      "minion",
      "gru",
      "cars",
      "frozen",
      "encanto",
      "moana",
      "lilo",
      "stitch",
      "monsters inc",
      "coco",
      "barbie",
      "paw patrol",
      "tom y jerry",
      "looney tunes",
      "scooby",
      "garfield",
      "muppets",
      "lego",
      "bob esponja",
      "pokemon",
      "doraemon",
      "rugrats",
      "hey arnold",
      "padrinos magicos"
    ])
  ) {
    categories.familia.push({
      ...item,
      category: "Familia y animación"
    });
  }

  if (
    containsAny(title, [
      "terror",
      "horror",
      "alien",
      "predator",
      "maldicion",
      "posesion",
      "infernal",
      "pesadilla",
      "halloween",
      "zombie",
      "vampiro",
      "demonio",
      "exorcismo",
      "cementerio",
      "masacre",
      "asesino",
      "fantasma",
      "sobrenatural"
    ])
  ) {
    categories.terror.push({
      ...item,
      category:
        "Terror y ciencia ficción"
    });
  }

  if (
    containsAny(title, [
      "documental",
      "national geographic",
      "discovery",
      "nature",
      "wildlife",
      "science",
      "universo",
      "planeta",
      "oceano",
      "tiburon",
      "shark",
      "historia real",
      "biografia"
    ])
  ) {
    categories.documentales.push({
      ...item,
      category: "Documentales"
    });
  }

  if (
    containsAny(title, [
      "navidad",
      "christmas",
      "santa claus",
      "nochebuena",
      "holiday",
      "xmas"
    ])
  ) {
    categories.navidad.push({
      ...item,
      category: "Navidad"
    });
  }
}


/* =========================================================
   DETECTAR SERIES
   ========================================================= */

function detectContentType(title, url) {
  const cleanUrl =
    normalizeText(url);

  if (
    /\bs\d{1,2}\s*e\d{1,3}\b/.test(title) ||
    /\btemporada\b/.test(title) ||
    /\bepisodio\b/.test(title) ||
    /\bcapitulo\b/.test(title) ||
    /\bseason\b/.test(title) ||
    /\bepisode\b/.test(title) ||
    /\/series\//.test(cleanUrl)
  ) {
    return "serie";
  }

  return "pelicula";
}


/* =========================================================
   FINALIZAR EL PROCESAMIENTO
   ========================================================= */

function finishCatalog() {
  sortCatalog(catalog);

  Object.values(categories).forEach(
    categoryItems => {
      removeCategoryDuplicates(
        categoryItems
      );

      sortCatalog(categoryItems);
    }
  );

  self.postMessage({
    type: "CATALOG_READY",

    total: catalog.length,

    counts: {
      estrenos:
        categories.estrenos.length,

      peliculas:
        categories.peliculas.length,

      series:
        categories.series.length,

      superheroes:
        categories.superheroes.length,

      familia:
        categories.familia.length,

      terror:
        categories.terror.length,

      documentales:
        categories.documentales.length,

      navidad:
        categories.navidad.length
    },

    featured:
      categories.estrenos[0] ||
      catalog[0] ||
      null
  });
}


/* =========================================================
   ENVIAR UNA CATEGORÍA
   ========================================================= */

function sendCategory(
  category,
  requestedLimit,
  requestedOffset
) {
  const source =
    categories[category] ||
    [];

  const limit =
    Math.max(
      1,
      Math.min(
        Number(requestedLimit) || 80,
        500
      )
    );

  const offset =
    Math.max(
      0,
      Number(requestedOffset) || 0
    );

  const items =
    source.slice(
      offset,
      offset + limit
    );

  self.postMessage({
    type: "CATEGORY_RESULTS",
    category,
    items,
    total: source.length,
    offset
  });
}


/* =========================================================
   MOTOR DE BÚSQUEDA
   ========================================================= */

function searchCatalog(
  query,
  requestedLimit
) {
  const normalizedQuery =
    normalizeText(query);

  const limit =
    Math.max(
      1,
      Math.min(
        Number(requestedLimit) || 150,
        500
      )
    );

  if (!normalizedQuery) {
    self.postMessage({
      type: "SEARCH_RESULTS",
      results: [],
      total: 0
    });

    return;
  }

  const words =
    normalizedQuery
      .split(/\s+/)
      .filter(Boolean);

  const scoredResults = [];

  for (const item of catalog) {
    const score =
      calculateSearchScore(
        item,
        normalizedQuery,
        words
      );

    if (score > 0) {
      scoredResults.push({
        item,
        score
      });
    }
  }

  scoredResults.sort(
    (first, second) => {
      if (
        second.score !==
        first.score
      ) {
        return (
          second.score -
          first.score
        );
      }

      return first.item.title.localeCompare(
        second.item.title,
        "es",
        {
          sensitivity: "base"
        }
      );
    }
  );

  self.postMessage({
    type: "SEARCH_RESULTS",

    results:
      scoredResults
        .slice(0, limit)
        .map(result => result.item),

    total:
      scoredResults.length
  });
}


/* =========================================================
   CALCULAR COINCIDENCIA
   ========================================================= */

function calculateSearchScore(
  item,
  completeQuery,
  words
) {
  const title =
    item.searchTitle;

  let score = 0;

  if (title === completeQuery) {
    score += 1000;
  }

  if (
    title.startsWith(
      completeQuery
    )
  ) {
    score += 600;
  }

  if (
    title.includes(
      completeQuery
    )
  ) {
    score += 400;
  }

  for (const word of words) {
    if (title === word) {
      score += 180;
    } else if (
      title.startsWith(word)
    ) {
      score += 120;
    } else if (
      title.includes(word)
    ) {
      score += 75;
    }
  }

  return score;
}


/* =========================================================
   FUNCIONES DE APOYO
   ========================================================= */

function cleanTitle(value) {
  return String(value || "")
    .replace(
      /\[[^\]]*(1080p|720p|mega|latino|ingles|castellano)[^\]]*\]/gi,
      ""
    )
    .replace(
      /\s*-\s*\.PeliculasGoogleOne\.Net\.?/gi,
      ""
    )
    .replace(/\s+/g, " ")
    .trim();
}

function detectYear(title) {
  const matches =
    String(title).match(
      /\((19\d{2}|20\d{2})\)/g
    );

  if (!matches?.length) {
    return "";
  }

  return matches[
    matches.length - 1
  ].replace(/[()]/g, "");
}

function detectFormat(url) {
  const cleanUrl =
    String(url)
      .split("?")[0]
      .toLowerCase();

  const match =
    cleanUrl.match(
      /\.([a-z0-9]+)$/
    );

  return match
    ? match[1].toUpperCase()
    : "VIDEO";
}

function createId(url) {
  let hash = 0;

  for (
    let index = 0;
    index < url.length;
    index += 1
  ) {
    hash =
      (hash << 5) -
      hash +
      url.charCodeAt(index);

    hash |= 0;
  }

  return `planix-${Math.abs(hash)}`;
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .replace(
      /[^a-zA-Z0-9\s/.-]/g,
      " "
    )
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}

function containsAny(
  title,
  keywords
) {
  return keywords.some(
    keyword =>
      title.includes(keyword)
  );
}

function removeCategoryDuplicates(
  items
) {
  const seen = new Set();

  for (
    let index = items.length - 1;
    index >= 0;
    index -= 1
  ) {
    if (
      seen.has(items[index].id)
    ) {
      items.splice(index, 1);
    } else {
      seen.add(items[index].id);
    }
  }
}

function sortCatalog(items) {
  items.sort(
    (first, second) => {
      const firstYear =
        first.year || "0000";

      const secondYear =
        second.year || "0000";

      if (
        secondYear !== firstYear
      ) {
        return secondYear.localeCompare(
          firstYear
        );
      }

      return first.title.localeCompare(
        second.title,
        "es",
        {
          sensitivity: "base"
        }
      );
    }
  );
}

function sendPartProgress(
  partNumber,
  totalParts,
  addedItems
) {
  self.postMessage({
    type: "PART_PROCESSED",
    partNumber,
    totalParts,
    addedItems,
    catalogTotal:
      catalog.length
  });
       }
