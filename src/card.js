import {dump, load} from "js-yaml";
import css from "./card.css";
import Fuse from "fuse.js";
import {
    onClearIconClick,
    onClickPersonsChange,
    onClickPersonsCount,
    onResetClick,
    onSearchFocus,
    onSearchFocusout,
    onSearchInput,
    onSearchKeydown
} from "./eventListeners.js";
import {formatNumber, markQuantitiesInText, parseNumber} from "./numberHelpers.js";

class RecipeCard extends HTMLElement {
    _config;
    _hass;
    _elements = {};
    _parsedRecipes;
    _selectedSearchIndex = -1;
    _recipeStorage = {};
    _viewMode = "singleRecipe";
    _menuGroupByCategory = true;
    _menuHidePrinted = false;

    setConfig(config) {
        this._config = config;
        if (!this._config.url) {
            throw new Error("Please define a url in config!");
        }
        this.buildCard();
        this.fetchRecipes().then(() => {
            this.initRecipeStorage();
            this.fillContent();
        });
    }

    set hass(hass) {
        this._hass = hass;
    }

    initRecipeStorage() {
        this._recipeStorage = JSON.parse(localStorage.getItem("recipeStorage")) || {};
        if (!this._recipeStorage?.currentRecipeIndex || this._recipeStorage?.lastUpdatedTs < Date.now() - 60 * 60 * 1000) {
            this.resetRecipeStorage();
        } else {
            this.setRecipe();
        }
    }

    resetRecipeStorage(recipeIndex = null) {
        if (recipeIndex === null) {
            recipeIndex = findBestMatchingRecipe(this._parsedRecipes, this._hass?.states["input_text.wat_eten_we_vandaag"]?.state);
        }
        this._recipeStorage = {
            currentRecipeIndex: recipeIndex, ingredients: {}, instructions: {}, lastUpdatedTs: Date.now()
        };
        this.setRecipe();
        this._recipeStorage.currentPersons = this.recipe?.persons;
        this.updateLocalStorage();
    }

    setRecipe() {
        this.recipe = this._parsedRecipes?.[this._recipeStorage.currentRecipeIndex];
    }

    updateLocalStorage() {
        this._recipeStorage.lastUpdatedTs = Date.now();
        localStorage.setItem("recipeStorage", JSON.stringify(this._recipeStorage));
    }

    buildCard() {
        const card = document.createElement("ha-card");
        card.innerHTML = "<div class='selectdiv'></div><div class='content'></div>";
        this._elements.content = card.querySelector(".content");

        this._elements.selectdiv = card.querySelector(".selectdiv");
        this._elements.selectdiv.innerHTML = `
            <div class="search-container">
                <button class="menu-toggle" aria-label="Open menu">
                    <ha-icon icon="mdi:menu"></ha-icon>
                </button>
                <input type="text" id="recipe-search" placeholder="Search for a recipe..." autocomplete="off">
                <ha-icon id="clear-search" icon="mdi:close-circle"></ha-icon>
            </div>
            <ul id="recipe-results" class="search-results"></ul>
        `;
        this._elements.searchInput = this._elements.selectdiv.querySelector("#recipe-search");
        this._elements.menuToggle = this._elements.selectdiv.querySelector(".menu-toggle");
        this._elements.resultsList = this._elements.selectdiv.querySelector("#recipe-results");
        this.addListenersToSelect();

        const style = document.createElement("style");
        style.textContent = css;

        this.attachShadow({mode: "open"});
        this.shadowRoot.append(style, card);
    }

    async fetchRecipes() {
        try {
            const urlWithTimestamp = `${this._config.url}?_=${new Date().getTime()}`;
            const response = await fetch(urlWithTimestamp);
            const yamlText = await response.text();
            this._parsedRecipes = load(yamlText).sort((a, b) => a.name.localeCompare(b.name));
        } catch (error) {
            throw new Error(`Error fetching or parsing the recipe file: ${error}`);
        }
    }

    addListenersToSelect() {
        const searchInput = this._elements.searchInput;
        const clearIcon = this._elements.selectdiv.querySelector("#clear-search");

        this._elements.menuToggle.addEventListener("click", () => {
            this._viewMode = this._viewMode === "menu" ? "singleRecipe" : "menu";
            this.fillContent();
        });
        searchInput.addEventListener("input", onSearchInput.bind(this));
        searchInput.addEventListener("focus", onSearchFocus.bind(this));
        searchInput.addEventListener("keydown", onSearchKeydown.bind(this));
        searchInput.addEventListener("focusout", onSearchFocusout.bind(this));
        clearIcon.addEventListener("click", onClearIconClick.bind(this));
    }

