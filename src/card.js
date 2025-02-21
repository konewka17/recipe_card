import {load} from "js-yaml";
import css from "./card.css";
import Fuse from "fuse.js";

export class RecipeCard extends HTMLElement {

    // private properties
    _config;
    _hass;
    _elements = {};
    _parsedRecipes;
    _recipeIndex;
    _searchFuse;
    _categoryColors = {};

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
            const response = await fetch(this._config.url);
            const yamlText = await response.text();
            this._parsedRecipes = load(yamlText);
            this._recipeIndex = this.findBestMatchingRecipe(this._hass?.states["input_text.wat_eten_we_vandaag"]?.state);
            this.initSearch();
            this.doFillCard();
        } catch (error) {
            throw new Error(`Error fetching or parsing the recipe file: ${error}`);
        }
    }

    doCard() {
        this._elements.card = document.createElement("ha-card");
        this._elements.card.innerHTML = `
            <div class="search-container">
                <input type="text" id="recipe-search" placeholder="Search recipes...">
                <ul id="recipe-results" class="hidden"></ul>
            </div>
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
        this._elements.searchInput = this._elements.card.querySelector("#recipe-search");
        this._elements.resultsList = this._elements.card.querySelector("#recipe-results");
        this._elements.content = this._elements.card.querySelector(".content");

        this._elements.searchInput.addEventListener("input", () => this.updateSearchResults());
        this._elements.searchInput.addEventListener("focus", () => this.showResults());
        document.addEventListener("click", (event) => this.handleClickOutside(event));
        this._elements.searchInput.addEventListener("keydown", (event) => this.handleKeyboardNavigation(event));
    }

    initSearch() {
        this._searchFuse = new Fuse(this._parsedRecipes, {
            keys: ["name", "alternative_name"],
            threshold: 0.6,
            includeScore: true,
            distance: 3,
            ignoreLocation: true
        });
        this.assignCategoryColors();
        this._elements.searchInput.value = this._hass?.states["input_text.wat_eten_we_vandaag"]?.state || "";
        this.updateSearchResults();
    }

    assignCategoryColors() {
        const categories = [...new Set(this._parsedRecipes.map(r => r.category || "Unknown"))];
        const colors = ["#ff5733", "#33ff57", "#3357ff", "#f1c40f", "#9b59b6", "#e74c3c", "#2ecc71"];
        categories.forEach((category, index) => {
            this._categoryColors[category] = colors[index % colors.length];
        });
    }

    updateSearchResults() {
        const query = this._elements.searchInput.value.trim();
        let results = query ? this._searchFuse.search(query)
                                  .map(r => r.item) : [...this._parsedRecipes].sort((a, b) => a.name.localeCompare(b.name));

        this._elements.resultsList.innerHTML = results.map((recipe, index) => `
            <li data-index="${index}" class="recipe-item">
                <span class="recipe-category" style="background-color: ${this._categoryColors[recipe.category || "Unknown"]}">${recipe.category || "Unknown"}</span>
                ${recipe.name}
            </li>
        `).join("");

        this.showResults();
        this._elements.resultsList.querySelectorAll(".recipe-item").forEach(item => {
            item.addEventListener("click", () => this.selectRecipe(item.dataset.index));
        });
    }

    showResults() {
        this._elements.resultsList.classList.remove("hidden");
    }

    handleClickOutside(event) {
        if (!this._elements.card.contains(event.target)) {
            this._elements.resultsList.classList.add("hidden");
        }
    }

    handleKeyboardNavigation(event) {
        const items = Array.from(this._elements.resultsList.children);
        let index = items.findIndex(item => item.classList.contains("selected"));

        if (event.key === "ArrowDown") {
            event.preventDefault();
            if (index < items.length - 1) index++;
        } else if (event.key === "ArrowUp") {
            event.preventDefault();
            if (index > 0) index--;
        } else if (event.key === "Enter" && index >= 0) {
            event.preventDefault();
            this.selectRecipe(items[index].dataset.index);
        } else if (event.key === "Escape") {
            this._elements.resultsList.classList.add("hidden");
            return;
        }

        items.forEach(item => item.classList.remove("selected"));
        if (index >= 0) items[index].classList.add("selected");
    }

    selectRecipe(index) {
        this._recipeIndex = index;
        this.doFillContent();
        this._elements.resultsList.classList.add("hidden");
    }

    doFillContent() {
        this.recipe = this._parsedRecipes[this._recipeIndex];
        if (!this.recipe) {
            this._elements.content.innerHTML = `Geen recepten gevonden voor ${this._hass.states["input_text.wat_eten_we_vandaag"].state}`;
            return;
        }

        this._elements.content.innerHTML = `
            <div class="recipe-title">${this.recipe.name}</div>
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
    }

    doFillCard() {
        this.doFillSelect();
        this.doFillContent();
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