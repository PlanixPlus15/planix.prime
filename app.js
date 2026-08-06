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
    sectionElement.append(heading, row);
  elements.catalogSections.appendChild(sectionElement);
}

function openFullCategory(categoryId, title) {
  if (!state.catalogReady) return;

  state.fullCategory = {
    id: categoryId,
    title,
    offset: 0,
    total: 0,
    loading: true
  };

  elements.fullCategoryTitle.textContent = title;
  elements.fullCategoryCounter.textContent = "Cargando...";
  elements.fullCategoryGrid.innerHTML = "";
  elements.loadMoreCategoryButton.hidden = true;

  elements.catalogSections.hidden = true;
  elements.continueWatchingSection.hidden = true;
  elements.searchResultsSection.hidden = true;
  elements.fullCategorySection.hidden = false;

  window.scrollTo({ top: 0, behavior: "smooth" });

  requestFullCategoryPage();
}

function requestFullCategoryPage() {
  if (!state.fullCategory.id || state.fullCategory.loading === false) return;

  state.worker.postMessage({
    type: "GET_CATEGORY",
    category: state.fullCategory.id,
    limit: PLANIX_CONFIG.categoryPageSize,
    offset: state.fullCategory.offset
  });
}

function appendFullCategoryResults(items, total, offset) {
  for (const content of items) {
    elements.fullCategoryGrid.appendChild(createContentCard(content));
  }

  state.fullCategory.total = Number(total || 0);
  state.fullCategory.offset = offset + items.length;
  state.fullCategory.loading = false;

  elements.fullCategoryCounter.textContent =
    `${state.fullCategory.total.toLocaleString("es-ES")} tÃ­tulos`;

  elements.loadMoreCategoryButton.hidden =
    state.fullCategory.offset >= state.fullCategory.total;
}

function closeFullCategory() {
  state.fullCategory = {
    id: "",
    title: "",
    offset: 0,
    total: 0,
    loading: false
  };

  elements.fullCategorySection.hidden = true;
  elements.catalogSections.hidden = false;
  renderContinueWatching();

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function loadMoreFullCategory() {
  if (
    !state.fullCategory.id ||
    state.fullCategory.offset >= state.fullCategory.total ||
    state.fullCategory.loading
  ) {
    return;
  }

  state.fullCategory.loading = true;
  elements.loadMoreCategoryButton.disabled = true;
  elements.loadMoreCategoryButton.textContent = "Cargando...";

  state.worker.postMessage({
    type: "GET_CATEGORY",
    category: state.fullCategory.id,
    limit: PLANIX_CONFIG.categoryPageSize,
    offset: state.fullCategory.offset
  });

  window.setTimeout(() => {
    elements.loadMoreCategoryButton.disabled = false;
    elements.loadMoreCategoryButton.textContent = "Mostrar mÃ¡s";
  }, 500);
}

function createContentCard(content, options = {}) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "content-card";
  card.dataset.contentId = content.id;

  if (options.continueWatching) {
    card.classList.add("continue-card");
  }

  const poster = document.createElement("div");
  poster.className = "card-poster";

  if (content.poster) {
    const image = document.createElement("img");
    image.className = "card-poster-image";
    image.src = content.poster;
    image.alt = content.title;
    image.loading = "lazy";
    image.addEventListener("error", () => image.remove());
    poster.appendChild(image);
  }

  const fallback = document.createElement("div");
  fallback.className = "card-poster-fallback";
  fallback.textContent = content.title;
  poster.appendChild(fallback);

  const format = document.createElement("span");
  format.className = "card-format";
  format.textContent = content.format || "VIDEO";
  poster.appendChild(format);

  if (state.favorites.has(content.id)) {
    const favorite = document.createElement("span");
    favorite.className = "card-favorite";
    favorite.textContent = "â™¥";
    poster.appendChild(favorite);
  }

  const overlay = document.createElement("div");
  overlay.className = "card-play-overlay";

  const playIcon = document.createElement("span");
  playIcon.className = "card-play-icon";
  playIcon.textContent = "â–¶";

  overlay.appendChild(playIcon);
  poster.appendChild(overlay);

  if (options.continueWatching) {
    const progress = state.continueWatching[content.id];

    if (progress && progress.duration > 0) {
      const progressContainer = document.createElement("div");
      progressContainer.className = "card-progress";

      const progressValue = document.createElement("div");
      progressValue.className = "card-progress-value";
      progressValue.style.width =
        `${Math.min(100, (progress.currentTime / progress.duration) * 100)}%`;

      progressContainer.appendChild(progressValue);
      poster.appendChild(progressContainer);
    }
  }

  const title = document.createElement("div");
  title.className = "card-title";
  title.textContent = content.title;

  const metadata = document.createElement("div");
  metadata.className = "card-metadata";
  metadata.textContent = [content.year, content.category]
    .filter(Boolean)
    .join(" Â· ");

  card.append(poster, title, metadata);

  card.addEventListener("click", () => openInformation(content));
  card.addEventListener("mouseenter", () => setFeaturedContent(content));
  card.addEventListener("focus", () => setFeaturedContent(content));

  return card;
}