    updateSearchResults(query, resultsList) {
        if (!query.trim()) {
            resultsList.innerHTML = this._parsedRecipes.map((recipe, index) => `
                    <li data-index="${index}">
                        ${recipe.name}
                        <span class="category-bubble">${recipe.category || "Uncategorized"}</span>
                    </li>`).join("");
            resultsList.style.display = "block";
        } else {
            let fuse = new Fuse(this._parsedRecipes, {
                keys: ["name", "alternative_name"], threshold: 0.3, ignoreLocation: true
            });

            let results = fuse.search(query);
            if (results.length === 0) {
                fuse = new Fuse(this._parsedRecipes, {
                    keys: ["ingredients", "instructions"], threshold: 0.3, ignoreLocation: true
                });
                results = fuse.search(query);
            }
            resultsList.innerHTML = results
                .map(result => `
                <li data-index="${result.refIndex}">
                    ${result.item.name}
                    <span class="category-bubble">${result.item.category || "Uncategorized"}</span>
                </li>
            `).join("");

            if (results.length > 0) {
                resultsList.style.display = "block";
            }
        }

        resultsList.querySelectorAll("li").forEach(li => {
            li.addEventListener("click", () => {
                this.resetRecipeStorage(li.getAttribute("data-index"));
                this.clearSearchResults();
                this._viewMode = "singleRecipe";
                this.fillContent();
            });
        });
    }

    clearSearchResults() {
        this._elements.selectdiv.querySelector("#recipe-results").style.display = "none";
    }

    fillContent() {
        this.updateMenuToggleIcon();
        if (this._viewMode === "menu") {
            this.fillContentMenu();
            return;
        }
        if (this._viewMode === "editRecipe") {
            this.fillContentEditMode();
            return;
        }
        if (!this.recipe) {
            this._elements.content.innerHTML = `Geen recepten gevonden voor ${this._hass.states["input_text.wat_eten_we_vandaag"].state}`;
            return;
        }
        this.fillContentSingleRecipe();
    }

    updateMenuToggleIcon() {
        const icon = this._viewMode === "menu" ? "mdi:arrow-left" : "mdi:menu";
        const label = this._viewMode === "menu" ? "Back to recipe" : "Open menu";
        const iconEl = this._elements.menuToggle?.querySelector("ha-icon");
        if (iconEl) {
            iconEl.setAttribute("icon", icon);
        }
        this._elements.menuToggle?.setAttribute("aria-label", label);
    }

    fillContentMenu() {
        const recipesWithIndex = (this._parsedRecipes || []).map((recipe, index) => ({recipe, index}))
            .filter(({recipe}) => !this._menuHidePrinted || recipe.printed !== true);

        let listHtml = "";
        if (this._menuGroupByCategory) {
            const grouped = recipesWithIndex.reduce((acc, item) => {
                const category = item.recipe.category || "Uncategorized";
                acc[category] = acc[category] || [];
                acc[category].push(item);
                return acc;
            }, {});

            listHtml = Object.keys(grouped).sort((a, b) => a.localeCompare(b)).map(category => `
                <div class="menu-category">
                    <div class="menu-category-title">${category}</div>
                    <ul class="menu-list">
                        ${grouped[category]
                            .sort((a, b) => a.recipe.name.localeCompare(b.recipe.name))
                            .map(({recipe, index}) => `<li data-index="${index}">${recipe.name}</li>`)
                            .join("")}
                    </ul>
                </div>
            `).join("");
        } else {
            listHtml = `
                <ul class="menu-list">
                    ${recipesWithIndex
                        .sort((a, b) => a.recipe.name.localeCompare(b.recipe.name))
                        .map(({recipe, index}) => `
                            <li data-index="${index}">
                                ${recipe.name}
                                <span class="category-bubble">${recipe.category || "Uncategorized"}</span>
                            </li>
                        `)
                        .join("")}
                </ul>
            `;
        }

        this._elements.content.innerHTML = `
            <div class="menu-controls">
                <button class="menu-group-toggle ${this._menuGroupByCategory ? "active" : ""}">
                    Group by category
                </button>
                <button class="menu-filter-toggle ${this._menuHidePrinted ? "active" : ""}" aria-pressed="${this._menuHidePrinted}">
                    Only show unprinted
                </button>
            </div>
            <div class="menu-results">
                ${listHtml || "<div class='menu-empty'>No recipes found.</div>"}
            </div>
        `;

        const groupToggle = this._elements.content.querySelector(".menu-group-toggle");
        const hidePrintedToggle = this._elements.content.querySelector(".menu-filter-toggle");

        groupToggle.addEventListener("click", () => {
            this._menuGroupByCategory = !this._menuGroupByCategory;
            this.fillContentMenu();
        });

        hidePrintedToggle.addEventListener("click", () => {
            this._menuHidePrinted = !this._menuHidePrinted;
            this.fillContentMenu();
        });

        this._elements.content.querySelectorAll(".menu-list li").forEach(li => {
            li.addEventListener("click", () => {
                this.resetRecipeStorage(li.getAttribute("data-index"));
                this._viewMode = "singleRecipe";
                this.fillContent();
            });
        });
    }

