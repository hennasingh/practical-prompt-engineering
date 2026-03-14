(function () {
  const STORAGE_KEY = "promptLibrary.items";
  const RATINGS_STORAGE_KEY = "promptLibrary.ratings";
  const NOTES_STORAGE_KEY = "promptLibrary.notes";

  const form = document.getElementById("prompt-form");
  const titleInput = document.getElementById("prompt-title");
  const contentInput = document.getElementById("prompt-content");
  const promptList = document.getElementById("prompt-list");
  const promptCount = document.getElementById("prompt-count");

  /** @type {{ id: string; title: string; content: string; createdAt: number; }[]} */
  let prompts = [];

  /** @type {{ [promptId: string]: { noteId: string; promptId: string; text: string; updatedAt: number; }[] }} */
  let promptNotes = {};

  let lastNotesError = "";

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

    promptCount.textContent = formatCountLabel(prompts.length);

    prompts.forEach((prompt) => {
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
      const date = new Date(prompt.createdAt || Date.now());
      meta.textContent = date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit",
      });

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
    const content = contentInput.value.trim();

    if (!title || !content) {
      // Basic guard; browser required attribute also helps
      return;
    }

    const prompt = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      title,
      content,
      createdAt: Date.now(),
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

      const stars = ratingContainer.querySelectorAll(".rating-star");
      stars.forEach((starEl) => {
        const starValue = Number.parseInt(starEl.dataset.value || "0", 10);
        const isActive = Number.isFinite(starValue) && starValue <= value;
        starEl.classList.toggle("rating-star-active", isActive);
        starEl.setAttribute("aria-checked", isActive ? "true" : "false");
      });
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
        renderPrompts();
      }
      return;
    }
  }

  function init() {
    prompts = loadPrompts();
    promptNotes = loadNotes();
    renderPrompts();

    form.addEventListener("submit", handleFormSubmit);
    promptList.addEventListener("click", handleListClick);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
