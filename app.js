(function () {
  const STORAGE_KEY = "promptLibrary.items";
  const RATINGS_STORAGE_KEY = "promptLibrary.ratings";
  const NOTES_STORAGE_KEY = "promptLibrary.notes";

  const EXPORT_VERSION = 1;
  const EXPORT_FILE_PREFIX = "prompt-library-export";

  const form = document.getElementById("prompt-form");
  const titleInput = document.getElementById("prompt-title");
  const modelInput = document.getElementById("prompt-model");
  const contentInput = document.getElementById("prompt-content");
  const promptList = document.getElementById("prompt-list");
  const promptCount = document.getElementById("prompt-count");
  const exportButton = document.getElementById("export-prompts");
  const importButton = document.getElementById("import-prompts");
  const importFileInput = document.getElementById("import-file-input");

  /** @type {{ id: string; title: string; content: string; createdAt: number; }[]} */
  let prompts = [];

  /** @type {{ [promptId: string]: { noteId: string; promptId: string; text: string; updatedAt: number; }[] }} */
  let promptNotes = {};

  let lastNotesError = "";

  /**
   * @typedef {"high" | "medium" | "low"} TokenConfidence
   * @typedef {{ min: number; max: number; confidence: TokenConfidence }} TokenEstimate
   * @typedef {{ model: string; createdAt: string; updatedAt: string; tokenEstimate: TokenEstimate }} PromptMetadata
   */

  function isValidIsoDate(value) {
    if (typeof value !== "string") return false;
    try {
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) return false;
      return parsed.toISOString() === value;
    } catch (err) {
      return false;
    }
  }

  /**
   * @param {string} text
   * @param {boolean} isCode
   * @returns {TokenEstimate}
   */
  function estimateTokens(text, isCode) {
    if (typeof text !== "string") {
      throw new Error("estimateTokens: text must be a string");
    }

    const normalized = text.trim();
    const words = normalized ? normalized.split(/\s+/g) : [];
    const wordCount = words.length;
    const charCount = normalized.length;

    let min = 0.75 * wordCount;
    let max = 0.25 * charCount;

    if (isCode) {
      min *= 1.3;
      max *= 1.3;
    }

    const minRounded = Math.max(0, Math.round(min));
    const maxRounded = Math.max(minRounded, Math.round(max));

    let confidence;
    if (maxRounded < 1000) {
      confidence = "high";
    } else if (maxRounded <= 5000) {
      confidence = "medium";
    } else {
      confidence = "low";
    }

    return {
      min: minRounded,
      max: maxRounded,
      confidence,
    };
  }

  /**
   * @param {string} modelName
   * @param {string} content
   * @returns {PromptMetadata}
   */
  function trackModel(modelName, content) {
    if (typeof modelName !== "string") {
      throw new Error("Model name must be a string.");
    }
    const trimmedModel = modelName.trim();
    if (!trimmedModel) {
      throw new Error("Model name must not be empty.");
    }
    if (trimmedModel.length > 100) {
      throw new Error("Model name must be 100 characters or fewer.");
    }

    const createdAt = new Date().toISOString();
    const tokenEstimate = estimateTokens(content || "", false);

    return {
      model: trimmedModel,
      createdAt,
      updatedAt: createdAt,
      tokenEstimate,
    };
  }

  /**
   * @param {PromptMetadata} metadata
   * @returns {PromptMetadata}
   */
  function updateTimestamps(metadata) {
    if (!metadata || typeof metadata !== "object") {
      throw new Error("updateTimestamps: metadata must be an object.");
    }
    if (!isValidIsoDate(metadata.createdAt)) {
      throw new Error("createdAt must be a valid ISO 8601 string.");
    }

    const createdAtDate = new Date(metadata.createdAt);
    const updatedAt = new Date().toISOString();
    const updatedAtDate = new Date(updatedAt);

    if (updatedAtDate.getTime() < createdAtDate.getTime()) {
      throw new Error("updatedAt must be greater than or equal to createdAt.");
    }

    return {
      ...metadata,
      updatedAt,
    };
  }

  function formatDateTime(date) {
    return date.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function getPromptCreatedAtMs(prompt) {
    if (prompt && prompt.metadata && isValidIsoDate(prompt.metadata.createdAt)) {
      const parsed = Date.parse(prompt.metadata.createdAt);
      if (!Number.isNaN(parsed)) return parsed;
    }

    if (typeof prompt.createdAt === "number" && Number.isFinite(prompt.createdAt)) {
      return prompt.createdAt;
    }

    if (typeof prompt.id === "string") {
      const numericPrefix = Number.parseInt(prompt.id.split("-")[0], 10);
      if (Number.isFinite(numericPrefix)) return numericPrefix;
    }

    return 0;
  }

  function ensurePromptMetadata(prompt) {
    if (prompt.metadata && typeof prompt.metadata === "object") {
      const existing = prompt.metadata;
      if (typeof existing.model === "string" && isValidIsoDate(existing.createdAt) && isValidIsoDate(existing.updatedAt) && existing.tokenEstimate && typeof existing.tokenEstimate.min === "number" && typeof existing.tokenEstimate.max === "number") {
        return prompt;
      }
    }

    const baseCreated =
      typeof prompt.createdAt === "number" && Number.isFinite(prompt.createdAt)
        ? new Date(prompt.createdAt)
        : new Date();

    let metadata;
    try {
      metadata = trackModel("Unknown model", prompt.content || "");
    } catch (err) {
      metadata = {
        model: "Unknown model",
        createdAt: baseCreated.toISOString(),
        updatedAt: baseCreated.toISOString(),
        tokenEstimate: estimateTokens(prompt.content || "", false),
      };
    }

    metadata.createdAt = baseCreated.toISOString();
    metadata.updatedAt = metadata.createdAt;

    return {
      ...prompt,
      createdAt: baseCreated.getTime(),
      metadata,
    };
  }

  function computeExportStats(allPrompts, ratings) {
    const totalPrompts = Array.isArray(allPrompts) ? allPrompts.length : 0;

    const ratingValues = ratings && typeof ratings === "object"
      ? Object.values(ratings).filter((value) =>
          typeof value === "number" && Number.isFinite(value) && value >= 1 && value <= 5
        )
      : [];

    const averageRating = ratingValues.length
      ? ratingValues.reduce((sum, value) => sum + value, 0) / ratingValues.length
      : 0;

    const roundedAverageRating = Number.isFinite(averageRating)
      ? Math.round(averageRating * 100) / 100
      : 0;

    const modelCounts = {};
    for (const prompt of allPrompts || []) {
      if (!prompt) continue;
      let modelName =
        prompt.metadata && typeof prompt.metadata.model === "string"
          ? prompt.metadata.model.trim()
          : "Unknown";
      if (!modelName) modelName = "Unknown";
      modelCounts[modelName] = (modelCounts[modelName] || 0) + 1;
    }

    let mostUsedModel = null;
    let highestCount = 0;
    for (const [modelName, count] of Object.entries(modelCounts)) {
      if (count > highestCount) {
        highestCount = count;
        mostUsedModel = modelName;
      }
    }

    return {
      totalPrompts,
      averageRating: roundedAverageRating,
      mostUsedModel,
      ratingsCount: ratingValues.length,
    };
  }

  function loadNotes() {
    try {
      const raw = window.localStorage.getItem(NOTES_STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return {};
      const safe = {};
      for (const [promptId, notes] of Object.entries(parsed)) {
        if (!Array.isArray(notes)) continue;
        safe[promptId] = notes
          .filter(
            (note) =>
              note &&
              typeof note.noteId === "string" &&
              typeof note.promptId === "string" &&
              typeof note.text === "string"
          )
          .map((note) => ({
            noteId: note.noteId,
            promptId: note.promptId,
            text: note.text,
            updatedAt:
              typeof note.updatedAt === "number" && Number.isFinite(note.updatedAt)
                ? note.updatedAt
                : Date.now(),
          }));
      }
      return safe;
    } catch (err) {
      console.error("Failed to load notes from localStorage", err);
      lastNotesError = "Unable to load notes. Storage not available.";
      return {};
    }
  }

  function persistNotes() {
    try {
      window.localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(promptNotes));
      lastNotesError = "";
      return true;
    } catch (err) {
      console.error("Failed to save notes to localStorage", err);
      lastNotesError = "Unable to save notes. Storage not available.";
      return false;
    }
  }

  function loadRatings() {
    try {
      const raw = window.localStorage.getItem(RATINGS_STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (err) {
      console.error("Failed to load ratings from localStorage", err);
      return {};
    }
  }

  function saveRatings(ratings) {
    try {
      window.localStorage.setItem(RATINGS_STORAGE_KEY, JSON.stringify(ratings));
    } catch (err) {
      console.error("Failed to save ratings to localStorage", err);
    }
  }

  function buildExportPayload() {
    const currentPrompts = Array.isArray(prompts)
      ? prompts.map((prompt) => ensurePromptMetadata(prompt))
      : [];

    const ratings = loadRatings();
    const notesSnapshot = loadNotes();
    const exportedAt = new Date().toISOString();
    const stats = computeExportStats(currentPrompts, ratings);

    return {
      version: EXPORT_VERSION,
      exportedAt,
      stats,
      data: {
        prompts: currentPrompts,
        ratings,
        notes: notesSnapshot,
      },
    };
  }

  function triggerExportDownload() {
    try {
      const payload = buildExportPayload();
      const json = JSON.stringify(payload, null, 2);
      const blob = new Blob([json], { type: "application/json" });

      const timestampForFilename = new Date()
        .toISOString()
        .replace(/[:.]/g, "-");
      const filename = `${EXPORT_FILE_PREFIX}-${timestampForFilename}.json`;

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to export prompts", err);
      const message =
        err instanceof Error
          ? err.message
          : "An unexpected error occurred while exporting prompts.";
      window.alert(`Export failed. Details: ${message}`);
    }
  }

  function getRatingForPrompt(promptId) {
    const ratings = loadRatings();
    const value = ratings[promptId];
    if (typeof value === "number" && value >= 1 && value <= 5) {
      return value;
    }
    return 0;
  }

  function setRatingForPrompt(promptId, value) {
    const rating = Math.max(1, Math.min(5, value));
    const ratings = loadRatings();
    ratings[promptId] = rating;
    saveRatings(ratings);
  }

  function validateImportedStructure(parsed) {
    if (!parsed || typeof parsed !== "object") {
      throw new Error("Imported file is not a valid JSON object.");
    }

    const version = parsed.version;
    if (version !== EXPORT_VERSION) {
      throw new Error(
        typeof version === "number"
          ? `Unsupported export version ${version}. Expected version ${EXPORT_VERSION}.`
          : "Missing or invalid export version."
      );
    }

    if (!parsed.data || typeof parsed.data !== "object") {
      throw new Error("Missing data section in imported file.");
    }

    const data = parsed.data;
    const importedPrompts = Array.isArray(data.prompts) ? data.prompts : [];
    const importedRatings = data.ratings && typeof data.ratings === "object" ? data.ratings : {};
    const importedNotes = data.notes && typeof data.notes === "object" ? data.notes : {};

    const safePrompts = importedPrompts
      .filter(
        (item) =>
          item &&
          typeof item.id === "string" &&
          typeof item.title === "string" &&
          typeof item.content === "string"
      )
      .map((item) => ensurePromptMetadata(item));

    const safeRatings = {};
    for (const [promptId, value] of Object.entries(importedRatings)) {
      if (
        typeof promptId === "string" &&
        typeof value === "number" &&
        Number.isFinite(value) &&
        value >= 1 &&
        value <= 5
      ) {
        safeRatings[promptId] = value;
      }
    }

    const safeNotes = {};
    for (const [promptId, notes] of Object.entries(importedNotes)) {
      if (!Array.isArray(notes)) continue;
      const normalized = notes
        .filter((note) => note && typeof note.text === "string")
        .map((note) => ({
          noteId:
            typeof note.noteId === "string"
              ? note.noteId
              : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          promptId: String(promptId),
          text: note.text,
          updatedAt:
            typeof note.updatedAt === "number" && Number.isFinite(note.updatedAt)
              ? note.updatedAt
              : Date.now(),
        }));
      if (normalized.length) {
        safeNotes[promptId] = normalized;
      }
    }

    return {
      prompts: safePrompts,
      ratings: safeRatings,
      notes: safeNotes,
    };
  }

  function loadPrompts() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (item) =>
          item &&
          typeof item.id === "string" &&
          typeof item.title === "string" &&
          typeof item.content === "string"
      );
    } catch (err) {
      console.error("Failed to load prompts from localStorage", err);
      return [];
    }
  }

  function persistPrompts() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prompts));
    } catch (err) {
      console.error("Failed to save prompts to localStorage", err);
    }
  }

  function formatCountLabel(count) {
    if (count === 1) return "1 prompt";
    return `${count} prompts`;
  }

  function getContentPreview(content, maxWords = 18) {
    const trimmed = content.trim().replace(/\s+/g, " ");
    if (!trimmed) return "(empty prompt)";

    const words = trimmed.split(" ");
    if (words.length <= maxWords) {
      return trimmed;
    }

    return words.slice(0, maxWords).join(" ") + " …";
  }

  function renderEmptyState() {
    const wrapper = document.createElement("div");
    wrapper.className = "prompt-empty-state";
    wrapper.innerHTML =
      "<strong>No prompts yet.</strong><br />Use the form on the left to save your first prompt.";
    promptList.appendChild(wrapper);
  }

  function renderPrompts() {
    promptList.innerHTML = "";

    if (!prompts.length) {
      promptCount.textContent = formatCountLabel(0);
      renderEmptyState();
      return;
    }

    const sortedPrompts = [...prompts].sort((a, b) => {
      return getPromptCreatedAtMs(b) - getPromptCreatedAtMs(a);
    });

    promptCount.textContent = formatCountLabel(sortedPrompts.length);

    sortedPrompts.forEach((prompt) => {
      const card = document.createElement("article");
      card.className = "prompt-card";
      card.dataset.id = prompt.id;

      const header = document.createElement("div");
      header.className = "prompt-card-header";

      const titleEl = document.createElement("h3");
      titleEl.className = "prompt-title";
      titleEl.title = prompt.title;
      titleEl.textContent = prompt.title || "Untitled prompt";

      const meta = document.createElement("div");
      meta.className = "prompt-meta";

      const metaLeft = document.createElement("div");
      metaLeft.className = "prompt-meta-left";

      const metaRight = document.createElement("div");
      metaRight.className = "prompt-meta-right";

      const metadata = prompt.metadata && typeof prompt.metadata === "object" ? prompt.metadata : null;

      const modelRow = document.createElement("div");
      modelRow.className = "prompt-model-row";

      const modelLabel = document.createElement("span");
      modelLabel.className = "prompt-model-label";
      modelLabel.textContent = "Model";

      const modelNameEl = document.createElement("span");
      modelNameEl.className = "prompt-model-name";
      modelNameEl.textContent = metadata && typeof metadata.model === "string" && metadata.model.trim()
        ? metadata.model
        : "Unknown";

      modelRow.appendChild(modelLabel);
      modelRow.appendChild(modelNameEl);

      const createdBase = metadata && isValidIsoDate(metadata.createdAt)
        ? new Date(metadata.createdAt)
        : new Date(prompt.createdAt || Date.now());
      const updatedBase = metadata && isValidIsoDate(metadata.updatedAt)
        ? new Date(metadata.updatedAt)
        : createdBase;

      const timestampsEl = document.createElement("div");
      timestampsEl.className = "prompt-timestamps";
      timestampsEl.textContent = `Created ${formatDateTime(createdBase)} · Updated ${formatDateTime(updatedBase)}`;

      metaLeft.appendChild(modelRow);
      metaLeft.appendChild(timestampsEl);

      const tokenRow = document.createElement("div");
      tokenRow.className = "prompt-token-row";

      const tokenRangeEl = document.createElement("span");
      tokenRangeEl.className = "token-range";

      const tokenBadge = document.createElement("span");
      tokenBadge.className = "token-confidence-badge";

      if (metadata && metadata.tokenEstimate) {
        const estimate = metadata.tokenEstimate;
        tokenRangeEl.textContent = `Tokens: ~${estimate.min}–${estimate.max}`;

        if (estimate.confidence === "high") {
          tokenBadge.classList.add("token-confidence-high");
          tokenBadge.textContent = "High confidence";
        } else if (estimate.confidence === "medium") {
          tokenBadge.classList.add("token-confidence-medium");
          tokenBadge.textContent = "Medium confidence";
        } else {
          tokenBadge.classList.add("token-confidence-low");
          tokenBadge.textContent = "Low confidence";
        }
      } else {
        tokenRangeEl.textContent = "Tokens: n/a";
        tokenBadge.classList.add("token-confidence-medium");
        tokenBadge.textContent = "Estimate unavailable";
      }

      tokenRow.appendChild(tokenRangeEl);
      tokenRow.appendChild(tokenBadge);

      metaRight.appendChild(tokenRow);

      meta.appendChild(metaLeft);
      meta.appendChild(metaRight);

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "btn btn-ghost btn-danger";
      deleteBtn.textContent = "Delete";
      deleteBtn.setAttribute("aria-label", `Delete prompt: ${prompt.title}`);
      deleteBtn.dataset.action = "delete";
      deleteBtn.dataset.id = prompt.id;

      header.appendChild(titleEl);
      header.appendChild(deleteBtn);

      const preview = document.createElement("p");
      preview.className = "prompt-preview";
      preview.textContent = getContentPreview(prompt.content);

      const ratingWrapper = document.createElement("div");
      ratingWrapper.className = "prompt-rating";
      ratingWrapper.dataset.id = prompt.id;
      ratingWrapper.setAttribute("role", "radiogroup");
      ratingWrapper.setAttribute("aria-label", "Rate prompt effectiveness");

      const currentRating = getRatingForPrompt(prompt.id);
      for (let i = 1; i <= 5; i++) {
        const star = document.createElement("button");
        star.type = "button";
        star.className =
          "rating-star" + (i <= currentRating ? " rating-star-active" : "");
        star.textContent = "★";
        star.dataset.value = String(i);
        star.dataset.action = "rate";
        star.setAttribute("aria-label", `${i} star${i === 1 ? "" : "s"}`);
        star.setAttribute("role", "radio");
        star.setAttribute("aria-checked", i === currentRating ? "true" : "false");
        ratingWrapper.appendChild(star);
      }

      const notesSection = document.createElement("section");
      notesSection.className = "prompt-notes";
      notesSection.dataset.promptId = prompt.id;

      const notesHeader = document.createElement("div");
      notesHeader.className = "prompt-notes-header";

      const notesTitle = document.createElement("h4");
      notesTitle.className = "prompt-notes-title";
      notesTitle.textContent = "Notes";

      const addNoteBtn = document.createElement("button");
      addNoteBtn.type = "button";
      addNoteBtn.className = "btn btn-ghost btn-note-add";
      addNoteBtn.textContent = "Add Note";
      addNoteBtn.dataset.action = "note-add";
      addNoteBtn.dataset.promptId = prompt.id;

      notesHeader.appendChild(notesTitle);
      notesHeader.appendChild(addNoteBtn);

      const notesList = document.createElement("ul");
      notesList.className = "prompt-notes-list";
      notesList.dataset.promptId = prompt.id;

      const notes = promptNotes[prompt.id] || [];
      notes.forEach((note) => {
        const item = document.createElement("li");
        item.className = "prompt-note";
        item.dataset.noteId = note.noteId;
        item.dataset.promptId = note.promptId;

        const text = document.createElement("p");
        text.className = "prompt-note-text";
        text.textContent = note.text;

        const actions = document.createElement("div");
        actions.className = "prompt-note-actions";

        const editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.className = "btn btn-ghost btn-note-edit";
        editBtn.textContent = "Edit";
        editBtn.dataset.action = "note-edit";
        editBtn.dataset.noteId = note.noteId;
        editBtn.dataset.promptId = note.promptId;

        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "btn btn-ghost btn-danger btn-note-delete";
        deleteBtn.textContent = "Delete";
        deleteBtn.dataset.action = "note-delete";
        deleteBtn.dataset.noteId = note.noteId;
        deleteBtn.dataset.promptId = note.promptId;

        actions.appendChild(editBtn);
        actions.appendChild(deleteBtn);

        item.appendChild(text);
        item.appendChild(actions);
        notesList.appendChild(item);
      });

      const notesError = document.createElement("div");
      notesError.className = "prompt-notes-error";
      notesError.textContent = lastNotesError;
      notesError.hidden = !lastNotesError;

      notesSection.appendChild(notesHeader);
      notesSection.appendChild(notesList);
      notesSection.appendChild(notesError);

      card.appendChild(header);
      card.appendChild(preview);
      card.appendChild(ratingWrapper);
      card.appendChild(notesSection);
      card.appendChild(meta);

      promptList.appendChild(card);
    });
  }

  function handleDelete(targetId) {
    const next = prompts.filter((p) => p.id !== targetId);
    if (next.length === prompts.length) return;
    prompts = next;
    persistPrompts();
    renderPrompts();
  }

  function handleFormSubmit(event) {
    event.preventDefault();

    const title = titleInput.value.trim();
    const modelName = modelInput.value.trim();
    const content = contentInput.value.trim();

    if (!title || !content || !modelName) {
      // Basic guard; browser required attribute also helps
      return;
    }

    let metadata;
    try {
      metadata = trackModel(modelName, content);
    } catch (err) {
      console.error("Failed to create prompt metadata", err);
      const message = err instanceof Error ? err.message : "Unable to save prompt metadata.";
      window.alert(message);
      return;
    }

    const prompt = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      title,
      content,
      createdAt: Date.now(),
      metadata,
    };

    prompts.unshift(prompt);
    persistPrompts();
    renderPrompts();

    form.reset();
    titleInput.focus();
  }

  function handleListClick(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.dataset.action === "delete" && target.dataset.id) {
      handleDelete(target.dataset.id);
      return;
    }

    if (target.dataset.action === "rate" && target.dataset.value) {
      const ratingContainer = target.closest(".prompt-rating");
      if (!ratingContainer) return;
      const promptId = ratingContainer.dataset.id;
      if (!promptId) return;

      const value = Number.parseInt(target.dataset.value, 10);
      if (!Number.isFinite(value)) return;

      setRatingForPrompt(promptId, value);
      const prompt = prompts.find((p) => p.id === promptId);
      if (prompt && prompt.metadata) {
        try {
          prompt.metadata = updateTimestamps(prompt.metadata);
          persistPrompts();
        } catch (err) {
          console.error("Failed to update metadata timestamp after rating", err);
        }
      }

      renderPrompts();
      return;
    }

    if (target.dataset.action === "note-add" && target.dataset.promptId) {
      const promptId = target.dataset.promptId;
      const notesList = promptList.querySelector(
        `.prompt-notes-list[data-prompt-id="${CSS.escape(promptId)}"]`
      );
      if (!notesList) return;

      const existingEditor = notesList.querySelector(".prompt-note-editor");
      if (existingEditor) {
        const textarea = existingEditor.querySelector("textarea");
        if (textarea) textarea.focus();
        return;
      }

      const editorItem = document.createElement("li");
      editorItem.className = "prompt-note prompt-note-editor";
      editorItem.dataset.promptId = promptId;
      editorItem.dataset.mode = "new";

      const textarea = document.createElement("textarea");
      textarea.className = "field-input prompt-note-input";
      textarea.rows = 3;
      textarea.placeholder = "Write a note...";

      const actions = document.createElement("div");
      actions.className = "prompt-note-actions";

      const saveBtn = document.createElement("button");
      saveBtn.type = "button";
      saveBtn.className = "btn btn-primary btn-note-save";
      saveBtn.textContent = "Save";
      saveBtn.dataset.action = "note-save";
      saveBtn.dataset.promptId = promptId;

      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "btn btn-ghost btn-note-cancel";
      cancelBtn.textContent = "Cancel";
      cancelBtn.dataset.action = "note-cancel";

      actions.appendChild(saveBtn);
      actions.appendChild(cancelBtn);

      editorItem.appendChild(textarea);
      editorItem.appendChild(actions);

      notesList.insertBefore(editorItem, notesList.firstChild);
      textarea.focus();
      return;
    }

    if (target.dataset.action === "note-cancel") {
      const editor = target.closest(".prompt-note-editor");
      if (!editor) return;

      const mode = editor.dataset.mode;
      if (mode === "edit") {
        const promptId = editor.dataset.promptId;
        const noteId = editor.dataset.noteId;
        if (!promptId || !noteId) {
          editor.remove();
          return;
        }

        const notes = promptNotes[promptId] || [];
        const note = notes.find((n) => n.noteId === noteId);
        const notesList = editor.parentElement;
        if (!note || !notesList) {
          editor.remove();
          return;
        }

        const item = document.createElement("li");
        item.className = "prompt-note";
        item.dataset.noteId = note.noteId;
        item.dataset.promptId = note.promptId;

        const text = document.createElement("p");
        text.className = "prompt-note-text";
        text.textContent = note.text;

        const actions = document.createElement("div");
        actions.className = "prompt-note-actions";

        const editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.className = "btn btn-ghost btn-note-edit";
        editBtn.textContent = "Edit";
        editBtn.dataset.action = "note-edit";
        editBtn.dataset.noteId = note.noteId;
        editBtn.dataset.promptId = note.promptId;

        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "btn btn-ghost btn-danger btn-note-delete";
        deleteBtn.textContent = "Delete";
        deleteBtn.dataset.action = "note-delete";
        deleteBtn.dataset.noteId = note.noteId;
        deleteBtn.dataset.promptId = note.promptId;

        actions.appendChild(editBtn);
        actions.appendChild(deleteBtn);

        item.appendChild(text);
        item.appendChild(actions);

        notesList.replaceChild(item, editor);
      } else {
        editor.remove();
      }
      return;
    }

    if (target.dataset.action === "note-save" && target.dataset.promptId) {
      const editor = target.closest(".prompt-note-editor");
      if (!editor) return;

      const textarea = editor.querySelector("textarea");
      if (!(textarea instanceof HTMLTextAreaElement)) return;

      const textValue = textarea.value.trim();
      if (!textValue) {
        editor.remove();
        return;
      }

      const promptId = target.dataset.promptId;
      const mode = editor.dataset.mode;
      const noteId = editor.dataset.noteId;

      const existing = promptNotes[promptId] || [];

      if (mode === "edit" && noteId) {
        const updated = existing.map((note) =>
          note.noteId === noteId
            ? { ...note, text: textValue, updatedAt: Date.now() }
            : note
        );
        promptNotes[promptId] = updated;
      } else {
        const newNote = {
          noteId: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          promptId,
          text: textValue,
          updatedAt: Date.now(),
        };
        promptNotes[promptId] = [newNote, ...existing];
      }

      if (persistNotes()) {
        const prompt = prompts.find((p) => p.id === promptId);
        if (prompt && prompt.metadata) {
          try {
            prompt.metadata = updateTimestamps(prompt.metadata);
            persistPrompts();
          } catch (err) {
            console.error("Failed to update metadata timestamp after saving note", err);
          }
        }

        renderPrompts();
      }
      return;
    }

    if (target.dataset.action === "note-edit" && target.dataset.promptId && target.dataset.noteId) {
      const promptId = target.dataset.promptId;
      const noteId = target.dataset.noteId;
      const notesList = promptList.querySelector(
        `.prompt-notes-list[data-prompt-id="${CSS.escape(promptId)}"]`
      );
      if (!notesList) return;

      const existingEditor = notesList.querySelector(".prompt-note-editor");
      if (existingEditor) {
        const textarea = existingEditor.querySelector("textarea");
        if (textarea) textarea.focus();
        return;
      }

      const notes = promptNotes[promptId] || [];
      const note = notes.find((n) => n.noteId === noteId);
      if (!note) return;

      const originalItem = notesList.querySelector(
        `.prompt-note[data-note-id="${CSS.escape(noteId)}"]`
      );
      if (!originalItem) return;

      const editorItem = document.createElement("li");
      editorItem.className = "prompt-note prompt-note-editor";
      editorItem.dataset.promptId = promptId;
      editorItem.dataset.noteId = noteId;
      editorItem.dataset.mode = "edit";

      const textarea = document.createElement("textarea");
      textarea.className = "field-input prompt-note-input";
      textarea.rows = 3;
      textarea.value = note.text;

      const actions = document.createElement("div");
      actions.className = "prompt-note-actions";

      const saveBtn = document.createElement("button");
      saveBtn.type = "button";
      saveBtn.className = "btn btn-primary btn-note-save";
      saveBtn.textContent = "Save";
      saveBtn.dataset.action = "note-save";
      saveBtn.dataset.promptId = promptId;

      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "btn btn-ghost btn-note-cancel";
      cancelBtn.textContent = "Cancel";
      cancelBtn.dataset.action = "note-cancel";

      actions.appendChild(saveBtn);
      actions.appendChild(cancelBtn);

      editorItem.appendChild(textarea);
      editorItem.appendChild(actions);

      notesList.replaceChild(editorItem, originalItem);
      textarea.focus();
      return;
    }

    if (target.dataset.action === "note-delete" && target.dataset.promptId && target.dataset.noteId) {
      const promptId = target.dataset.promptId;
      const noteId = target.dataset.noteId;
      const existing = promptNotes[promptId] || [];
      const next = existing.filter((note) => note.noteId !== noteId);
      promptNotes[promptId] = next;
      if (persistNotes()) {
        const prompt = prompts.find((p) => p.id === promptId);
        if (prompt && prompt.metadata) {
          try {
            prompt.metadata = updateTimestamps(prompt.metadata);
            persistPrompts();
          } catch (err) {
            console.error("Failed to update metadata timestamp after deleting note", err);
          }
        }

        renderPrompts();
      }
      return;
    }
  }

  function importDataIntoLibrary(imported) {
    const validated = validateImportedStructure(imported);
    const importedPrompts = validated.prompts;
    const importedRatings = validated.ratings;
    const importedNotes = validated.notes;

    const existingPrompts = Array.isArray(prompts) ? prompts : [];

    let importMode = "replace";
    if (existingPrompts.length && importedPrompts.length) {
      const merge = window.confirm(
        "How should imported prompts be applied?\n\n" +
          "Click OK to MERGE with existing prompts.\n" +
          "Click Cancel to REPLACE all existing prompts with imported ones."
      );
      importMode = merge ? "merge" : "replace";
    }

    const existingById = new Map(existingPrompts.map((p) => [p.id, p]));
    const duplicateIds = importedPrompts
      .map((p) => p.id)
      .filter((id) => typeof id === "string" && existingById.has(id));

    let overwriteDuplicates = true;
    if (importMode === "merge" && duplicateIds.length) {
      overwriteDuplicates = window.confirm(
        `Found ${duplicateIds.length} prompts with duplicate IDs.\n\n` +
          "Click OK to overwrite existing prompts with imported ones.\n" +
          "Click Cancel to keep existing prompts and skip duplicates from the import."
      );
    }

    const backupPrompts = existingPrompts.map((p) => ({ ...p }));
    const backupNotes = JSON.parse(JSON.stringify(promptNotes || {}));
    const backupRatings = loadRatings();

    try {
      let nextPrompts;
      if (importMode === "replace") {
        nextPrompts = importedPrompts;
      } else {
        const byId = new Map(existingPrompts.map((p) => [p.id, p]));
        for (const prompt of importedPrompts) {
          if (!prompt || typeof prompt.id !== "string") continue;
          if (byId.has(prompt.id)) {
            if (overwriteDuplicates) {
              byId.set(prompt.id, prompt);
            }
          } else {
            byId.set(prompt.id, prompt);
          }
        }
        nextPrompts = Array.from(byId.values()).map((p) => ensurePromptMetadata(p));
      }

      const allowedPromptIds = new Set(nextPrompts.map((p) => p.id));

      let nextRatings = {};
      if (importMode === "replace") {
        for (const [promptId, value] of Object.entries(importedRatings)) {
          if (allowedPromptIds.has(promptId)) {
            nextRatings[promptId] = value;
          }
        }
      } else {
        const currentRatings = loadRatings();
        nextRatings = { ...currentRatings };
        for (const [promptId, value] of Object.entries(importedRatings)) {
          if (!allowedPromptIds.has(promptId)) continue;
          if (duplicateIds.includes(promptId)) {
            if (overwriteDuplicates) {
              nextRatings[promptId] = value;
            } else if (!(promptId in nextRatings)) {
              nextRatings[promptId] = value;
            }
          } else {
            nextRatings[promptId] = value;
          }
        }
      }

      let nextNotes = {};
      if (importMode === "replace") {
        for (const [promptId, notes] of Object.entries(importedNotes)) {
          if (!allowedPromptIds.has(promptId) || !Array.isArray(notes)) continue;
          nextNotes[promptId] = notes.slice();
        }
      } else {
        const existingNotes = promptNotes || {};
        nextNotes = { ...existingNotes };
        for (const [promptId, notes] of Object.entries(importedNotes)) {
          if (!allowedPromptIds.has(promptId) || !Array.isArray(notes)) continue;
          const currentForPrompt = Array.isArray(existingNotes[promptId])
            ? existingNotes[promptId]
            : [];
          const byNoteId = new Map(currentForPrompt.map((note) => [note.noteId, note]));
          for (const note of notes) {
            if (!note || typeof note.noteId !== "string") continue;
            if (byNoteId.has(note.noteId)) {
              if (overwriteDuplicates) {
                byNoteId.set(note.noteId, note);
              }
            } else {
              byNoteId.set(note.noteId, note);
            }
          }
          nextNotes[promptId] = Array.from(byNoteId.values());
        }
      }

      prompts = nextPrompts;
      promptNotes = nextNotes;

      saveRatings(nextRatings);
      persistPrompts();
      const notesSaved = persistNotes();
      if (!notesSaved) {
        throw new Error("Failed to save notes to localStorage during import.");
      }

      renderPrompts();
      window.alert("Import completed successfully.");
    } catch (err) {
      console.error("Import failed; rolling back to previous data.", err);

      prompts = backupPrompts;
      promptNotes = backupNotes;
      saveRatings(backupRatings);
      persistPrompts();
      persistNotes();

      const message =
        err instanceof Error
          ? err.message
          : "An unexpected error occurred while importing prompts.";
      window.alert(
        "Import failed and your existing data was restored.\n\nDetails: " + message
      );
    }
  }

  function handleImportFileChange(event) {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.files || !input.files[0]) {
      return;
    }

    const file = input.files[0];
    const reader = new FileReader();

    reader.onload = () => {
      try {
        const text = typeof reader.result === "string" ? reader.result : "";
        const parsed = JSON.parse(text);
        importDataIntoLibrary(parsed);
      } catch (err) {
        console.error("Failed to read or parse imported file", err);
        const message =
          err instanceof Error
            ? err.message
            : "The selected file is not a valid export JSON.";
        window.alert("Import failed. Details: " + message);
      } finally {
        input.value = "";
      }
    };

    reader.onerror = () => {
      console.error("FileReader error while importing prompts", reader.error);
      window.alert("Unable to read the selected file. Please try again.");
      input.value = "";
    };

    reader.readAsText(file);
  }

  function init() {
    prompts = loadPrompts().map((prompt) => ensurePromptMetadata(prompt));
    try {
      persistPrompts();
    } catch (err) {
      console.error("Failed to persist upgraded prompts with metadata", err);
    }
    promptNotes = loadNotes();
    renderPrompts();

    form.addEventListener("submit", handleFormSubmit);
    promptList.addEventListener("click", handleListClick);
    if (exportButton) {
      exportButton.addEventListener("click", triggerExportDownload);
    }
    if (importButton && importFileInput) {
      importButton.addEventListener("click", () => {
        importFileInput.click();
      });
      importFileInput.addEventListener("change", handleImportFileChange);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