    fillContentSingleRecipe() {
        this._elements.content.innerHTML = `
            <div class="recipe-header">
                <div class="recipe-title">${this.recipe.name}</div>
                <div class="header-icons"> 
                    <div class="add-icon"><ha-icon icon="mdi:plus-circle-outline"></ha-icon></div>
                    <div class="edit-icon"><ha-icon icon="mdi:pencil"></ha-icon></div>
                </div>
            </div>
            <div class="recipe-banner">
                <div class="reset-strikeout-icon"><ha-icon icon="mdi:restart"></ha-icon></div>
                <div class="print-status-pill ${this.recipe?.printed === true ? "printed" : "to-print"}">
                    ${this.recipe?.printed === true ? "Printed" : "To be printed"}
                </div>
                <div class="print-icon"><ha-icon icon="mdi:printer"></ha-icon></div>
                ${this.recipe?.persons ? `
                    <div class="persons-control">
                        <span>Aantal personen</span>
                        <div class="persons-minus"><ha-icon icon="mdi:minus-thick"></ha-icon></div>
                        <span class="persons-count">${this._recipeStorage?.currentPersons}</span>
                        <div class="persons-plus"><ha-icon icon="mdi:plus-thick"></ha-icon></div>
                    </div>` : ""}
            </div> 
            <div class="recipe-content">
                <i>Ingrediënten</i>
                <ul class="ingredient-list">
                    ${this.recipe.ingredients.map((item, index) => yamlEntryToLi(item, `${index}`)).join("")}
                </ul>
                <br/> 
                <i>Bereiding:</i>
                <ol class="instruction-list">
                    ${this.recipe.instructions.map((step, index) => yamlEntryToLi(step, `${index}`)).join("")}
                </ol>
            </div>
        `;
        this.scaleAllQuantities();

        const content = this._elements.content;
        content.querySelector(".edit-icon").addEventListener("click", this.toggleEditMode.bind(this));
        content.querySelector(".add-icon").addEventListener("click", this.createNewRecipe.bind(this));
        content.querySelector(".reset-strikeout-icon").addEventListener("click", onResetClick.bind(this));
        content.querySelector(".print-icon").addEventListener("click", this.printRecipe.bind(this));
        content.querySelector(".print-status-pill").addEventListener("click", this.togglePrinted.bind(this));
        content.querySelector(".persons-minus")?.addEventListener("click", onClickPersonsChange.bind(this, -1));
        content.querySelector(".persons-plus")?.addEventListener("click", onClickPersonsChange.bind(this, 1));
        content.querySelector(".persons-count").addEventListener("click", onClickPersonsCount.bind(this));

        this._elements.personsCount = content.querySelector(".persons-count");
        this.makeListToggleable(".ingredient-list li", "ingredients");
        this.makeListToggleable(".instruction-list li", "instructions");
    }

    scaleAllQuantities() {
        if (this._recipeStorage.currentPersons && this.recipe.persons) {
            const multiplier = this._recipeStorage.currentPersons / this.recipe.persons;
            this._elements.content.querySelectorAll(".recipe-quantity").forEach(span => {
                span.textContent = formatNumber(parseNumber(span.dataset.original) * multiplier);
                span.parentElement.classList.toggle("scaled_quantity", multiplier !== 1);
            });
        }
    }

    printRecipe() {
        this.setPrinted(true)
        const printContent = this._elements.content.innerHTML;
        const printWindow = window.open("", "", "width=800,height=600");
        printWindow.document.write(`
            <html>
            <head>
                <style> ${css} </style>
            </head>
            <body onload="window.print(); //window.close();">
                <div class="print-container">
                    ${printContent}
                </div>
            </body>
            </html>
        `);
        printWindow.document.close();
    }

    async togglePrinted() {
        let printed = !this.recipe?.printed || true
        await this.setPrinted(printed);
    }

    async setPrinted(printed) {
        try {
            await this._hass.callService("recipes", "update_recipe", {
                recipe_name: this.recipe.name,
                printed: printed
            });

            this.fetchRecipes().then(() => this.fillContent());
        } catch (error) {
            alert("Failed to update printed status: " + error.message);
        }
    }

    toggleEditMode() {
        if (this._viewMode === "editRecipe") {
            this.resetRecipeStorage(this._recipeStorage.currentRecipeIndex);
            this._viewMode = "singleRecipe";
        } else {
            this._viewMode = "editRecipe";
        }
        this.fillContent();
    }