function setFeaturedContent(content) {
  if (!content) return;

  state.featuredContent = content;
  elements.heroTitle.textContent = content.title;
  elements.heroDescription.textContent =
    content.description || "Disponible en Planix Prime.";
  elements.heroYear.textContent = content.year || "CatÃ¡logo";
  elements.heroCategory.textContent = content.category || "PelÃ­culas";

  const image = content.background || content.poster || "";

  if (image) {
    elements.heroBackground.style.backgroundImage = `url("${image}")`;
    elements.heroBackground.classList.add("visible");
  } else {
    elements.heroBackground.style.backgroundImage = "";
    elements.heroBackground.classList.remove("visible");
  }

  elements.heroPlayButton.disabled = false;
  elements.heroInfoButton.disabled = false;
  elements.heroFavoriteButton.disabled = false;

  updateFavoriteButtons(content);
}

/* =========================================================
   REPRODUCTOR MULTIFORMATO
   ========================================================= */

async function openPlayer(content) {
  if (!content?.url) {
    showToast("Este contenido no tiene una URL vÃ¡lida.");
    return;
  }

  state.selectedContent = content;
  elements.playerTitle.textContent = content.title;
  elements.playerMetadata.textContent = [
    content.year,
    content.category,
    content.format
  ].filter(Boolean).join(" Â· ");
  elements.playerDescription.textContent =
    content.description || "Disponible en Planix Prime.";

  elements.playerModal.hidden = false;
  document.body.classList.add("modal-open");

  hidePlayerError();
  showPlayerLoading("Preparando reproducciÃ³n...");
  updateFavoriteButtons(content);

  try {
    await loadMedia(content);
  } catch (error) {
    console.error("Error de reproducciÃ³n:", error);
    showPlayerErrorFor(content, error);
  }
}

async function loadMedia(content) {
  await destroyActivePlayers();

  const url = content.url;
  const format = detectPlaybackFormat(content);
  const video = elements.videoPlayer;

  video.removeAttribute("src");
  video.load();

  const savedProgress = state.continueWatching[content.id];

  const restoreProgress = () => {
    if (
      savedProgress &&
      savedProgress.currentTime > 0 &&
      Number.isFinite(video.duration) &&
      savedProgress.currentTime < video.duration - 15
    ) {
      video.currentTime = savedProgress.currentTime;
    }
  };

  video.addEventListener("loadedmetadata", restoreProgress, { once: true });

  if (format === "m3u8") {
    await playHls(url);
    return;
  }

  if (format === "mpd") {
    await playDash(url);
    return;
  }

  if (format === "ts" || format === "flv") {
    await playMpegTs(url, format);
    return;
  }

  await playNative(url);
}

function detectPlaybackFormat(content) {
  const url = String(content.url || "").split("?")[0].toLowerCase();
  const stated = String(content.format || "").toLowerCase();

  if (url.endsWith(".m3u8") || stated === "m3u8") return "m3u8";
  if (url.endsWith(".mpd") || stated === "mpd") return "mpd";
  if (url.endsWith(".ts") || stated === "ts") return "ts";
  if (url.endsWith(".flv") || stated === "flv") return "flv";
  if (url.endsWith(".mkv") || stated === "mkv") return "mkv";
  if (url.endsWith(".avi") || stated === "avi") return "avi";
  if (url.endsWith(".webm") || stated === "webm") return "webm";
  return "native";
}

