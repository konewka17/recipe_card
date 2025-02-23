// import * as yaml from "https://unpkg.com/js-yaml?module"
import {load, dump} from "js-yaml";
import css from "./card.css";
import Fuse from "fuse.js";

export class RecipeCard extends HTMLElement {

    // private properties
    _config;
    _hass;
    _elements = {};
    _parsedRecipes;
    _recipeIndex;

    // lifecycle
    constructor() {
        super();
        this.yamlEntryToLi = this.yamlEntryToLi.bind(this);
    }

    setConfig(config) {
        this._config = config;
        this.doCard();
        this.doStyle();
        this.doAttach();
        this.doQueryElements();
        this.doCheckConfig();
        this.doFetchRecipes();
    }

    set hass(hass) {
        this._hass = hass;
    }

    // jobs
    doCheckConfig() {
        if (!this._config.url) {
            throw new Error("Please define a url in config!");
        }
    }

    async doFetchRecipes() {
        try {
            const urlWithTimestamp = `${this._config.url}?_=${new Date().getTime()}`;
            const response = await fetch(urlWithTimestamp);
            const yamlText = await response.text();

            this._parsedRecipes = load(yamlText);
            // this._recipeIndex = Math.floor(Math.random() * this._parsedRecipes.length);
            this._recipeIndex = this.findBestMatchingRecipe(this._hass?.states["input_text.wat_eten_we_vandaag"]?.state);
            this.doFillCard();
        } catch (error) {
            throw new Error(`Error fetching or parsing the recipe file: ${error}`);
        }
    }

    doCard() {
        this._elements.card = document.createElement("ha-card");
        this._elements.card.innerHTML = `
            <div class="selectdiv"></div>
            <div class="content"></div>
        `;
    }

    doStyle() {
        this._elements.style = document.createElement("style");
        this._elements.style.textContent = css;
    }

    doAttach() {
        this.attachShadow({mode: "open"});
        this.shadowRoot.append(this._elements.style, this._elements.card);
    }

    doQueryElements() {
        const card = this._elements.card;
        this._elements.selectdiv = card.querySelector(".selectdiv");
        this._elements.content = card.querySelector(".content");
    }


    doFillSelect() {
        this._elements.selectdiv.innerHTML = `
            <input type="text" id="recipe-search" placeholder="Search for a recipe..." autocomplete="off">
            <ul id="recipe-results" class="search-results"></ul>`;

        const searchInput = this._elements.selectdiv.querySelector("#recipe-search");
        const resultsList = this._elements.selectdiv.querySelector("#recipe-results");

        let selectedIndex = -1; // Tracks selected item

        searchInput.addEventListener("input", () => {
            selectedIndex = -1;
            this.updateSearchResults(searchInput.value, resultsList);
        });

        searchInput.addEventListener("focus", () => this.updateSearchResults(searchInput.value, resultsList));

        searchInput.addEventListener("keydown", (event) => {
            const items = resultsList.querySelectorAll("li");

            if (event.key === "ArrowDown") {
                event.preventDefault();
                if (selectedIndex < items.length - 1) {
                    selectedIndex++;
                    this.updateSelection(items, selectedIndex);
                }
            } else if (event.key === "ArrowUp") {
                event.preventDefault();
                if (selectedIndex > 0) {
                    selectedIndex--;
                    this.updateSelection(items, selectedIndex);
                }
            } else if (event.key === "Enter") {
                event.preventDefault();
                if (selectedIndex >= 0 && items[selectedIndex]) {
                    items[selectedIndex].click();
                }
            } else if (event.key === "Escape") {
                this.clearSearchResults();
                searchInput.blur();
            }
        });

        // Hide results when clicking outside, but use a slight delay
        searchInput.addEventListener("focusout", (event) => {
            setTimeout(() => {
                if (!this._elements.selectdiv.contains(document.activeElement)) {
                    this.clearSearchResults();
                }
            }, 150); // Delay ensures we don’t hide results if clicking inside them
        });
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
            this.addClickEvents(resultsList);
            return;
        }

        // Normal search using Fuse.js
        const fuse = new Fuse(this._parsedRecipes, {
            keys: ["name", "alternative_name"],
            threshold: 0.3,
            ignoreLocation: true
        });

        const results = fuse.search(query).slice(0, 10); // Limit to top 10 results
        resultsList.innerHTML = results
            .map(result => `
            <li data-index="${result.refIndex}">
                ${result.item.name}
                <span class="category-bubble">${result.item.category || "Uncategorized"}</span>
            </li>
        `)
            .join("");

