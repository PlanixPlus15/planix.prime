"use strict";

const PLANIX_CONFIG = {
  configUrl: "data/config.json",
  workerUrl: "worker.js?v=40",
  searchMinimumCharacters: 2,
  searchLimit: 150,
  categoryPageSize: 100,
  continueWatchingLimit: 20,
  toastDuration: 3000
};

const state = {
  config: null,
  manifest: null,
  worker: null,
  catalogReady: false,
  selectedContent: null,
  featuredContent: null,
  activeSection: "inicio",
  favorites: new Set(),
  continueWatching: {},
  categoryResults: new Map(),
  searchTimer: null,
  downloadedParts: 0,
  processedParts: 0,
  totalParts: 0,

  fullCategory: {
    id: "",
    title: "",
    offset: 0,
    total: 0,
    loading: false
  },

  players: {
    hls: null,
    shaka: null,
    mpegts: null
  }
};

const elements = {
  navigationButtons: document.querySelectorAll(".nav-button, .mobile-nav-button"),
  searchInput: document.getElementById("searchInput"),
  clearSearchButton: document.getElementById("clearSearchButton"),

  heroBackground: document.getElementById("heroBackground"),
  heroTitle: document.getElementById("heroTitle"),
  heroDescription: document.getElementById("heroDescription"),
  heroYear: document.getElementById("heroYear"),
  heroCategory: document.getElementById("heroCategory"),
  catalogCounter: document.getElementById("catalogCounter"),
  heroPlayButton: document.getElementById("heroPlayButton"),
  heroInfoButton: document.getElementById("heroInfoButton"),
  heroFavoriteButton: document.getElementById("heroFavoriteButton"),

  loadingSection: document.getElementById("loadingSection"),
  loadingMessage: document.getElementById("loadingMessage"),
  loadingProgressBar: document.getElementById("loadingProgressBar"),

  searchResultsSection: document.getElementById("searchResultsSection"),
  searchResultCounter: document.getElementById("searchResultCounter"),
  searchResultsGrid: document.getElementById("searchResultsGrid"),

  fullCategorySection: document.getElementById("fullCategorySection"),
  fullCategoryTitle: document.getElementById("fullCategoryTitle"),
  fullCategoryCounter: document.getElementById("fullCategoryCounter"),
  fullCategoryGrid: document.getElementById("fullCategoryGrid"),
  backToHomeButton: document.getElementById("backToHomeButton"),
  loadMoreCategoryButton: document.getElementById("loadMoreCategoryButton"),

  continueWatchingSection: document.getElementById("continueWatchingSection"),
  continueWatchingRow: document.getElementById("continueWatchingRow"),
  catalogSections: document.getElementById("catalogSections"),
  emptyState: document.getElementById("emptyState"),

  playerModal: document.getElementById("playerModal"),
  closePlayerButton: document.getElementById("closePlayerButton"),
  videoPlayer: document.getElementById("videoPlayer"),
  playerLoading: document.getElementById("playerLoading"),
  playerLoadingText: document.getElementById("playerLoadingText"),
  playerError: document.getElementById("playerError"),
  playerErrorTitle: document.getElementById("playerErrorTitle"),
  playerErrorMessage: document.getElementById("playerErrorMessage"),
  retryPlayerButton: document.getElementById("retryPlayerButton"),
  playerTitle: document.getElementById("playerTitle"),
  playerMetadata: document.getElementById("playerMetadata"),
  playerDescription: document.getElementById("playerDescription"),
  playerFavoriteButton: document.getElementById("playerFavoriteButton"),

  informationModal: document.getElementById("informationModal"),
  closeInformationButton: document.getElementById("closeInformationButton"),
  informationBackground: document.getElementById("informationBackground"),
  informationTitle: document.getElementById("informationTitle"),
  informationMetadata: document.getElementById("informationMetadata"),
  informationDescription: document.getElementById("informationDescription"),
  informationPlayButton: document.getElementById("informationPlayButton"),
  informationFavoriteButton: document.getElementById("informationFavoriteButton"),

  toast: document.getElementById("toast")
};

document.addEventListener("DOMContentLoaded", initializeApp);

async function initializeApp() {
  try {
    restoreLocalData();
    registerEvents();
    initializeWorker();

    updateLoading("Cargando configuraciÃ³n...", 3);
    state.config = await fetchJSON(PLANIX_CONFIG.configUrl);

    updateLoading("Buscando catÃ¡logo...", 7);
    state.manifest = await fetchJSON(state.config.catalogManifest);

    const parts = Array.isArray(state.manifest.parts)
      ? state.manifest.parts
      : [];

    if (!parts.length) {
      throw new Error("catalog/index.json no contiene partes.");
    }

    state.totalParts = parts.length;

    state.worker.postMessage({ type: "RESET_CATALOG" });
    await downloadCatalogParts(parts);
  } catch (error) {
    console.error("Error al iniciar Planix Prime:", error);
    updateLoading("No se pudo cargar el catÃ¡logo.", 100);
    showToast("Revisa catalog/index.json y el archivo de pelÃ­culas.");
  }
}