async function playNative(url) {
  const video = elements.videoPlayer;
  video.src = url;

  await new Promise((resolve, reject) => {
    const onReady = () => {
      cleanup();
      resolve();
    };

    const onError = () => {
      cleanup();
      reject(new Error("NATIVE_MEDIA_ERROR"));
    };
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("NATIVE_TIMEOUT"));
    }, 15000);

    function cleanup() {
      window.clearTimeout(timeout);
      video.removeEventListener("canplay", onReady);
      video.removeEventListener("error", onError);
    }

    video.addEventListener("canplay", onReady, { once: true });
    video.addEventListener("error", onError, { once: true });
  });

  hidePlayerLoading();
  await video.play();
}

async function playHls(url) {
  const video = elements.videoPlayer;

  if (video.canPlayType("application/vnd.apple.mpegurl")) {
    await playNative(url);
    return;
  }

  if (!window.Hls || !window.Hls.isSupported()) {
    throw new Error("HLS_NOT_SUPPORTED");
  }

  state.players.hls = new window.Hls({
    enableWorker: true,
    lowLatencyMode: false,
    maxBufferLength: 30
  });

  const hls = state.players.hls;

  await new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error("HLS_TIMEOUT"));
    }, 20000);

    hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
      window.clearTimeout(timeout);
      resolve();
    });

    hls.on(window.Hls.Events.ERROR, (_event, data) => {
      if (data.fatal) {
        window.clearTimeout(timeout);
        reject(new Error(`HLS_${data.type || "ERROR"}`));
      }
    });

    hls.loadSource(url);
    hls.attachMedia(video);
  });

  hidePlayerLoading();
  await video.play();
}

async function playDash(url) {
  if (!window.shaka) {
    throw new Error("SHAKA_NOT_LOADED");
  }

  window.shaka.polyfill.installAll();

  if (!window.shaka.Player.isBrowserSupported()) {
    throw new Error("DASH_NOT_SUPPORTED");
  }

  state.players.shaka = new window.shaka.Player();
  await state.players.shaka.attach(elements.videoPlayer);

  state.players.shaka.addEventListener("error", event => {
    console.error("Shaka error:", event.detail);
  });

  await state.players.shaka.load(url);
  hidePlayerLoading();
  await elements.videoPlayer.play();
}

async function playMpegTs(url, format) {
  if (!window.mpegts || !window.mpegts.isSupported()) {
    throw new Error("MPEGTS_NOT_SUPPORTED");
  }

  state.players.mpegts = window.mpegts.createPlayer(
    {
      type: format === "flv" ? "flv" : "mpegts",
      isLive: false,
      url
    },
    {
      enableWorker: true,
      lazyLoad: false
    }
  );

  const player = state.players.mpegts;
  player.attachMediaElement(elements.videoPlayer);
  player.load();

  await new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error("MPEGTS_TIMEOUT"));
    }, 20000);

    player.on(window.mpegts.Events.MEDIA_INFO, () => {
      window.clearTimeout(timeout);
      resolve();
    });

    player.on(window.mpegts.Events.ERROR, () => {
      window.clearTimeout(timeout);
      reject(new Error("MPEGTS_ERROR"));
    });
  });

  hidePlayerLoading();
  await player.play();
}

async function destroyActivePlayers() {
  const video = elements.videoPlayer;

  if (state.players.hls) {
    state.players.hls.destroy();
    state.players.hls = null;
  }

  if (state.players.shaka) {
    try {
      await state.players.shaka.destroy();
    } catch (_) {}
    state.players.shaka = null;
  }

  if (state.players.mpegts) {
    try {
      state.players.mpegts.pause();
      state.players.mpegts.unload();
      state.players.mpegts.detachMediaElement();
      state.players.mpegts.destroy();
    } catch (_) {}
    state.players.mpegts = null;
  }

  video.pause();
  video.removeAttribute("src");
  video.load();
}

async function closePlayer() {
  saveCurrentProgress();
  await destroyActivePlayers();

  elements.playerModal.hidden = true;
  document.body.classList.remove("modal-open");

  hidePlayerError();
  hidePlayerLoading();
}