        if (results.length > 0) {
            resultsList.style.display = "block";
        }

        this.addClickEvents(resultsList);
    }

    addClickEvents(resultsList) {
        const items = resultsList.querySelectorAll("li");

        items.forEach(li => {
            li.addEventListener("click", () => {
                this._recipeIndex = li.getAttribute("data-index");
                this._elements.selectdiv.querySelector("#recipe-search").value = this._parsedRecipes[this._recipeIndex].name;
                this.clearSearchResults();
                this.doFillContent(); // Load the selected recipe
            });
        });
    }

    updateSelection(items, index) {
        items.forEach(item => item.classList.remove("selected"));
        if (items[index]) {
            items[index].classList.add("selected");
            items[index].scrollIntoView({block: "nearest"});
        }
    }

    clearSearchResults() {
        this._elements.selectdiv.querySelector("#recipe-results").style.display = "none";
    }

    doFillContent() {
        this.recipe = this._parsedRecipes[this._recipeIndex];
        if (!this.recipe) {
            this._elements.content.innerHTML = `Geen recepten gevonden voor ${this._hass.states["input_text.wat_eten_we_vandaag"].state}`;
            return;
        }

        this._elements.content.innerHTML = `
            <div class="recipe-header">
                <div class="recipe-title">${this.recipe.name}</div>
                <div class="edit-icon"><ha-icon icon="mdi:pencil"></ha-icon></div>
            </div>
            <div class="recipe-content">
                <i>Ingrediënten${this.recipe?.persons ? ` (${this.recipe.persons} personen)` : ""}:</i>
                <ul class="ingredient-list">
                    ${this.recipe.ingredients.map(this.yamlEntryToLi).join("")}
                </ul>
                <br/> 
                <i>Bereiding:</i>
                <ol class="instruction-list">
                    ${this.recipe.instructions.map(this.yamlEntryToLi).join("")}
                </ol>
            </div>
        `;

        this._elements.editButton = this._elements.content.querySelector(".edit-icon");
        this._elements.editButton.addEventListener("click", () => this.toggleEditMode());
    }

    doFillCard() {
        this.doFillSelect();
        this.doFillContent();
    }

    toggleEditMode() {
        if (this._isEditing) {
            this.doFillContent();
            this._isEditing = false;
            return;
        }

        this._isEditing = true;
        const yamlContent = dump(this.recipe);

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

        this._elements.saveButton.innerHTML = `<ha-icon icon="mdi:loading" spin></ha-icon>`;
        this._elements.saveButton.disabled = true;
        this._elements.cancelButton.disabled = true;

        try {
            await this._hass.callService("recipes", "update_recipe", {
                recipe_name: this.recipe.name,
                new_yaml: newYaml
            });

            this._elements.saveButton.innerHTML = `<ha-icon icon="mdi:content-save"></ha-icon>`;
            this._elements.saveButton.disabled = false;
            this._elements.cancelButton.disabled = false;
            this._isEditing = false;
            this.doFetchRecipes();
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


    // helpers
    yamlEntryToLi(yamlEntry) {
        if (Array.isArray(yamlEntry)) {
            return "<ul>" + yamlEntry.map(val => this.yamlEntryToLi(val)).join("") + "</ul>";
        } else if (typeof yamlEntry === "object") {
            let [key, value] = Object.entries(yamlEntry)[0];
            key = key.charAt(0).toUpperCase() + key.slice(1);
            if (value) {
                if (Array.isArray(value)) {
                    value = "<ul>" + value.map(val => this.yamlEntryToLi(val)).join("") + "</ul>";
                }
                value = ": " + value;
            } else {
                value = "";
            }
            return `<li><span class="ingredient">${key}</span><span class="amount">${value}</span></li>`;
        } else {
            yamlEntry = yamlEntry.charAt(0).toUpperCase() + yamlEntry.slice(1);
            return `<li>${yamlEntry}</li>`;
        }
    }

    findBestMatchingRecipe(query) {
        const fuse = new Fuse(this._parsedRecipes, {
            "keys": ["name", "alternative_name"], "threshold": .6, "includeScore": true, distance: 3,
            ignoreLocation: true
        });

        const results = fuse.search(query);
        return results.length ? results[0].refIndex : null;
    }
}