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
    _basePersons;
    _currentPersons;
    _quantityRegex = /(?<!persons: )([0-9¼½¾]+(?:\s*(?:[.,\-–\/]|(?:tot|à|a))\s*[0-9¼½¾]+)*)(?: ?(?:(min(?:uten|uut)?\.?|uur|graden|° ?C?|pers(?:\.|onen))|([^\s\d¼½¾()]*)))(?=[^A-Za-z])/g;

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
            <div class="search-container">
                <input type="text" id="recipe-search" placeholder="Search for a recipe..." autocomplete="off">
                <ha-icon id="clear-search" icon="mdi:close-circle"></ha-icon>
            </div>
            <ul id="recipe-results" class="search-results"></ul>
        `;

        const searchInput = this._elements.selectdiv.querySelector("#recipe-search");
        const resultsList = this._elements.selectdiv.querySelector("#recipe-results");
        const clearIcon = this._elements.selectdiv.querySelector("#clear-search");

        let selectedIndex = -1;

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

        searchInput.addEventListener("focusout", (event) => {
            setTimeout(() => {
                if (!this._elements.selectdiv.contains(document.activeElement)) {
                    this.clearSearchResults();
                }
            }, 150);
        });

        // Clear input when clicking the clear icon
        clearIcon.addEventListener("click", () => {
            searchInput.value = "";
            this.clearSearchResults();
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
        let fuse = new Fuse(this._parsedRecipes, {
            keys: ["name", "alternative_name"],
            threshold: 0.3,
            ignoreLocation: true
        });

        let results = fuse.search(query);
        if (results.length === 0) {
            fuse = new Fuse(this._parsedRecipes, {
                keys: ["ingredients", "instructions"],
                threshold: 0.3,
                ignoreLocation: true
            });
            results = fuse.search(query);
        }
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

        const recipeStorage = JSON.parse(localStorage.getItem("recipeStorage")) || {};

        if (recipeStorage.currentRecipe !== this.recipe.name) {
            this.reset_recipe_storage();
        }

        this._basePersons = this.recipe?.persons || 1;
        this._currentPersons = recipeStorage?.persons || this._basePersons;

        this._elements.content.innerHTML = `
            <div class="recipe-header">
                <div class="recipe-title">${this.recipe.name}</div>
                <div class="header-icons"> 
                    <div class="add-icon"><ha-icon icon="mdi:plus-circle-outline"></ha-icon></div>
                    <div class="edit-icon"><ha-icon icon="mdi:pencil"></ha-icon></div>
                </div>
            </div>
            <div class="recipe-content">
                <div class="reset-strikeout-icon"><ha-icon icon="mdi:restart"></ha-icon></div>
                <div class="print-icon"><ha-icon icon="mdi:printer"></ha-icon></div>
                ${this.recipe?.persons ? `
                    <div class="persons-control">
                        <button class="persons-minus">-</button>
                        <span class="persons-count">${this._currentPersons}</span>
                        <span class="persons-label">personen</span>
                        <button class="persons-plus">+</button>
                    </div>` : ""}
                <i>Ingrediënten</i>
                <ul class="ingredient-list">
                    ${this.recipe.ingredients.map((item, index) => this.yamlEntryToLi(item, `${index}`)).join("")}
                </ul>
                <br/> 
                <i>Bereiding:</i>
                <ol class="instruction-list">
                    ${this.recipe.instructions.map((step, index) => this.yamlEntryToLi(step, `${index}`)).join("")}
                </ol>
            </div>
        `;

        this._elements.editButton = this._elements.content.querySelector(".edit-icon");
        this._elements.editButton.addEventListener("click", () => this.toggleEditMode());

        this._elements.addButton = this._elements.content.querySelector(".add-icon");
        this._elements.addButton.addEventListener("click", () => this.createNewRecipe());

        this._elements.resetStrikeoutButton = this._elements.content.querySelector(".reset-strikeout-icon");
        this._elements.resetStrikeoutButton.addEventListener("click", () => {
            this.reset_recipe_storage();
            this.doFillContent();
        });

        this._elements.printButton = this._elements.content.querySelector(".print-icon");
        this._elements.printButton.addEventListener("click", () => this.printRecipe());

        this._elements.personsMinus = this._elements.content.querySelector(".persons-minus");
        this._elements.personsMinus.addEventListener("click", () => {
            if (this._currentPersons > 1) {
                this._currentPersons--;
                this._elements.personsCount.textContent = this._currentPersons;
                this.updatePersonsStorageAndScale();
                this.scaleAllQuantities();
            }
        });

        this._elements.personsPlus = this._elements.content.querySelector(".persons-plus");
        this._elements.personsPlus.addEventListener("click", () => {
            this._currentPersons++;
            this._elements.personsCount.textContent = this._currentPersons;
            this.updatePersonsStorageAndScale();
            this.scaleAllQuantities();
        });

        this._elements.personsCount = this._elements.content.querySelector(".persons-count");

        this.makeListToggleable(".ingredient-list li", "ingredients");
        this.makeListToggleable(".instruction-list li", "instructions");
    }

    reset_recipe_storage() {
        let recipeStorage = {
            currentRecipe: this.recipe.name, ingredients: {}, instructions: {}, persons: this._basePersons
        };
        localStorage.setItem("recipeStorage", JSON.stringify(recipeStorage));
    }

    updatePersonsStorageAndScale() {
        let recipeStorage = JSON.parse(localStorage.getItem("recipeStorage")) || {};
        recipeStorage.persons = this._currentPersons;
        localStorage.setItem("recipeStorage", JSON.stringify(recipeStorage));
    };

    scaleAllQuantities() {
        const multiplier = this._currentPersons / this._basePersons;
        const spans = this._elements.content.querySelectorAll(".recipe-quantity");

        spans.forEach(span => this.scaleQuantitySpan(span, multiplier));
    }

    scaleQuantitySpan(span, multiplier) {
        const orig = span.dataset.original;
        if (!orig) return;

        const scaled = this.computeScaledQuantity(orig, multiplier);

        span.textContent = scaled;
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

    async createNewRecipe() {
        const recipeName = prompt("Voer de naam in voor het nieuwe recept:");

        if (!recipeName) {
            return; // Gebruiker heeft geannuleerd
        }

        try {
            await this._hass.callService("recipes", "create_recipe", {
                recipe_name: recipeName
            });
            await this.doFetchRecipes();
            const newIndex = this._parsedRecipes.findIndex(recipe => recipe.name === recipeName);
            if (newIndex !== -1) {
                this._recipeIndex = newIndex;
                this.doFillContent();
            }
        } catch (error) {
            alert("Fout bij het aanmaken van het recept: " + error.message);
        }
    }

    makeListToggleable(selector, storageKey) {
        const listItems = this._elements.content.querySelectorAll(selector);
        const recipeStorage = JSON.parse(localStorage.getItem("recipeStorage")) || {};
        const storedState = recipeStorage[storageKey] || {};

        listItems.forEach(item => {
            const index = item.getAttribute("data-index");

            if (storedState[index]) {
                item.classList.add("checked");
            }

            item.addEventListener("click", (event) => {
                const recipeStorage = JSON.parse(localStorage.getItem("recipeStorage")) || {};
                const storedState = recipeStorage[storageKey] || {};
                event.stopPropagation();
                item.classList.toggle("checked");
                storedState[index] = item.classList.contains("checked");
                recipeStorage[storageKey] = storedState;
                localStorage.setItem("recipeStorage", JSON.stringify(recipeStorage));
            });
        });
    }


    // helpers
    yamlEntryToLi(yamlEntry, parentIndex = "") {
        if (Array.isArray(yamlEntry)) {
            return `<ul>` + yamlEntry.map((item, index) => this.yamlEntryToLi(item, `${parentIndex}-${index}`))
                                     .join("") + `</ul>`;
        } else if (typeof yamlEntry === "object") {
            let [key, value] = Object.entries(yamlEntry)[0];
            key = key.charAt(0).toUpperCase() + key.slice(1);
            let nestedContent = "";

            if (Array.isArray(value)) {
                nestedContent = `<ul>` + value.map((item, index) => this.yamlEntryToLi(item, `${parentIndex}-${index}`))
                                              .join("") + `</ul>`;
            } else {
                const text = value ? this.markQuantitiesInText(String(value), parentIndex) : "";
                nestedContent = text ? `: ${text}` : "";
            }

            return `<li data-index="${parentIndex}"><span class="ingredient">${key}</span><span class="amount">${nestedContent}</span></li>`;
        } else {
            const processed = this.markQuantitiesInText(String(yamlEntry), parentIndex);
            return `<li data-index="${parentIndex}">${processed}</li>`;
        }
    }

    markQuantitiesInText(text, parentIndex) {
        if (!text) return text;

        const regex = this._quantityRegex;
        regex.lastIndex = 0;

        let result = "";
        let lastIndex = 0;
        let match;

        while ((match = regex.exec(text)) !== null) {
            const fullMatch = match[0];
            const quantityPart = match[1];
            const unitPart = fullMatch.replace(quantityPart, "").trim();

            const isSpecialUnit = /^(min(?:uten|uut)?\.?|uur|graden|° ?C?|pers(?:\.|onen))$/i.test(unitPart);

            result += text.slice(lastIndex, match.index);

            if (isSpecialUnit) {
                result += fullMatch; // leave unchanged
            } else {
                result += `<strong><span 
                class="recipe-quantity"
                data-original="${quantityPart.replace(/"/g, "&quot;")}"
                data-index="${parentIndex}"
            >${quantityPart}</span></strong>${unitPart ? " " + unitPart : ""}`;
            }

            lastIndex = regex.lastIndex;
        }

        result += text.slice(lastIndex);
        return result;
    }

    computeScaledQuantity(originalText, multiplier) {
        if (!originalText) return originalText;

        // Fraction-char map
        const fracMap = {
            "¼": 0.25,
            "½": 0.5,
            "¾": 0.75
        };

        // Reverse map for pretty-printing
        const fracReverse = {
            0.25: "¼",
            0.5: "½",
            0.75: "¾"
        };

        // Convert fraction characters into numbers
        const parseNumber = (str) => {
            str = str.trim();

            // If pure fraction char
            if (fracMap[str] != null) {
                return fracMap[str];
            }

            // If fraction appended to a number (e.g. "1½")
            const lastChar = str.slice(-1);
            if (fracMap[lastChar] != null) {
                const base = parseFloat(str.slice(0, -1)) || 0;
                return base + fracMap[lastChar];
            }

            // If "1/2" or "3/4"
            if (str.includes("/")) {
                const [a, b] = str.split("/").map(Number);
                if (!isNaN(a) && !isNaN(b) && b !== 0) {
                    return a / b;
                }
            }

            // Normal decimal or integer
            const num = parseFloat(str.replace(",", "."));
            return isNaN(num) ? null : num;
        };

        // Convert a number back into a readable pretty fraction or decimal
        const formatNumber = (num) => {
            if (num == null || isNaN(num)) return "";

            // Check for whole number
            if (Math.abs(num - Math.round(num)) < 0.01) {
                return String(Math.round(num));
            }

            // Try to match fractions
            const fractional = num - Math.floor(num);
            const roundedFrac = Math.round(fractional * 100) / 100;

            if (fracReverse[roundedFrac]) {
                const whole = Math.floor(num);
                return whole > 0 ? `${whole}${fracReverse[roundedFrac]}` : fracReverse[roundedFrac];
            }

            // fallback decimal with at most 2 decimals
            return String(Math.round(num * 100) / 100).replace(".", ",");
        };

        // Identify separators that indicate a range
        const separators = ["-", " tot ", " à ", " a ", "–"];

        let sepUsed = null;
        let parts = [originalText];

        for (const sep of separators) {
            if (originalText.includes(sep)) {
                sepUsed = sep;
                parts = originalText.split(sep);
                break;
            }
        }

        // Single number
        if (!sepUsed) {
            const value = parseNumber(originalText);
            if (value == null) return originalText;
            return formatNumber(value * multiplier);
        }

        // Two-number range
        const firstVal = parseNumber(parts[0]);
        const secondVal = parseNumber(parts[1]);

        if (firstVal == null || secondVal == null) {
            return originalText;
        }

        const scaled1 = formatNumber(firstVal * multiplier);
        const scaled2 = formatNumber(secondVal * multiplier);

        return `${scaled1}${sepUsed}${scaled2}`;
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