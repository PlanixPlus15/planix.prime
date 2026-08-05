"use strict";

/* =========================================================
   PLANIX PRIME
   Archivo: worker.js
   Motor de búsqueda ejecutado en segundo plano
   ========================================================= */


/* =========================
   1. CATÁLOGO INTERNO
   ========================= */

let searchCatalog = [];


/* =========================
   2. RECIBIR INSTRUCCIONES
   ========================= */

self.addEventListener("message", event => {
  const message = event.data;

  if (!message || !message.type) {
    return;
  }

  switch (message.type) {
    case "SET_CATALOG":
      setCatalog(message.catalog);
      break;

    case "SEARCH":
      searchContent(
        message.query,
        message.limit
      );
      break;

    case "CLEAR_CATALOG":
      clearCatalog();
      break;

    default:
      console.warn(
        "Planix Worker recibió una instrucción desconocida:",
        message.type
      );
  }
});


/* =========================
   3. GUARDAR CATÁLOGO
   ========================= */

function setCatalog(catalog) {
  if (!Array.isArray(catalog)) {
    searchCatalog = [];

    sendWorkerStatus(
      "El catálogo recibido no es válido."
    );

    return;
  }

  searchCatalog = catalog
    .filter(item => {
      return (
        item &&
        item.id &&
        item.title
      );
    })
    .map(item => {
      return {
        ...item,

        searchTitle:
          normalizeText(item.title),

        searchCategory:
          normalizeText(
            item.category ||
            item.categoria ||
            ""
          ),

        searchYear:
          normalizeText(
            item.year ||
            item.anio ||
            item.año ||
            ""
          ),

        searchType:
          normalizeText(
            item.type ||
            item.tipo ||
            ""
          )
      };
    });

  self.postMessage({
    type: "CATALOG_READY",
    total: searchCatalog.length
  });
}


/* =========================
   4. REALIZAR BÚSQUEDA
   ========================= */

function searchContent(query, requestedLimit) {
  const normalizedQuery =
    normalizeText(query);

  const limit =
    Number.isFinite(Number(requestedLimit))
      ? Math.max(
          1,
          Math.min(
            Number(requestedLimit),
            500
          )
        )
      : 150;

  if (!normalizedQuery) {
    sendSearchResults([]);
    return;
  }

  const queryWords =
    normalizedQuery
      .split(/\s+/)
      .filter(Boolean);

  const results = [];

  for (const item of searchCatalog) {
    const score =
      calculateSearchScore(
        item,
        normalizedQuery,
        queryWords
      );

    if (score <= 0) {
      continue;
    }

    results.push({
      item,
      score
    });
  }

  results.sort((first, second) => {
    if (second.score !== first.score) {
      return second.score - first.score;
    }

    return first.item.title.localeCompare(
      second.item.title,
      "es",
      {
        sensitivity: "base"
      }
    );
  });

  const finalResults = results
    .slice(0, limit)
    .map(result => {
      const {
        searchTitle,
        searchCategory,
        searchYear,
        searchType,
        ...cleanItem
      } = result.item;

      return cleanItem;
    });

  sendSearchResults(finalResults);
}


/* =========================
   5. CALCULAR RELEVANCIA
   ========================= */

function calculateSearchScore(
  item,
  completeQuery,
  queryWords
) {
  let score = 0;

  const title =
    item.searchTitle;

  const category =
    item.searchCategory;

  const year =
    item.searchYear;

  const type =
    item.searchType;

  if (title === completeQuery) {
    score += 1000;
  }

  if (title.startsWith(completeQuery)) {
    score += 600;
  }

  if (title.includes(completeQuery)) {
    score += 400;
  }

  if (category.includes(completeQuery)) {
    score += 160;
  }

  if (year === completeQuery) {
    score += 150;
  }

  if (type.includes(completeQuery)) {
    score += 80;
  }

  for (const word of queryWords) {
    if (title === word) {
      score += 180;
    } else if (title.startsWith(word)) {
      score += 120;
    } else if (title.includes(word)) {
      score += 75;
    }

    if (category.includes(word)) {
      score += 35;
    }

    if (year.includes(word)) {
      score += 25;
    }

    if (type.includes(word)) {
      score += 15;
    }
  }

  return score;
}


/* =========================
   6. ENVIAR RESULTADOS
   ========================= */

function sendSearchResults(results) {
  self.postMessage({
    type: "SEARCH_RESULTS",
    results,
    total: results.length
  });
}


/* =========================
   7. LIMPIAR CATÁLOGO
   ========================= */

function clearCatalog() {
  searchCatalog = [];

  self.postMessage({
    type: "CATALOG_CLEARED"
  });
}


/* =========================
   8. NORMALIZAR TEXTO
   ========================= */

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .replace(
      /[^a-zA-Z0-9\s]/g,
      " "
    )
    .replace(
      /\s+/g,
      " "
    )
    .toLowerCase()
    .trim();
}


/* =========================
   9. MENSAJES DE ESTADO
   ========================= */

function sendWorkerStatus(message) {
  self.postMessage({
    type: "WORKER_STATUS",
    message
  });
}
