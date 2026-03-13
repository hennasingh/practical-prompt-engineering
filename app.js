(function () {
  const STORAGE_KEY = "promptLibrary.items";

  const form = document.getElementById("prompt-form");
  const titleInput = document.getElementById("prompt-title");
  const contentInput = document.getElementById("prompt-content");
  const promptList = document.getElementById("prompt-list");
  const promptCount = document.getElementById("prompt-count");

  /** @type {{ id: string; title: string; content: string; createdAt: number; }[]} */
  let prompts = [];

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

      card.appendChild(header);
      card.appendChild(preview);
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
    }
  }

  function init() {
    prompts = loadPrompts();
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