function showPlayerLoading(message) {
  elements.playerLoadingText.textContent = message;
  elements.playerLoading.hidden = false;
  elements.playerError.hidden = true;
}

function hidePlayerLoading() {
  elements.playerLoading.hidden = true;
}

function hidePlayerError() {
  elements.playerError.hidden = true;
  elements.playerErrorMessage.textContent = "";
}

function showPlayerErrorFor(content, error) {
  hidePlayerLoading();

  const format = detectPlaybackFormat(content);
  let title = "No se pudo reproducir";
  let message = "El enlace no respondiÃ³ o el servidor bloqueÃ³ la reproducciÃ³n.";

  if (format === "mkv" || format === "avi") {
    title = "Formato no compatible";
    message =
      "Este archivo es MKV o AVI. Chrome solo lo abrirÃ¡ si sus cÃ³decs internos son compatibles. " +
      "Para garantizar reproducciÃ³n web debe convertirse o remultiplexarse a MP4 o HLS.";
  } else if (String(error?.message || "").includes("HLS")) {
    message =
      "La seÃ±al HLS no cargÃ³. Puede estar caÃ­da, bloqueada por CORS o requerir autorizaciÃ³n.";
  } else if (String(error?.message || "").includes("DASH") ||
             String(error?.message || "").includes("SHAKA")) {
    message =
      "La seÃ±al DASH/MPD no pudo cargarse o el navegador no la admite.";
  } else if (String(error?.message || "").includes("MPEGTS")) {
    message =
      "El archivo TS/FLV no pudo reproducirse. Puede faltar CORS o el flujo no es compatible.";
  }

  elements.playerErrorTitle.textContent = title;
  elements.playerErrorMessage.textContent = message;
  elements.playerError.hidden = false;
}

function retryPlayer() {
  if (state.selectedContent) {
    openPlayer(state.selectedContent);
  }
}

/* =========================================================
   INFORMACIÃ“N, FAVORITOS Y PROGRESO
   ========================================================= */

function openInformation(content) {
  state.selectedContent = content;

  elements.informationTitle.textContent = content.title;
  elements.informationMetadata.textContent = [
    content.year,
    content.category,
    content.format
  ].filter(Boolean).join(" Â· ");
  elements.informationDescription.textContent =
    content.description || "Disponible en Planix Prime.";

  const background = content.background || content.poster || "";
  elements.informationBackground.style.backgroundImage =
    background ? `url("${background}")` : "";

  elements.informationModal.hidden = false;
  document.body.classList.add("modal-open");

  updateFavoriteButtons(content);
}

function closeInformation() {
  elements.informationModal.hidden = true;
  document.body.classList.remove("modal-open");
}

function toggleFavorite(content) {
  if (!content) return;

  if (state.favorites.has(content.id)) {
    state.favorites.delete(content.id);
    showToast("Eliminado de Mi lista.");
  } else {
    state.favorites.add(content.id);
    showToast("Agregado a Mi lista.");
  }

  localStorage.setItem(
    "planixFavorites",
    JSON.stringify(Array.from(state.favorites))
  );

  updateFavoriteButtons(content);
  refreshVisibleCards();
}

function updateFavoriteButtons(content) {
  if (!content) return;

  const isFavorite = state.favorites.has(content.id);

  elements.heroFavoriteButton.textContent =
    isFavorite ? "â™¥ En mi lista" : "â™¡ Mi lista";
  elements.playerFavoriteButton.textContent =
    isFavorite ? "Quitar de Mi lista" : "Agregar a Mi lista";
  elements.informationFavoriteButton.textContent =
    isFavorite ? "Quitar de Mi lista" : "Agregar a Mi lista";
}

function refreshVisibleCards() {
  document.querySelectorAll(".content-card").forEach(card => {
    const id = card.dataset.contentId;
    const poster = card.querySelector(".card-poster");
    const existingFavorite = card.querySelector(".card-favorite");
    const isFavorite = state.favorites.has(id);

    if (isFavorite && !existingFavorite) {
      const favorite = document.createElement("span");
      favorite.className = "card-favorite";
      favorite.textContent = "â™¥";
      poster?.appendChild(favorite);
    }

    if (!isFavorite && existingFavorite) {
      existingFavorite.remove();
    }
  });
}