    fillContentEditMode() {
        const yamlContent = dump(this.recipe, {lineWidth: -1, styles: {"!!null": "empty"}});

        this._elements.content.innerHTML = `
            <textarea class="yaml-editor">${yamlContent}</textarea>
            <div class="button-container">
                <button class="save-button"><ha-icon icon="mdi:content-save"></ha-icon></button>
                <button class="cancel-button"><ha-icon icon="mdi:close"></ha-icon></button>
            </div>
        `;

        this._elements.saveButton = this._elements.content.querySelector(".save-button");
        this._elements.cancelButton = this._elements.content.querySelector(".cancel-button");
        this._elements.textarea = this._elements.content.querySelector(".yaml-editor");

        this._elements.saveButton.addEventListener("click", this.saveEditedRecipe.bind(this));
        this._elements.cancelButton.addEventListener("click", this.toggleEditMode.bind(this));
    }

    async saveEditedRecipe() {
        const newYaml = this._elements.textarea.value;

        this._elements.saveButton.innerHTML = `<ha-icon icon="mdi:progress-clock" spin></ha-icon>`;
        this._elements.saveButton.disabled = true;
        this._elements.cancelButton.disabled = true;

        try {
            await this._hass.callService("recipes", "update_recipe", {
                recipe_name: this.recipe.name,
                new_yaml: newYaml,
                printed: false
            });
            this.fetchRecipes().then(() => this.toggleEditMode());
        } catch (error) {
            this._elements.saveButton.innerHTML = `<ha-icon icon="mdi:alert-circle-outline"></ha-icon>`;
            setTimeout(() => {
                this._elements.saveButton.innerHTML = `<ha-icon icon="mdi:content-save"></ha-icon>`;  // Reset the icon after 2 seconds
                this._elements.saveButton.disabled = false;
                this._elements.cancelButton.disabled = false;
            }, 2000);

            alert("Failed to save recipe: " + error.message);
        }
    }

    async createNewRecipe() {
        const recipeName = prompt("Voer de naam in voor het nieuwe recept:");

        if (!recipeName) {
            return; // Gebruiker heeft geannuleerd
        }

        try {
            await this._hass.callService("recipes", "create_recipe", {recipe_name: recipeName});
            await this.fetchRecipes();
            const newIndex = this._parsedRecipes.findIndex(recipe => recipe.name === recipeName);
            if (newIndex !== -1) {
                this.resetRecipeStorage(newIndex);
                this.fillContent();
            }
        } catch (error) {
            alert("Fout bij het aanmaken van het recept: " + error.message);
        }
    }

    makeListToggleable(selector, storageKey) {
        const listItems = this._elements.content.querySelectorAll(selector);
        const storedState = this._recipeStorage[storageKey] || {};

        listItems.forEach(item => {
            const index = item.getAttribute("data-index");

            if (storedState[index]) {
                item.classList.add("checked");
            }

            item.addEventListener("click", (event) => {
                const storedState = this._recipeStorage[storageKey] || {};
                event.stopPropagation();
                item.classList.toggle("checked");
                storedState[index] = item.classList.contains("checked");
                this._recipeStorage[storageKey] = storedState;
                this.updateLocalStorage();
            });
        });
    }
}

// helpers
function yamlEntryToLi(yamlEntry, parentIndex = "") {
    if (Array.isArray(yamlEntry)) {
        return `<ul>` + yamlEntry.map((item, index) => yamlEntryToLi(item, `${parentIndex}-${index}`))
                                 .join("") + `</ul>`;
    } else if (typeof yamlEntry === "object") {
        let [key, value] = Object.entries(yamlEntry)[0];
        key = key.charAt(0).toUpperCase() + key.slice(1);
        let nestedContent = "";

        if (Array.isArray(value)) {
            nestedContent = `<ul>` + value.map((item, index) => yamlEntryToLi(item, `${parentIndex}-${index}`))
                                          .join("") + `</ul>`;
        } else {
            const text = value ? markQuantitiesInText(String(value)) : "";
            nestedContent = text ? `: ${text}` : "";
        }

        return `<li data-index="${parentIndex}"><span class="ingredient">${key}</span><span class="amount">${nestedContent}</span></li>`;
    } else {
        const processed = markQuantitiesInText(String(yamlEntry));
        return `<li data-index="${parentIndex}">${processed}</li>`;
    }
}

function findBestMatchingRecipe(recipes, query) {
    const fuse = new Fuse(recipes, {
        "keys": ["name", "alternative_name"], "threshold": .6, "includeScore": true, distance: 3,
        ignoreLocation: true
    });

    const results = fuse.search(query);
    return results.length ? results[0].refIndex : null;
}

customElements.define("recipe-card", RecipeCard);
