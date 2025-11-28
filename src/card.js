import {dump, load} from "js-yaml";
import css from "./card.css";
import Fuse from "fuse.js";
import {onClearIconClick, onSearchFocus, onSearchFocusout, onSearchInput, onSearchKeydown} from "./eventListeners.js";
import {formatNumber, markQuantitiesInText, parseNumber} from "./numberHelpers.js";

class RecipeCard extends HTMLElement {
    _config;
    _hass;
    _elements = {};
    _parsedRecipes;
    _recipeIndex;
    _selectedSearchIndex = -1;
    _recipeStorage = JSON.parse(localStorage.getItem("recipeStorage")) || {};

    setConfig(config) {
        this._config = config;
        if (!this._config.url) {
            throw new Error("Please define a url in config!");
        }
        this.buildCard();
        this.fetchRecipes().then(() => {
            let recipeIndex = this._recipeStorage?.currentRecipeIndex;
            if (!recipeIndex) {
                recipeIndex = findBestMatchingRecipe(this._parsedRecipes, this._hass?.states["input_text.wat_eten_we_vandaag"]?.state);
            }
            this.setRecipeIndex(recipeIndex);
            this.fillContent();
        });
    }

    set hass(hass) {
        this._hass = hass;
    }

    setRecipeIndex(index) {
        this._recipeIndex = index;
        this.recipe = this._parsedRecipes?.[this._recipeIndex] || {};
    }

    buildCard() {
        // Make card
        const card = document.createElement("ha-card");
        card.innerHTML = "<div class='selectdiv'></div><div class='content'></div>";
        this._elements.content = card.querySelector(".content");

        this._elements.selectdiv = card.querySelector(".selectdiv");
        this._elements.selectdiv.innerHTML = `
            <div class="search-container">
                <input type="text" id="recipe-search" placeholder="Search for a recipe..." autocomplete="off">
                <ha-icon id="clear-search" icon="mdi:close-circle"></ha-icon>
            </div>
            <ul id="recipe-results" class="search-results"></ul>
        `;
        this._elements.searchInput = this._elements.selectdiv.querySelector("#recipe-search");
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
            this._parsedRecipes = load(yamlText);
        } catch (error) {
            throw new Error(`Error fetching or parsing the recipe file: ${error}`);
        }
    }

    addListenersToSelect() {
        const searchInput = this._elements.searchInput;
        const clearIcon = this._elements.selectdiv.querySelector("#clear-search");

        searchInput.addEventListener("input", onSearchInput.bind(this));
        searchInput.addEventListener("focus", onSearchFocus.bind(this));
        searchInput.addEventListener("keydown", onSearchKeydown.bind(this));
        searchInput.addEventListener("focusout", onSearchFocusout.bind(this));
        clearIcon.addEventListener("click", onClearIconClick.bind(this));
    }

    updateSearchResults(query, resultsList) {
        if (!query.trim()) {
            // Show all recipes alphabetically
            const sortedRecipes = [...this._parsedRecipes].sort((a, b) =>
                a.name.localeCompare(b.name)
            );

            resultsList.innerHTML = sortedRecipes
                .map((recipe, index) => `
                    <li data-index="${index}">
                        ${recipe.name}
                        <span class="category-bubble">${recipe.category || "Uncategorized"}</span>
                    </li>
                `).join("");

            resultsList.style.display = "block"; // Always show when empty
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
                this.setRecipeIndex(li.getAttribute("data-index"));
                this._elements.selectdiv.querySelector("#recipe-search").value = this._parsedRecipes[this._recipeIndex].name;
                this.clearSearchResults();
                this.fillContent();
            });
        });
    }

    clearSearchResults() {
        this._elements.selectdiv.querySelector("#recipe-results").style.display = "none";
    }

    fillContent() {
        if (!this.recipe) {
            this._elements.content.innerHTML = `Geen recepten gevonden voor ${this._hass.states["input_text.wat_eten_we_vandaag"].state}`;
            return;
        }

        if (this._recipeStorage.currentRecipeIndex !== this._recipeIndex) {
            this.reset_recipe_storage();
        }

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

        this._elements.content.querySelector(".edit-icon").addEventListener("click", () => this.toggleEditMode());
        this._elements.content.querySelector(".add-icon").addEventListener("click", () => this.createNewRecipe());
        this._elements.content.querySelector(".reset-strikeout-icon").addEventListener("click", () => {
            this.reset_recipe_storage();
            this.fillContent();
        });
        this._elements.content.querySelector(".print-icon").addEventListener("click", () => this.printRecipe());
        this._elements.content.querySelector(".persons-minus")?.addEventListener("click", () => {
            if (this._recipeStorage.currentPersons > 1) {
                this._recipeStorage.currentPersons--;
                this.updateLocalStorage();
                this._elements.personsCount.textContent = this._recipeStorage.currentPersons;
                this.scaleAllQuantities();
            }
        });
        this._elements.content.querySelector(".persons-plus")?.addEventListener("click", () => {
            this._recipeStorage.currentPersons++;
            this.updateLocalStorage();
            this._elements.personsCount.textContent = this._recipeStorage.currentPersons;
            this.scaleAllQuantities();
        });

        this._elements.personsCount = this._elements.content?.querySelector(".persons-count");
        this._elements.personsCount?.addEventListener("click", () => {
            this._recipeStorage.currentPersons = this.recipe?.persons;
            this.updateLocalStorage();
            this._elements.personsCount.textContent = this._recipeStorage.currentPersons;
            this.scaleAllQuantities();
        });

        this.makeListToggleable(".ingredient-list li", "ingredients");
        this.makeListToggleable(".instruction-list li", "instructions");
    }

    reset_recipe_storage() {
        this._recipeStorage = {
            currentRecipeIndex: this._recipeIndex, ingredients: {}, instructions: {},
            currentPersons: this.recipe?.persons
        };
        this.updateLocalStorage();
    }

    updateLocalStorage() {
        localStorage.setItem("recipeStorage", JSON.stringify(this._recipeStorage));
    }

    scaleAllQuantities() {
        const multiplier = this._recipeStorage.currentPersons / this.recipe?.persons;
        const spans = this._elements.content.querySelectorAll(".recipe-quantity");

        spans.forEach(span => this.scaleQuantitySpan(span, multiplier));
    }

    scaleQuantitySpan(span, multiplier) {
        const orig = span.dataset.original;
        if (!orig) return;

        span.textContent = formatNumber(parseNumber(orig) * multiplier);
        span.parentElement.classList.toggle("scaled_quantity", multiplier !== 1);
    }

    printRecipe() {
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

    toggleEditMode() {
        if (this._isEditing) {
            this.fillContent();
            this._isEditing = false;
            return;
        }

        this._isEditing = true;
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

        this._elements.saveButton.addEventListener("click", () => this.saveEditedRecipe());
        this._elements.cancelButton.addEventListener("click", () => this.toggleEditMode());
    }

    async saveEditedRecipe() {
        const newYaml = this._elements.textarea.value;

        this._elements.saveButton.innerHTML = `<ha-icon icon="mdi:progress-clock" spin></ha-icon>`;
        this._elements.saveButton.disabled = true;
        this._elements.cancelButton.disabled = true;

        try {
            await this._hass.callService("recipes", "update_recipe", {
                recipe_name: this.recipe.name,
                new_yaml: newYaml
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
            await this._hass.callService("recipes", "create_recipe", {
                recipe_name: recipeName
            });
            await this.fetchRecipes();
            const newIndex = this._parsedRecipes.findIndex(recipe => recipe.name === recipeName);
            if (newIndex !== -1) {
                this.setRecipeIndex(newIndex);
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