function saveCurrentProgress() {
  const content = state.selectedContent;
  const player = elements.videoPlayer;

  if (
    !content ||
    !Number.isFinite(player.currentTime) ||
    !Number.isFinite(player.duration) ||
    player.duration <= 0
  ) {
    return;
  }

  if (player.currentTime >= player.duration - 30) {
    delete state.continueWatching[content.id];
  } else if (player.currentTime > 10) {
    state.continueWatching[content.id] = {
      content,
      currentTime: player.currentTime,
      duration: player.duration,
      updatedAt: Date.now()
    };
  }

  localStorage.setItem(
    "planixContinueWatching",
    JSON.stringify(state.continueWatching)
  );

  renderContinueWatching();
}

function renderContinueWatching() {
  const items = Object.values(state.continueWatching)
    .sort((first, second) => second.updatedAt - first.updatedAt)
    .slice(0, PLANIX_CONFIG.continueWatchingLimit);

  elements.continueWatchingRow.innerHTML = "";

  if (!items.length) {
    elements.continueWatchingSection.hidden = true;
    return;
  }

  elements.continueWatchingSection.hidden = false;

  for (const progress of items) {
    if (!progress.content) continue;

    elements.continueWatchingRow.appendChild(
      createContentCard(progress.content, { continueWatching: true })
    );
  }
}

/* =========================================================
   BÃšSQUEDA Y NAVEGACIÃ“N
   ========================================================= */

function handleSearchInput() {
  const query = elements.searchInput.value.trim();
  elements.clearSearchButton.hidden = query.length === 0;

  clearTimeout(state.searchTimer);
  state.searchTimer = window.setTimeout(() => performSearch(query), 280);
}

function performSearch(query) {
  if (query.length < PLANIX_CONFIG.searchMinimumCharacters) {
    hideSearchResults();
    return;
  }

  if (!state.catalogReady) {
    showToast("Espera a que termine de cargar el catÃ¡logo.");
    return;
  }

  elements.fullCategorySection.hidden = true;
  elements.catalogSections.hidden = false;

  state.worker.postMessage({
    type: "SEARCH",
    query,
    limit: PLANIX_CONFIG.searchLimit
  });
}

function renderSearchResults(results, total) {
  elements.searchResultsGrid.innerHTML = "";
  elements.searchResultsSection.hidden = false;
  elements.searchResultCounter.textContent =
    `${Number(total).toLocaleString("es-ES")} resultados`;
  elements.emptyState.hidden = results.length > 0;

  for (const content of results) {
    elements.searchResultsGrid.appendChild(createContentCard(content));
  }

  elements.searchResultsSection.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

function hideSearchResults() {
  elements.searchResultsSection.hidden = true;
  elements.searchResultsGrid.innerHTML = "";
  elements.emptyState.hidden = true;
}

function clearSearch() {
  elements.searchInput.value = "";
  elements.clearSearchButton.hidden = true;
  hideSearchResults();
  elements.searchInput.focus();
}

function changeSection(sectionId) {
  state.activeSection = sectionId;

  elements.navigationButtons.forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.section === sectionId
    );
  });

  if (sectionId === "inicio") {
    closeFullCategory();
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }

  if (sectionId === "favoritos") {
    showFavorites();
    return;
  }

  const sectionConfig = state.config.sections.find(
    section => section.id === sectionId
  );

  if (sectionConfig) {
    openFullCategory(sectionConfig.id, sectionConfig.title);
  } else {
    showToast("Esta secciÃ³n todavÃ­a no tiene contenido.");
  }
}

function showFavorites() {
  const favorites = [];

  for (const items of state.categoryResults.values()) {
    for (const content of items) {
      if (
        state.favorites.has(content.id) &&
        !favorites.some(item => item.id === content.id)
      ) {
        favorites.push(content);
      }
    }
  }

  elements.fullCategorySection.hidden = true;
  elements.catalogSections.hidden = false;
  elements.searchResultsSection.hidden = false;
  elements.searchResultsGrid.innerHTML = "";
  elements.searchResultCounter.textContent = `${favorites.length} favoritos`;
  elements.emptyState.hidden = favorites.length > 0;

  for (const content of favorites) {
    elements.searchResultsGrid.appendChild(createContentCard(content));
  }

  elements.searchResultsSection.scrollIntoView({ behavior: "smooth" });
}