async function downloadCatalogParts(parts) {
  state.downloadedParts = 0;
  state.processedParts = 0;

  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    const fileUrl = typeof part === "string" ? part : part.file;

    if (!fileUrl) continue;

    updateLoading(
      `Descargando parte ${index + 1} de ${parts.length}...`,
      10 + Math.round((index / Math.max(parts.length, 1)) * 70)
    );

    const response = await fetch(fileUrl, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`No se pudo descargar ${fileUrl}. Estado ${response.status}`);
    }

    const text = await response.text();
    state.downloadedParts += 1;

    state.worker.postMessage({
      type: "PARSE_PART",
      text,
      partNumber: index + 1,
      totalParts: parts.length
    });
  }

  updateLoading("Organizando el catÃ¡logo...", 90);
  state.worker.postMessage({ type: "FINISH_CATALOG" });
}

function initializeWorker() {
  if (!("Worker" in window)) {
    throw new Error("Este navegador no admite Web Workers.");
  }

  state.worker = new Worker(PLANIX_CONFIG.workerUrl);
  state.worker.addEventListener("message", handleWorkerMessage);
  state.worker.addEventListener("error", error => {
    console.error("Error en worker.js:", error);
    showToast("OcurriÃ³ un error procesando el catÃ¡logo.");
  });
}

function handleWorkerMessage(event) {
  const message = event.data;
  if (!message?.type) return;

  switch (message.type) {
    case "PART_PROCESSED":
      handlePartProcessed(message);
      break;

    case "CATALOG_READY":
      handleCatalogReady(message);
      break;

    case "CATEGORY_RESULTS":
      handleCategoryResults(message);
      break;

    case "SEARCH_RESULTS":
      renderSearchResults(message.results || [], message.total || 0);
      break;
  }
}

function handlePartProcessed(message) {
  state.processedParts += 1;

  const percentage =
    15 +
    Math.round(
      (state.processedParts / Math.max(state.totalParts, 1)) * 70
    );

  updateLoading(
    `Procesando ${Number(message.catalogTotal || 0).toLocaleString("es-ES")} tÃ­tulos...`,
    Math.min(percentage, 88)
  );
}

function handleCatalogReady(message) {
  state.catalogReady = true;

  elements.catalogCounter.textContent =
    `${Number(message.total || 0).toLocaleString("es-ES")} tÃ­tulos`;

  if (message.featured) setFeaturedContent(message.featured);

  elements.catalogSections.innerHTML = "";
  requestHomeCategories();
  renderContinueWatching();

  updateLoading("Planix Prime estÃ¡ listo", 100);

  window.setTimeout(() => {
    elements.loadingSection.hidden = true;
  }, 500);
}

function requestHomeCategories() {
  const sections = Array.isArray(state.config?.sections)
    ? state.config.sections
    : [];

  const limits = state.config?.homeLimits || {};

  for (const section of sections) {
    state.worker.postMessage({
      type: "GET_CATEGORY",
      category: section.id,
      limit: Number(limits[section.id] || 80),
      offset: 0
    });
  }
}

function handleCategoryResults(message) {
  const category = message.category;
  const items = Array.isArray(message.items) ? message.items : [];

  if (state.fullCategory.id === category && state.fullCategory.loading) {
    appendFullCategoryResults(items, message.total || 0, message.offset || 0);
    return;
  }

  state.categoryResults.set(category, items);

  const sectionConfig = state.config.sections.find(
    section => section.id === category
  );

  if (!sectionConfig || !items.length) return;

  createCatalogSection(sectionConfig, items, message.total || items.length);
}

function createCatalogSection(section, items, total) {
  const existing = document.querySelector(
    `[data-section-id="${section.id}"]`
  );
  if (existing) existing.remove();

  const sectionElement = document.createElement("section");
  sectionElement.className = "catalog-section";
  sectionElement.dataset.sectionId = section.id;

  const heading = document.createElement("div");
  heading.className = "section-heading section-heading-actions";

  const titleGroup = document.createElement("div");
  const title = document.createElement("h2");
  title.textContent = section.title || "Contenido";

  const counter = document.createElement("span");
  counter.textContent = `${Number(total).toLocaleString("es-ES")} tÃ­tulos`;

  titleGroup.append(title, counter);

  const viewAllButton = document.createElement("button");
  viewAllButton.type = "button";
  viewAllButton.className = "view-all-button";
  viewAllButton.textContent = "Ver todo";
  viewAllButton.addEventListener("click", () => {
    openFullCategory(section.id, section.title || "Contenido");
  });

  heading.append(titleGroup, viewAllButton);

  const row = document.createElement("div");
  row.className = "content-row";

  for (const content of items) {
    row.appendChild(createContentCard(content));
  }
