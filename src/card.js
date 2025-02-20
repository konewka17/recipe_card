// import * as yaml from "https://unpkg.com/js-yaml?module"
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
        <ul id="recipe-results" class="search-results"></ul>
    `;

        const searchInput = this._elements.selectdiv.querySelector("#recipe-search");
        const resultsList = this._elements.selectdiv.querySelector("#recipe-results");

        searchInput.addEventListener("input", () => this.updateSearchResults(searchInput.value, resultsList));
    }

    updateSearchResults(query, resultsList) {
        if (!query.trim()) {
            resultsList.innerHTML = "";
            return;
        }

        const fuse = new Fuse(this._parsedRecipes, {
            keys: ["name", "alternative_name"],
            threshold: 0.3,
            ignoreLocation: true
        });

        const results = fuse.search(query).slice(0, 10); // Limit to top 10 results
        resultsList.innerHTML = results
            .map(result => `<li data-index="${result.refIndex}">${result.item.name}</li>`)
            .join("");

        resultsList.querySelectorAll("li").forEach(li => {
            li.addEventListener("click", () => {
                this._recipeIndex = li.getAttribute("data-index");
                searchInput.value = this._parsedRecipes[this._recipeIndex].name; // Update input field
                resultsList.innerHTML = ""; // Clear results
                this.doFillContent(); // Load the selected recipe
            });
        });
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