function restoreLocalData() {
  try {
    state.favorites = new Set(
      JSON.parse(localStorage.getItem("planixFavorites") || "[]")
    );

    state.continueWatching = JSON.parse(
      localStorage.getItem("planixContinueWatching") || "{}"
    );
  } catch (error) {
    console.warn("No se pudieron restaurar los datos locales.", error);
    state.favorites = new Set();
    state.continueWatching = {};
  }
}

/* =========================================================
   EVENTOS
   ========================================================= */

function registerEvents() {
  elements.navigationButtons.forEach(button => {
    button.addEventListener("click", () => {
      changeSection(button.dataset.section);
    });
  });

  elements.searchInput.addEventListener("input", handleSearchInput);
  elements.clearSearchButton.addEventListener("click", clearSearch);

  elements.heroPlayButton.addEventListener("click", () => {
    openPlayer(state.featuredContent);
  });

  elements.heroInfoButton.addEventListener("click", () => {
    openInformation(state.featuredContent);
  });

  elements.heroFavoriteButton.addEventListener("click", () => {
    toggleFavorite(state.featuredContent);
  });

  elements.closePlayerButton.addEventListener("click", closePlayer);
  elements.retryPlayerButton.addEventListener("click", retryPlayer);

  elements.closeInformationButton.addEventListener(
    "click",
    closeInformation
  );

  elements.informationPlayButton.addEventListener("click", () => {
    const content = state.selectedContent;
    closeInformation();
    openPlayer(content);
  });

  elements.playerFavoriteButton.addEventListener("click", () => {
    toggleFavorite(state.selectedContent);
  });

  elements.informationFavoriteButton.addEventListener("click", () => {
    toggleFavorite(state.selectedContent);
  });

  elements.backToHomeButton.addEventListener("click", closeFullCategory);
  elements.loadMoreCategoryButton.addEventListener(
    "click",
    loadMoreFullCategory
  );

  elements.videoPlayer.addEventListener("waiting", () => {
    showPlayerLoading("Cargando reproducciÃ³n...");
  });

  elements.videoPlayer.addEventListener("playing", hidePlayerLoading);
  elements.videoPlayer.addEventListener("pause", saveCurrentProgress);
  elements.videoPlayer.addEventListener(
    "timeupdate",
    debounce(saveCurrentProgress, 5000)
  );

  elements.videoPlayer.addEventListener("ended", () => {
    if (state.selectedContent) {
      delete state.continueWatching[state.selectedContent.id];

      localStorage.setItem(
        "planixContinueWatching",
        JSON.stringify(state.continueWatching)
      );

      renderContinueWatching();
    }
  });

  elements.playerModal.addEventListener("click", event => {
    if (event.target.classList.contains("modal-backdrop")) {
      closePlayer();
    }
  });

  elements.informationModal.addEventListener("click", event => {
    if (event.target.classList.contains("modal-backdrop")) {
      closeInformation();
    }
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      if (!elements.playerModal.hidden) closePlayer();
      if (!elements.informationModal.hidden) closeInformation();
      if (!elements.fullCategorySection.hidden) closeFullCategory();
    }
  });
}

/* =========================================================
   AYUDANTES
   ========================================================= */

async function fetchJSON(url) {
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`No se pudo cargar ${url}. Estado ${response.status}`);
  }

  return response.json();
}

function updateLoading(message, percentage) {
  elements.loadingMessage.textContent = message;
  elements.loadingProgressBar.style.width =
    `${Math.max(0, Math.min(100, percentage))}%`;
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");

  clearTimeout(showToast.timer);

  showToast.timer = window.setTimeout(() => {
    elements.toast.classList.remove("show");
  }, PLANIX_CONFIG.toastDuration);
}

function debounce(callback, delay) {
  let timer;

  return (...argumentsList) => {
    clearTimeout(timer);

    timer = window.setTimeout(() => {
      callback(...argumentsList);
    }, delay);
  };
}
